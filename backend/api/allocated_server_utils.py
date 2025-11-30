"""
Утилиты для работы с выданными серверами (виртуальная файловая система)
"""
import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, Tuple
from django.conf import settings
from .models import AllocatedServer


def get_server_root(server: AllocatedServer) -> Path:
    """
    Получает корневую директорию для сервера пользователя
    """
    server_root = settings.ALLOCATED_SERVERS_ROOT / f"user_{server.user.id}" / f"server_{server.id}"
    server_root.mkdir(parents=True, exist_ok=True)
    return server_root


def normalize_path(server: AllocatedServer, path: str) -> Path:
    """
    Нормализует путь относительно корневой директории сервера
    Безопасно: предотвращает выход за пределы корневой директории
    """
    server_root = get_server_root(server)
    server_root_resolved = server_root.resolve()
    
    # Обрабатываем ~ как корневую директорию
    if path == '~' or path == '':
        return server_root_resolved
    
    if path.startswith('~/'):
        path = path[2:]  # Убираем ~/
    
    # Убираем начальный слэш
    if path.startswith('/'):
        path = path[1:]
    
    # Блокируем попытки выйти за пределы (.., ../.., и т.д.)
    # Разбиваем путь на части и проверяем каждую
    parts = path.split('/')
    safe_parts = []
    for part in parts:
        part = part.strip()
        if not part or part == '.':
            continue
        if part == '..':
            # Попытка выйти на уровень выше - игнорируем
            continue
        # Убираем любые другие опасные символы
        if '..' in part or part.startswith('/'):
            continue
        safe_parts.append(part)
    
    # Собираем безопасный путь
    if safe_parts:
        normalized = server_root_resolved
        for part in safe_parts:
            normalized = normalized / part
        normalized = normalized.resolve()
    else:
        normalized = server_root_resolved
    
    # Финальная проверка: путь должен быть внутри корневой директории
    try:
        normalized.relative_to(server_root_resolved)
    except ValueError:
        # Попытка выйти за пределы - возвращаем корневую директорию
        return server_root_resolved
    
    return normalized


def get_relative_path(server: AllocatedServer, absolute_path: Path) -> str:
    """
    Преобразует абсолютный путь в относительный от корня сервера
    Возвращает путь в формате ~ или ~/subdir
    """
    server_root = get_server_root(server).resolve()
    try:
        rel_path = absolute_path.resolve().relative_to(server_root)
        if str(rel_path) == '.':
            return '~'
        return f'~/{rel_path}'
    except ValueError:
        # Путь вне корня сервера - возвращаем ~
        return '~'


def exec_command_local(server: AllocatedServer, command: str, timeout: int = 30) -> Tuple[int, str, str]:
    """
    Выполняет команду локально в директории сервера
    Для allocated серверов преобразует pwd в относительный путь
    """
    server_root = get_server_root(server)
    
    # Безопасные команды (только чтение/запись файлов)
    # Блокируем опасные команды
    dangerous_commands = ['rm -rf', 'sudo', 'su', 'chmod', 'chown', 'dd', 'mkfs', 'fdisk']
    command_lower = command.lower()
    for dangerous in dangerous_commands:
        if dangerous in command_lower:
            return 1, '', f'Команда "{dangerous}" запрещена для безопасности'
    
    # Блокируем попытки выйти за пределы корневой директории
    # Проверяем команды cd с .. или абсолютными путями
    if command.strip().startswith('cd '):
        cd_path = command.strip()[3:].strip()
        # Убираем кавычки если есть
        if (cd_path.startswith('"') and cd_path.endswith('"')) or (cd_path.startswith("'") and cd_path.endswith("'")):
            cd_path = cd_path[1:-1]
        
        # Блокируем абсолютные пути и попытки выйти выше
        if cd_path.startswith('/') or '..' in cd_path:
            # Проверяем, что путь нормализован и находится внутри корня
            normalized = normalize_path(server, cd_path)
            if normalized.resolve() != server_root.resolve():
                # Проверяем, что нормализованный путь все еще внутри корня
                try:
                    normalized.resolve().relative_to(server_root.resolve())
                except ValueError:
                    return 1, '', 'Доступ запрещен: выход за пределы директории сервера'
    
    # Выполняем команду как есть, без автоматических модификаций
    # Пользователь может сам указать нужные флаги при необходимости
    
    try:
        # Выполняем команду в директории сервера
        # Устанавливаем переменные окружения для правильной работы pip
        # Настраиваем CARGO_HOME и RUSTUP_HOME внутри venv, чтобы папка Library создавалась там
        env = os.environ.copy()
        env['HOME'] = str(server_root)
        env['XDG_CACHE_HOME'] = str(server_root / '.cache')
        
        # Если команда связана с pip install и venv существует, настраиваем переменные для Rust/Cargo
        # чтобы папка Library создавалась внутри venv, а не в корне сервера
        venv_path = server_root / 'venv'
        if 'pip install' in command.lower() and venv_path.exists():
            # Настраиваем CARGO_HOME и RUSTUP_HOME внутри venv
            env['CARGO_HOME'] = str(venv_path / '.cargo')
            env['RUSTUP_HOME'] = str(venv_path / '.rustup')
            # Настраиваем кэш внутри venv
            env['XDG_CACHE_HOME'] = str(venv_path / '.cache')
            # На macOS папка Library создается в ~/Library/Caches
            # Создаем директорию Library внутри venv и указываем на неё через переменную
            venv_library = venv_path / 'Library' / 'Caches'
            venv_library.mkdir(parents=True, exist_ok=True)
            # Создаем директории внутри venv, если их нет
            (venv_path / '.cargo').mkdir(exist_ok=True)
            (venv_path / '.rustup').mkdir(exist_ok=True)
            (venv_path / '.cache').mkdir(exist_ok=True)
            # Устанавливаем переменную для кэша Rust, чтобы папка Library создавалась в venv
            # Это работает на macOS, где папка Library создается в ~/Library/Caches
            # Временно меняем HOME только для процессов компиляции Rust/Cargo
            # Но сохраняем оригинальный HOME для pip
            env['_ORIGINAL_HOME'] = str(server_root)
            # Для Rust/Cargo процессов устанавливаем HOME в venv
            # Это заставит их создавать папку Library внутри venv/Library
            env['HOME'] = str(venv_path)
        
        # Определяем текущую рабочую директорию для команды
        # Если команда содержит cd, нужно отследить изменение директории
        current_cwd = server_root
        
        # Если команда содержит cd, извлекаем путь и нормализуем его
        if command.strip().startswith('cd '):
            cd_path = command.strip()[3:].strip()
            # Убираем кавычки если есть
            if (cd_path.startswith('"') and cd_path.endswith('"')) or (cd_path.startswith("'") and cd_path.endswith("'")):
                cd_path = cd_path[1:-1]
            
            # Нормализуем путь
            normalized = normalize_path(server, cd_path)
            current_cwd = normalized
        
        process = subprocess.run(
            command,
            shell=True,
            cwd=str(current_cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env
        )
        
        # Если команда была pwd, преобразуем вывод в относительный путь
        if command.strip() == 'pwd' or command.strip().endswith(' && pwd'):
            if process.returncode == 0 and process.stdout:
                try:
                    abs_path = Path(process.stdout.strip())
                    rel_path = get_relative_path(server, abs_path)
                    return process.returncode, rel_path + '\n', process.stderr
                except Exception:
                    # Если не удалось преобразовать, возвращаем как есть
                    pass
        
        return process.returncode, process.stdout, process.stderr
    except subprocess.TimeoutExpired:
        return 1, '', 'Команда превысила время ожидания'
    except Exception as e:
        return 1, '', str(e)


def list_directory_local(server: AllocatedServer, path: str = '~') -> Dict[str, Any]:
    """
    Получает список файлов в директории (локально)
    Показывает только файлы внутри корневой директории сервера
    """
    try:
        target_path = normalize_path(server, path)
        server_root = get_server_root(server).resolve()
        
        # Дополнительная проверка безопасности
        try:
            target_path.resolve().relative_to(server_root)
        except ValueError:
            # Попытка выйти за пределы - возвращаем корневую директорию
            target_path = server_root
        
        if not target_path.exists():
            return {"code": 1, "stdout": "", "stderr": f"Directory not found: {path}"}
        
        if not target_path.is_dir():
            return {"code": 1, "stdout": "", "stderr": f"Not a directory: {path}"}
        
        # Используем ls -lah для форматирования
        # Вычисляем относительный путь от корня сервера
        try:
            rel_path = target_path.relative_to(server_root)
            if str(rel_path) == '.':
                cmd_path = '.'
            else:
                cmd_path = str(rel_path)
        except ValueError:
            cmd_path = '.'
        
        # Используем ls -lah, но фильтруем . и .. для безопасности
        exit_code, stdout, stderr = exec_command_local(server, f'ls -lah "{cmd_path}"')
        
        # Фильтруем системные записи . и .. из вывода
        if stdout:
            lines = stdout.split('\n')
            filtered_lines = []
            for line in lines:
                # Пропускаем строки с . и .. (но оставляем заголовок "total")
                if line.strip() and not line.strip().startswith('total'):
                    # Проверяем, не является ли это записью . или ..
                    parts = line.strip().split()
                    if len(parts) >= 9:
                        name = ' '.join(parts[8:])
                        if name in ['.', '..']:
                            continue
                filtered_lines.append(line)
            stdout = '\n'.join(filtered_lines)
        
        return {"code": exit_code, "stdout": stdout, "stderr": stderr}
    except Exception as e:
        return {"code": 1, "stdout": "", "stderr": str(e)}


def upload_file_local(server: AllocatedServer, local_file_path: str, remote_file_path: str) -> Dict[str, Any]:
    """
    Загружает файл в директорию сервера (локально)
    """
    try:
        target_path = normalize_path(server, remote_file_path)
        
        # Если путь указывает на директорию, используем имя исходного файла
        if target_path.is_dir() or target_path.suffix == '':
            source_name = Path(local_file_path).name
            target_path = target_path / source_name
        
        # Создаем родительские директории если нужно
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Копируем файл
        shutil.copy2(local_file_path, target_path)
        
        return {"success": True, "message": f"Файл успешно загружен в {remote_file_path}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка загрузки файла: {str(e)}"}


def create_file_local(server: AllocatedServer, file_path: str) -> Dict[str, Any]:
    """
    Создает пустой файл (локально)
    """
    try:
        target_path = normalize_path(server, file_path)
        
        # Проверяем, что путь находится внутри корневой директории
        server_root = get_server_root(server)
        try:
            target_path.resolve().relative_to(server_root.resolve())
        except ValueError:
            return {"success": False, "message": "Доступ запрещен: выход за пределы директории сервера"}
        
        # Проверяем, что файл еще не существует
        if target_path.exists():
            return {"success": False, "message": f"Файл уже существует: {file_path}"}
        
        # Создаем родительские директории если нужно
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Создаем пустой файл
        target_path.touch()
        
        return {"success": True, "message": f"Файл {file_path} успешно создан"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка создания файла: {str(e)}"}


def create_directory_local(server: AllocatedServer, dir_path: str) -> Dict[str, Any]:
    """
    Создает директорию (локально)
    """
    try:
        target_path = normalize_path(server, dir_path)
        
        # Проверяем, что путь находится внутри корневой директории
        server_root = get_server_root(server)
        try:
            target_path.resolve().relative_to(server_root.resolve())
        except ValueError:
            return {"success": False, "message": "Доступ запрещен: выход за пределы директории сервера"}
        
        # Проверяем, что директория еще не существует
        if target_path.exists():
            return {"success": False, "message": f"Директория уже существует: {dir_path}"}
        
        # Создаем директорию
        target_path.mkdir(parents=True, exist_ok=True)
        
        return {"success": True, "message": f"Директория {dir_path} успешно создана"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка создания директории: {str(e)}"}


def rename_file_local(server: AllocatedServer, old_path: str, new_path: str) -> Dict[str, Any]:
    """
    Переименовывает файл или директорию (локально)
    """
    try:
        old_target = normalize_path(server, old_path)
        new_target = normalize_path(server, new_path)
        
        # Проверяем, что оба пути находятся внутри корневой директории
        server_root = get_server_root(server)
        try:
            old_target.resolve().relative_to(server_root.resolve())
            new_target.resolve().relative_to(server_root.resolve())
        except ValueError:
            return {"success": False, "message": "Доступ запрещен: выход за пределы директории сервера"}
        
        if not old_target.exists():
            return {"success": False, "message": f"Файл или директория не найдены: {old_path}"}
        
        if new_target.exists():
            return {"success": False, "message": f"Файл или директория уже существует: {new_path}"}
        
        # Переименовываем
        old_target.rename(new_target)
        
        return {"success": True, "message": f"Файл/директория {old_path} успешно переименован(а) в {new_path}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка переименования: {str(e)}"}


def read_file_local(server: AllocatedServer, file_path: str) -> Dict[str, Any]:
    """
    Читает содержимое файла (локально)
    """
    try:
        target_path = normalize_path(server, file_path)
        
        # Проверяем, что путь находится внутри корневой директории
        server_root = get_server_root(server)
        try:
            target_path.resolve().relative_to(server_root.resolve())
        except ValueError:
            return {"success": False, "message": "Доступ запрещен: выход за пределы директории сервера"}
        
        if not target_path.exists():
            return {"success": False, "message": f"Файл не найден: {file_path}"}
        
        if target_path.is_dir():
            return {"success": False, "message": f"Это директория, а не файл: {file_path}"}
        
        # Читаем файл
        try:
            content = target_path.read_text(encoding='utf-8')
            return {"success": True, "content": content, "message": "Файл успешно прочитан"}
        except UnicodeDecodeError:
            # Если файл не текстовый, возвращаем ошибку
            return {"success": False, "message": "Файл не является текстовым и не может быть отредактирован"}
        except Exception as e:
            return {"success": False, "message": f"Ошибка чтения файла: {str(e)}"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка: {str(e)}"}


def write_file_local(server: AllocatedServer, file_path: str, content: str) -> Dict[str, Any]:
    """
    Записывает содержимое в файл (локально)
    """
    try:
        target_path = normalize_path(server, file_path)
        
        # Проверяем, что путь находится внутри корневой директории
        server_root = get_server_root(server)
        try:
            target_path.resolve().relative_to(server_root.resolve())
        except ValueError:
            return {"success": False, "message": "Доступ запрещен: выход за пределы директории сервера"}
        
        if target_path.is_dir():
            return {"success": False, "message": f"Это директория, а не файл: {file_path}"}
        
        # Создаем родительские директории если нужно
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Записываем файл
        target_path.write_text(content, encoding='utf-8')
        
        return {"success": True, "message": f"Файл {file_path} успешно сохранен"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка записи файла: {str(e)}"}


def search_files_local(server: AllocatedServer, search_path: str, pattern: str, max_results: int = 100) -> Dict[str, Any]:
    """
    Ищет файлы по имени в локальной файловой системе сервера
    
    Args:
        server: Объект сервера
        search_path: Путь для поиска (директория, где искать)
        pattern: Паттерн для поиска (имя файла или часть имени)
        max_results: Максимальное количество результатов
        
    Returns:
        Dict с результатами: {success, files: [список путей], message}
    """
    try:
        # Нормализуем путь поиска
        search_root = normalize_path(server, search_path)
        
        if not search_root.exists() or not search_root.is_dir():
            return {
                "success": False,
                "files": [],
                "count": 0,
                "message": f"Директория не найдена: {search_path}"
            }
        
        # Ищем файлы с помощью Path.rglob
        files = []
        server_root = get_server_root(server)
        server_root_resolved = server_root.resolve()
        
        try:
            # Используем rglob для рекурсивного поиска
            for file_path in search_root.rglob(f'*{pattern}*'):
                # Проверяем, что файл находится внутри корневой директории сервера
                try:
                    file_path.resolve().relative_to(server_root_resolved)
                    if file_path.is_file():
                        # Возвращаем относительный путь от корня сервера
                        relative_path = file_path.relative_to(server_root_resolved)
                        # Форматируем как ~/path/to/file
                        if str(relative_path) == '.':
                            files.append('~')
                        else:
                            files.append(f"~/{relative_path}")
                        if len(files) >= max_results:
                            break
                except ValueError:
                    # Файл вне корневой директории - пропускаем
                    continue
        except Exception as e:
            return {
                "success": False,
                "files": [],
                "count": 0,
                "message": f"Ошибка при поиске: {str(e)}"
            }
        
        return {
            "success": True,
            "files": files,
            "count": len(files),
            "message": f"Найдено {len(files)} файл(ов)"
        }
    except Exception as e:
        return {
            "success": False,
            "files": [],
            "count": 0,
            "message": f"Ошибка поиска файлов: {str(e)}"
        }


def delete_file_local(server: AllocatedServer, file_path: str) -> Dict[str, Any]:
    """
    Удаляет файл или директорию (локально)
    """
    try:
        target_path = normalize_path(server, file_path)
        
        # Проверяем, что путь находится внутри корневой директории
        server_root = get_server_root(server)
        try:
            target_path.resolve().relative_to(server_root.resolve())
        except ValueError:
            return {"success": False, "message": "Доступ запрещен: выход за пределы директории сервера"}
        
        if not target_path.exists():
            return {"success": False, "message": f"Файл или директория не найдены: {file_path}"}
        
        if target_path.is_dir():
            shutil.rmtree(target_path)
        else:
            target_path.unlink()
        
        return {"success": True, "message": f"Файл/директория {file_path} успешно удален(а)"}
    except Exception as e:
        return {"success": False, "message": f"Ошибка удаления: {str(e)}"}


def get_system_stats_local(server: AllocatedServer) -> Dict[str, Any]:
    """
    Получает статистику системы (локально)
    """
    try:
        server_root = get_server_root(server)
        
        # Получаем размер директории
        total_size = sum(f.stat().st_size for f in server_root.rglob('*') if f.is_file())
        total_size_mb = total_size / (1024 * 1024)
        
        # Подсчитываем файлы и директории
        file_count = sum(1 for f in server_root.rglob('*') if f.is_file())
        dir_count = sum(1 for d in server_root.rglob('*') if d.is_dir())
        
        stats_output = f"""=== Server Statistics ===
Server: {server.name}
Root Directory: {server_root}
Total Size: {total_size_mb:.2f} MB
Files: {file_count}
Directories: {dir_count}
CPU Cores: {server.cpu_cores}
Memory: {server.memory_gb} GB
Disk: {server.disk_gb} GB
"""
        
        return {"code": 0, "stdout": stats_output, "stderr": ""}
    except Exception as e:
        return {"code": 1, "stdout": "", "stderr": str(e)}


def get_detailed_stats_local(server: AllocatedServer) -> Dict[str, Any]:
    """
    Получает детальную статистику для allocated сервера
    Использует ограниченные ресурсы сервера, а не системные метрики хоста
    """
    import random
    import time
    
    stats = {
        'cpu_percent': None,
        'memory_percent': None,
        'memory_used_mb': None,
        'memory_total_mb': None,
        'disk_percent': None,
        'disk_used_gb': None,
        'disk_total_gb': None,
    }
    
    try:
        server_root = get_server_root(server)
        
        # CPU - симулируем загрузку на основе размера файлов и активности
        # Используем небольшую вариацию для динамики
        try:
            if server_root.exists():
                # Базовая загрузка зависит от количества файлов
                file_count = sum(1 for f in server_root.rglob('*') if f.is_file())
                base_cpu = min(30 + (file_count % 20), 80)  # 30-50% базовая загрузка
                # Добавляем небольшую случайную вариацию для динамики
                variation = random.uniform(-5, 15)
                cpu_percent = max(5, min(95, base_cpu + variation))
                stats['cpu_percent'] = round(cpu_percent, 2)
            else:
                stats['cpu_percent'] = round(random.uniform(10, 30), 2)
        except Exception:
            stats['cpu_percent'] = round(random.uniform(15, 45), 2)
        
        # Memory - используем конфигурацию сервера с динамическим использованием
        try:
            memory_total_mb = server.memory_gb * 1024
            stats['memory_total_mb'] = round(memory_total_mb, 2)
            
            # Вычисляем использование на основе размера файлов
            if server_root.exists():
                total_size = sum(f.stat().st_size for f in server_root.rglob('*') if f.is_file())
                # Используем размер файлов как базу, но не более 80% от доступной памяти
                memory_used_from_files = min(total_size / (1024 * 1024), memory_total_mb * 0.8)
                # Добавляем базовое использование и вариацию
                base_usage = memory_total_mb * 0.3  # 30% базовое использование
                variation = random.uniform(-50, 100)  # MB вариация
                memory_used_mb = max(memory_total_mb * 0.1, min(memory_total_mb * 0.85, 
                    memory_used_from_files + base_usage + variation))
            else:
                # Если директории нет, используем базовое использование
                memory_used_mb = memory_total_mb * random.uniform(0.2, 0.5)
            
            stats['memory_used_mb'] = round(memory_used_mb, 2)
            stats['memory_percent'] = round((memory_used_mb / memory_total_mb) * 100, 2)
        except Exception:
            # Fallback на конфигурацию сервера
            stats['memory_total_mb'] = server.memory_gb * 1024
            stats['memory_percent'] = round(random.uniform(25, 60), 2)
            stats['memory_used_mb'] = round((stats['memory_total_mb'] * stats['memory_percent']) / 100, 2)
        
        # Disk - размер директории сервера (реальные данные)
        try:
            if server_root.exists():
                total_size = sum(f.stat().st_size for f in server_root.rglob('*') if f.is_file())
                disk_used_gb = total_size / (1024 * 1024 * 1024)
                disk_total_gb = server.disk_gb
                disk_percent = (disk_used_gb / disk_total_gb) * 100 if disk_total_gb > 0 else 0
                
                stats['disk_used_gb'] = round(disk_used_gb, 2)
                stats['disk_total_gb'] = round(disk_total_gb, 2)
                stats['disk_percent'] = round(disk_percent, 2)
            else:
                # Директория не существует
                stats['disk_total_gb'] = server.disk_gb
                stats['disk_percent'] = 0.0
                stats['disk_used_gb'] = 0.0
        except Exception:
            # В случае ошибки используем значения по умолчанию
            stats['disk_total_gb'] = server.disk_gb
            stats['disk_percent'] = 0.0
            stats['disk_used_gb'] = 0.0
        
    except Exception as e:
        # В случае критической ошибки логируем, но возвращаем пустые значения
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Ошибка получения метрик для allocated сервера {server.id}: {str(e)}")
    
    return stats


def test_connection_local(server: AllocatedServer) -> Tuple[bool, str]:
    """
    Тестирует "подключение" к локальному серверу (проверяет существование директории)
    """
    try:
        server_root = get_server_root(server)
        if server_root.exists():
            return True, "Локальный сервер активен"
        else:
            return False, "Директория сервера не найдена"
    except Exception as e:
        return False, f"Ошибка: {str(e)}"


def cleanup_problematic_dirs(server: AllocatedServer) -> Dict[str, Any]:
    """
    Удаляет проблемные директории (.pip_cache, .rustup, .cargo, Library) из корня сервера,
    но НЕ удаляет их из venv, так как они могут быть нужны там
    """
    try:
        server_root = get_server_root(server)
        # Удаляем только из корня сервера, не из venv
        problematic_dirs = [
            server_root / '.pip_cache',
            server_root / '.rustup',
            server_root / '.cargo',
            server_root / 'Library',  # Только из корня, не из venv/Library
        ]
        
        removed_dirs = []
        errors = []
        
        for dir_path in problematic_dirs:
            if dir_path.exists():
                try:
                    # Пытаемся удалить директорию
                    if dir_path.is_dir():
                        shutil.rmtree(dir_path, ignore_errors=True)
                        # Проверяем, что директория действительно удалена
                        if not dir_path.exists():
                            removed_dirs.append(str(dir_path.relative_to(server_root)))
                    else:
                        dir_path.unlink()
                        removed_dirs.append(str(dir_path.relative_to(server_root)))
                except Exception as e:
                    errors.append(f"Не удалось удалить {dir_path.name}: {str(e)}")
        
        message = ""
        if removed_dirs:
            message += f"Удалены директории: {', '.join(removed_dirs)}. "
        if errors:
            message += f"Ошибки: {'; '.join(errors)}"
        if not removed_dirs and not errors:
            message = "Проблемные директории не найдены"
        
        return {
            "success": len(errors) == 0,
            "removed": removed_dirs,
            "errors": errors,
            "message": message
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Ошибка при очистке: {str(e)}"
        }

