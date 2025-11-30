"""
Утилиты для работы с SSH подключениями
"""
import io
import shlex
import paramiko
import threading
import time
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, Union
from .models import Server, AllocatedServer


class SSHConnectionError(Exception):
    """Ошибка подключения к серверу"""
    pass


class SSHConnectionPool:
    """Пул SSH соединений для переиспользования"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(SSHConnectionPool, cls).__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._connections: Dict[int, Dict[str, Any]] = {}  # {server_id: {client, last_used, created_at}}
        self._pool_lock = threading.RLock()
        self._reconnect_interval = 600  # 10 минут в секундах
        self._initialized = True
    
    def _get_connection_key(self, server: Server) -> int:
        """Генерирует ключ для соединения"""
        return server.id
    
    def _is_connection_valid(self, client: paramiko.SSHClient) -> bool:
        """Проверяет, валидно ли соединение (быстрая проверка)"""
        try:
            transport = client.get_transport()
            if transport is None:
                return False
            # Быстрая проверка без send_ignore - это может быть медленным
            return transport.is_active()
        except Exception:
            return False
    
    def _should_reconnect(self, conn_info: Dict[str, Any]) -> bool:
        """Проверяет, нужно ли переподключиться"""
        current_time = time.time()
        time_since_creation = current_time - conn_info['created_at']
        return time_since_creation >= self._reconnect_interval
    
    def get_connection(self, server: Server, timeout: int = 5) -> paramiko.SSHClient:
        """
        Получает соединение из пула или создает новое
        
        Args:
            server: Объект сервера
            timeout: Таймаут подключения
            
        Returns:
            SSHClient объект
        """
        if isinstance(server, AllocatedServer):
            raise SSHConnectionError("Выданные серверы используют локальную файловую систему, SSH не требуется")
        
        key = self._get_connection_key(server)
        
        with self._pool_lock:
            # Проверяем, есть ли соединение в пуле
            if key in self._connections:
                conn_info = self._connections[key]
                client = conn_info['client']
                
                # Быстрая проверка: только если не нужно переподключаться и соединение активно
                if not self._should_reconnect(conn_info):
                    # Быстрая проверка валидности без блокирующих операций
                    if self._is_connection_valid(client):
                        # Обновляем время последнего использования
                        conn_info['last_used'] = time.time()
                        return client
                
                # Соединение невалидно или нужно переподключиться - закрываем и удаляем
                try:
                    client.close()
                except Exception:
                    pass
                del self._connections[key]
            
            # Создаем новое соединение
            client = SSHClientFactory.connect(server, timeout=timeout)
            self._connections[key] = {
                'client': client,
                'last_used': time.time(),
                'created_at': time.time()
            }
            
            return client
    
    def close_connection(self, server: Server):
        """Закрывает соединение для сервера"""
        key = self._get_connection_key(server)
        with self._pool_lock:
            if key in self._connections:
                try:
                    self._connections[key]['client'].close()
                except Exception:
                    pass
                del self._connections[key]
    
    def close_all(self):
        """Закрывает все соединения"""
        with self._pool_lock:
            for conn_info in self._connections.values():
                try:
                    conn_info['client'].close()
                except Exception:
                    pass
            self._connections.clear()
    
    def cleanup_inactive(self, max_idle_time: int = 1800):
        """Очищает неактивные соединения (не использовались более max_idle_time секунд)"""
        current_time = time.time()
        with self._pool_lock:
            keys_to_remove = []
            for key, conn_info in self._connections.items():
                idle_time = current_time - conn_info['last_used']
                if idle_time > max_idle_time:
                    keys_to_remove.append(key)
            
            for key in keys_to_remove:
                try:
                    self._connections[key]['client'].close()
                except Exception:
                    pass
                del self._connections[key]


# Глобальный экземпляр пула соединений
_connection_pool = SSHConnectionPool()


class SSHClientFactory:
    """Фабрика для создания SSH подключений"""
    
    @staticmethod
    def connect(server: Server, timeout: int = 5) -> paramiko.SSHClient:
        """
        Создает SSH подключение к серверу
        
        Args:
            server: Объект сервера
            timeout: Таймаут подключения в секундах
            
        Returns:
            SSHClient объект
            
        Raises:
            SSHConnectionError: При ошибке подключения
        """
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            # Для AllocatedServer не используем SSH - это локальные серверы
            # Эта функция не должна вызываться для AllocatedServer
            if isinstance(server, AllocatedServer):
                raise SSHConnectionError("Выданные серверы используют локальную файловую систему, SSH не требуется")
            
            if server.auth_type == Server.AUTH_PASSWORD:
                client.connect(
                    hostname=server.host,
                    port=server.port,
                    username=server.username,
                    password=server.password or None,
                    timeout=timeout,
                    look_for_keys=False,
                    allow_agent=False,
                )
            else:
                # Аутентификация по приватному ключу
                key_file = io.StringIO(server.private_key)
                pkey = None
                
                # Пробуем разные типы ключей
                key_types = [
                    (paramiko.RSAKey, 'RSA'),
                    (paramiko.Ed25519Key, 'Ed25519'),
                    (paramiko.ECDSAKey, 'ECDSA'),
                ]
                
                # DSSKey может быть недоступен в некоторых версиях
                try:
                    key_types.append((paramiko.DSSKey, 'DSS'))
                except AttributeError:
                    pass
                
                for key_class, key_name in key_types:
                    try:
                        key_file.seek(0)
                        pkey = key_class.from_private_key(
                            key_file,
                            password=server.passphrase or None
                        )
                        break
                    except (paramiko.ssh_exception.SSHException, ValueError):
                        continue
                
                if pkey is None:
                    raise SSHConnectionError("Не удалось загрузить приватный ключ. Проверьте формат ключа.")
                
                client.connect(
                    hostname=server.host,
                    port=server.port,
                    username=server.username,
                    pkey=pkey,
                    timeout=timeout,
                    look_for_keys=False,
                    allow_agent=False,
                )
            
            return client
            
        except Exception as e:
            raise SSHConnectionError(f"Ошибка подключения: {str(e)}")


def exec_command(server: Union[Server, AllocatedServer], command: str, timeout: int = 30) -> Tuple[int, str, str]:
    """
    Выполняет команду на удаленном сервере
    Для SSH серверов использует интерактивную сессию для быстрого выполнения
    
    Args:
        server: Объект сервера
        command: Команда для выполнения
        timeout: Таймаут выполнения команды
        
    Returns:
        Tuple (exit_code, stdout, stderr)
    """
    # Для AllocatedServer не используем SSH
    if isinstance(server, AllocatedServer):
        raise SSHConnectionError("Выданные серверы используют локальную файловую систему")
    
    # Используем интерактивную сессию для быстрого выполнения команд
    from .ssh_interactive import exec_command_interactive
    return exec_command_interactive(server, command, timeout)


def list_directory(server: Union[Server, AllocatedServer], path: str = '~') -> Dict[str, Any]:
    """
    Получает список файлов в директории
    
    Args:
        server: Объект сервера
        path: Путь к директории
        
    Returns:
        Dict с результатами: {code, stdout, stderr}
    """
    # Для SSH серверов обрабатываем путь ~ отдельно
    if isinstance(server, Server):
        if path == '~' or path == '':
            # Для SSH серверов при пути ~ или пустом пути показываем домашнюю директорию пользователя
            # Используем команду, которая гарантированно покажет файлы в домашней директории
            command = "bash -c 'cd ~ && ls -lah' 2>&1 || ls -lah $HOME 2>&1 || ls -lah ~ 2>&1 || echo 'Directory not found'"
        elif path.startswith('~/'):
            # Для путей вида ~/path используем cd ~ && ls -lah path
            relative_path = path[2:]  # Убираем ~/
            safe_path = shlex.quote(relative_path)
            command = f"bash -c 'cd ~ && ls -lah {safe_path}' 2>&1 || ls -lah $HOME/{safe_path} 2>&1 || echo 'Directory not found'"
        else:
            # Для абсолютных путей просто используем ls
            safe_path = shlex.quote(path)
            command = f"ls -lah {safe_path} 2>&1 || echo 'Directory not found'"
    else:
        # Для allocated серверов используем старую логику
        safe_path = shlex.quote(path)
        command = f"ls -lah {safe_path} 2>&1 || echo 'Directory not found'"
    
    code, out, err = exec_command(server, command)
    return {"code": code, "stdout": out, "stderr": err}


def upload_file(server: Union[Server, AllocatedServer], local_file_path: str, remote_file_path: str) -> Dict[str, Any]:
    """
    Загружает файл на удаленный сервер
    
    Args:
        server: Объект сервера
        local_file_path: Путь к локальному файлу (временный файл)
        remote_file_path: Путь на удаленном сервере
        
    Returns:
        Dict с результатами: {success, message}
    """
    if isinstance(server, AllocatedServer):
        raise SSHConnectionError("Выданные серверы используют локальную файловую систему")
    
    # Используем пул соединений
    client = _connection_pool.get_connection(server)
    
    try:
        sftp = client.open_sftp()
        # SFTP.put принимает путь напрямую, не нужно экранировать
        sftp.put(local_file_path, remote_file_path)
        sftp.close()
        return {"success": True, "message": f"Файл успешно загружен в {remote_file_path}"}
    except (paramiko.ssh_exception.SSHException, OSError, IOError) as e:
        # Если соединение разорвано, закрываем его и пробуем переподключиться
        _connection_pool.close_connection(server)
        client = _connection_pool.get_connection(server)
        sftp = client.open_sftp()
        sftp.put(local_file_path, remote_file_path)
        sftp.close()
        return {"success": True, "message": f"Файл успешно загружен в {remote_file_path}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка загрузки файла: {str(e)}"}


def create_file(server: Union[Server, AllocatedServer], file_path: str) -> Dict[str, Any]:
    """
    Создает пустой файл на удаленном сервере
    
    Args:
        server: Объект сервера
        file_path: Путь к файлу
        
    Returns:
        Dict с результатами: {success, message}
    """
    try:
        # Экранируем путь для безопасности
        safe_path = shlex.quote(file_path)
        # Создаем родительские директории если нужно, затем создаем файл
        command = f"mkdir -p $(dirname {safe_path}) && touch {safe_path}"
        exit_code, stdout, stderr = exec_command(server, command)
        
        if exit_code == 0:
            return {"success": True, "message": f"Файл {file_path} успешно создан"}
        else:
            return {"success": False, "message": f"Ошибка создания файла: {stderr or stdout}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка создания файла: {str(e)}"}


def create_directory(server: Union[Server, AllocatedServer], dir_path: str) -> Dict[str, Any]:
    """
    Создает директорию на удаленном сервере
    
    Args:
        server: Объект сервера
        dir_path: Путь к директории
        
    Returns:
        Dict с результатами: {success, message}
    """
    try:
        # Экранируем путь для безопасности
        safe_path = shlex.quote(dir_path)
        # Создаем директорию с родительскими директориями
        command = f"mkdir -p {safe_path}"
        exit_code, stdout, stderr = exec_command(server, command)
        
        if exit_code == 0:
            return {"success": True, "message": f"Директория {dir_path} успешно создана"}
        else:
            return {"success": False, "message": f"Ошибка создания директории: {stderr or stdout}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка создания директории: {str(e)}"}


def rename_file(server: Union[Server, AllocatedServer], old_path: str, new_path: str) -> Dict[str, Any]:
    """
    Переименовывает файл или директорию на удаленном сервере
    
    Args:
        server: Объект сервера
        old_path: Старый путь
        new_path: Новый путь
        
    Returns:
        Dict с результатами: {success, message}
    """
    try:
        safe_old = shlex.quote(old_path)
        safe_new = shlex.quote(new_path)
        command = f"mv {safe_old} {safe_new}"
        exit_code, stdout, stderr = exec_command(server, command)
        
        if exit_code == 0:
            return {"success": True, "message": f"Файл/директория {old_path} успешно переименован(а) в {new_path}"}
        else:
            return {"success": False, "message": f"Ошибка переименования: {stderr or stdout}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка переименования: {str(e)}"}


def read_file(server: Union[Server, AllocatedServer], file_path: str) -> Dict[str, Any]:
    """
    Читает содержимое текстового файла на удаленном сервере
    
    Args:
        server: Объект сервера
        file_path: Путь к файлу
        
    Returns:
        Dict с результатами: {success, content, message}
    """
    try:
        safe_path = shlex.quote(file_path)
        # Используем cat для чтения файла
        command = f"cat {safe_path}"
        exit_code, stdout, stderr = exec_command(server, command)
        
        if exit_code == 0:
            return {"success": True, "content": stdout, "message": "Файл успешно прочитан"}
        else:
            # Проверяем, является ли ошибка проблемой с кодировкой
            if "binary" in stderr.lower() or "cannot" in stderr.lower():
                return {"success": False, "message": "Файл не является текстовым и не может быть отредактирован"}
            return {"success": False, "message": f"Ошибка чтения файла: {stderr or stdout}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка чтения файла: {str(e)}"}


def write_file(server: Union[Server, AllocatedServer], file_path: str, content: str) -> Dict[str, Any]:
    """
    Записывает содержимое в файл на удаленном сервере
    
    Args:
        server: Объект сервера
        file_path: Путь к файлу
        content: Содержимое файла
        
    Returns:
        Dict с результатами: {success, message}
    """
    try:
        safe_path = shlex.quote(file_path)
        # Экранируем содержимое для безопасности
        # Используем base64 для безопасной передачи содержимого
        import base64
        content_b64 = base64.b64encode(content.encode('utf-8')).decode('ascii')
        # Создаем родительские директории если нужно
        dir_path = shlex.quote(str(Path(file_path).parent))
        command = f"mkdir -p {dir_path} && echo {shlex.quote(content_b64)} | base64 -d > {safe_path}"
        exit_code, stdout, stderr = exec_command(server, command)
        
        if exit_code == 0:
            return {"success": True, "message": f"Файл {file_path} успешно сохранен"}
        else:
            return {"success": False, "message": f"Ошибка записи файла: {stderr or stdout}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка записи файла: {str(e)}"}


def search_files(server: Union[Server, AllocatedServer], search_path: str, pattern: str, max_results: int = 100) -> Dict[str, Any]:
    """
    Ищет файлы по имени на удаленном сервере
    
    Args:
        server: Объект сервера
        search_path: Путь для поиска (директория, где искать)
        pattern: Паттерн для поиска (имя файла или часть имени)
        max_results: Максимальное количество результатов
        
    Returns:
        Dict с результатами: {success, files: [список путей], message}
    """
    try:
        safe_path = shlex.quote(search_path)
        safe_pattern = shlex.quote(pattern)
        
        # Используем find для поиска файлов
        # -type f - только файлы (не директории)
        # -name "*pattern*" - поиск по имени с подстановочными знаками
        # 2>/dev/null - скрываем ошибки доступа
        command = f"find {safe_path} -type f -name '*{pattern}*' 2>/dev/null | head -n {max_results}"
        exit_code, stdout, stderr = exec_command(server, command, timeout=60)
        
        if exit_code == 0:
            files = [line.strip() for line in stdout.strip().split('\n') if line.strip()]
            return {
                "success": True,
                "files": files,
                "count": len(files),
                "message": f"Найдено {len(files)} файл(ов)"
            }
        else:
            return {
                "success": False,
                "files": [],
                "count": 0,
                "message": f"Ошибка поиска: {stderr or 'Неизвестная ошибка'}"
            }
    except Exception as e:
        return {
            "success": False,
            "files": [],
            "count": 0,
            "message": f"Ошибка поиска файлов: {str(e)}"
        }


def delete_file(server: Union[Server, AllocatedServer], file_path: str) -> Dict[str, Any]:
    """
    Удаляет файл или директорию на удаленном сервере
    
    Args:
        server: Объект сервера
        file_path: Путь к файлу или директории
        
    Returns:
        Dict с результатами: {success, message}
    """
    try:
        # Экранируем путь для безопасности
        safe_path = shlex.quote(file_path)
        # Используем rm -rf для удаления файлов и директорий
        command = f"rm -rf {safe_path}"
        exit_code, stdout, stderr = exec_command(server, command)
        
        if exit_code == 0:
            return {"success": True, "message": f"Файл/директория {file_path} успешно удален(а)"}
        else:
            return {"success": False, "message": f"Ошибка удаления: {stderr or stdout}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка удаления: {str(e)}"}


def get_system_stats(server: Union[Server, AllocatedServer]) -> Dict[str, Any]:
    """
    Получает базовую статистику системы
    
    Args:
        server: Объект сервера
        
    Returns:
        Dict с результатами: {code, stdout, stderr}
    """
    # Универсальная команда для получения статистики
    # Работает на Linux и macOS
    command = """
    echo "=== CPU ===" && \
    (grep -c ^processor /proc/cpuinfo 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "N/A") && \
    echo "=== Memory ===" && \
    (free -h 2>/dev/null | grep Mem || vm_stat 2>/dev/null | head -5 || echo "N/A") && \
    echo "=== Uptime ===" && \
    (uptime 2>/dev/null || echo "N/A") && \
    echo "=== Disk ===" && \
    (df -h / 2>/dev/null | tail -1 || echo "N/A")
    """
    
    code, out, err = exec_command(server, command)
    return {"code": code, "stdout": out, "stderr": err}


def get_detailed_stats(server: Union[Server, AllocatedServer]) -> Dict[str, Any]:
    """
    Получает детальную статистику системы с процентами использования
    
    Args:
        server: Объект сервера
        
    Returns:
        Dict с метриками: {cpu_percent, memory_percent, memory_used_mb, memory_total_mb,
                          disk_percent, disk_used_gb, disk_total_gb, ...}
    """
    stats = {
        'cpu_percent': None,
        'memory_percent': None,
        'memory_used_mb': None,
        'memory_total_mb': None,
        'disk_percent': None,
        'disk_used_gb': None,
        'disk_total_gb': None,
    }
    
    # Проверяем, что это не AllocatedServer (для них используется другая функция)
    from .models import AllocatedServer as AllocatedServerModel
    if isinstance(server, AllocatedServerModel):
        # Для allocated серверов не используем SSH
        return stats
    
    # Оптимизированная команда - получаем все метрики за один запрос
    # Используем более быстрые команды и объединяем их
    combined_command = """
    (
        # CPU - используем более быструю команду
        cpu=$(top -bn1 2>/dev/null | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}' 2>/dev/null || echo '')
        echo "CPU:$cpu"
        
        # Memory - используем free
        mem=$(free -m 2>/dev/null | grep Mem | awk '{print $3, $2}' || echo '')
        echo "MEM:$mem"
        
        # Disk - используем df
        disk=$(df -BG / 2>/dev/null | tail -1 | awk '{print $3, $2, $5}' | sed 's/G//g' | sed 's/%//' || echo '')
        echo "DISK:$disk"
    ) 2>/dev/null
    """
    
    try:
        code, out, err = exec_command(server, combined_command, timeout=8)
        
        if code == 0 and out:
            lines = out.strip().split('\n')
            for line in lines:
                if line.startswith('CPU:'):
                    cpu_str = line.replace('CPU:', '').strip()
                    if cpu_str:
                        try:
                            cpu_val = float(cpu_str)
                            if 0 <= cpu_val <= 100:
                                stats['cpu_percent'] = round(cpu_val, 2)
                        except (ValueError, TypeError):
                            pass
                
                elif line.startswith('MEM:'):
                    mem_str = line.replace('MEM:', '').strip()
                    if mem_str:
                        parts = mem_str.split()
                        if len(parts) >= 2:
                            try:
                                memory_used = float(parts[0])
                                memory_total = float(parts[1])
                                if memory_total > 0:
                                    stats['memory_used_mb'] = round(memory_used, 2)
                                    stats['memory_total_mb'] = round(memory_total, 2)
                                    stats['memory_percent'] = round((memory_used / memory_total) * 100, 2)
                            except (ValueError, TypeError, ZeroDivisionError):
                                pass
                
                elif line.startswith('DISK:'):
                    disk_str = line.replace('DISK:', '').strip()
                    if disk_str:
                        parts = disk_str.split()
                        if len(parts) >= 3:
                            try:
                                disk_used = float(parts[0])
                                disk_total = float(parts[1])
                                disk_percent = float(parts[2])
                                if disk_total > 0 and 0 <= disk_percent <= 100:
                                    stats['disk_used_gb'] = round(disk_used, 2)
                                    stats['disk_total_gb'] = round(disk_total, 2)
                                    stats['disk_percent'] = round(disk_percent, 2)
                            except (ValueError, TypeError):
                                pass
        
    except Exception as e:
        # В случае критической ошибки логируем, но возвращаем пустые значения
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Ошибка получения метрик для сервера {server.id}: {str(e)}")
    
    return stats


def test_connection(server: Union[Server, AllocatedServer]) -> Tuple[bool, str]:
    """
    Тестирует подключение к серверу
    
    Args:
        server: Объект сервера
        
    Returns:
        Tuple (success, message)
    """
    try:
        client = SSHClientFactory.connect(server, timeout=5)
        client.close()
        return True, "Подключение успешно"
    except SSHConnectionError as e:
        return False, str(e)
    except Exception as e:
        return False, f"Неизвестная ошибка: {str(e)}"

