"""
Интерактивные SSH сессии для быстрого выполнения команд
Использует переиспользование соединений для максимальной скорости
"""
import paramiko
import threading
import time
from typing import Dict, Any, Tuple, Optional
from .models import Server
from .ssh_utils import SSHClientFactory, SSHConnectionError


class SSHInteractiveSession:
    """Управляет SSH соединением для быстрого выполнения команд"""
    
    def __init__(self, server: Server, client: paramiko.SSHClient):
        self.server = server
        self.client = client
        self.session_lock = threading.RLock()
        self.last_used = time.time()
        self.created_at = time.time()
        self._is_closed = False
        
    def _ensure_client(self):
        """Проверяет, что клиент валиден"""
        with self.session_lock:
            if self._is_closed:
                raise SSHConnectionError("Сессия закрыта")
            
            transport = self.client.get_transport()
            if transport is None or not transport.is_active():
                raise SSHConnectionError("Соединение разорвано")
    
    def execute_command(self, command: str, timeout: int = 30) -> Tuple[int, str, str]:
        """
        Выполняет команду через переиспользованное соединение (быстро)
        Соединение уже установлено, поэтому выполнение очень быстрое
        
        Args:
            command: Команда для выполнения
            timeout: Таймаут выполнения
            
        Returns:
            Tuple (exit_code, stdout, stderr)
        """
        # Проверяем валидность соединения с блокировкой
        with self.session_lock:
            self._ensure_client()
        
        # Выполняем команду БЕЗ блокировки, чтобы команды не блокировали друг друга
        # Paramiko поддерживает параллельное выполнение команд на одном соединении
        try:
            # Используем exec_command с get_pty=False для максимальной скорости
            # Соединение уже установлено, поэтому это очень быстро
            stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout, get_pty=False)
            
            # Читаем вывод
            # recv_exit_status() блокируется до завершения команды или таймаута exec_command
            exit_code = stdout.channel.recv_exit_status()
            
            stdout_text = stdout.read().decode('utf-8', errors='replace')
            stderr_text = stderr.read().decode('utf-8', errors='replace')
            
            # Обновляем время использования с блокировкой
            with self.session_lock:
                self.last_used = time.time()
            
            return exit_code, stdout_text, stderr_text
            
        except (paramiko.ssh_exception.SSHException, OSError, IOError, AttributeError) as e:
            # Соединение разорвано - закрываем сессию
            with self.session_lock:
                self.close()
            raise SSHConnectionError(f"Ошибка выполнения команды: {str(e)}")
    
    def close(self):
        """Закрывает сессию"""
        with self.session_lock:
            self._is_closed = True
            # Не закрываем client здесь - он управляется пулом соединений
    
    def is_valid(self) -> bool:
        """Проверяет, валидна ли сессия"""
        try:
            if self._is_closed:
                return False
            transport = self.client.get_transport()
            if transport is None or not transport.is_active():
                return False
            return True
        except:
            return False


class SSHInteractiveSessionManager:
    """Менеджер интерактивных SSH сессий"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(SSHInteractiveSessionManager, cls).__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._sessions: Dict[int, SSHInteractiveSession] = {}
        self._sessions_lock = threading.RLock()
        self._reconnect_interval = 600  # 10 минут
        self._initialized = True
    
    def get_session(self, server: Server) -> SSHInteractiveSession:
        """Получает или создает интерактивную сессию для сервера"""
        key = server.id
        
        with self._sessions_lock:
            if key in self._sessions:
                session = self._sessions[key]
                
                # Проверяем валидность
                if session.is_valid() and not self._should_reconnect(session):
                    return session
                else:
                    # Закрываем невалидную сессию
                    try:
                        session.close()
                        # Закрываем клиент тоже
                        try:
                            session.client.close()
                        except:
                            pass
                    except:
                        pass
                    del self._sessions[key]
            
            # Создаем новую сессию с переподключением при ошибке
            try:
                client = SSHClientFactory.connect(server, timeout=5)
                session = SSHInteractiveSession(server, client)
                self._sessions[key] = session
                return session
            except Exception as e:
                # Если не удалось подключиться, пробуем еще раз
                try:
                    time.sleep(0.5)
                    client = SSHClientFactory.connect(server, timeout=5)
                    session = SSHInteractiveSession(server, client)
                    self._sessions[key] = session
                    return session
                except Exception as retry_error:
                    raise SSHConnectionError(f"Не удалось подключиться к серверу: {str(retry_error)}")
    
    def _should_reconnect(self, session: SSHInteractiveSession) -> bool:
        """Проверяет, нужно ли переподключиться"""
        current_time = time.time()
        time_since_creation = current_time - session.created_at
        return time_since_creation >= self._reconnect_interval
    
    def close_session(self, server: Server):
        """Закрывает сессию для сервера"""
        key = server.id
        with self._sessions_lock:
            if key in self._sessions:
                try:
                    self._sessions[key].close()
                except:
                    pass
                del self._sessions[key]
    
    def close_all(self):
        """Закрывает все сессии"""
        with self._sessions_lock:
            for session in self._sessions.values():
                try:
                    session.close()
                except:
                    pass
            self._sessions.clear()
    
    def cleanup_inactive(self, max_idle_time: int = 1800):
        """Очищает неактивные сессии"""
        current_time = time.time()
        with self._sessions_lock:
            keys_to_remove = []
            for key, session in self._sessions.items():
                idle_time = current_time - session.last_used
                if idle_time > max_idle_time:
                    keys_to_remove.append(key)
            
            for key in keys_to_remove:
                try:
                    self._sessions[key].close()
                except:
                    pass
                del self._sessions[key]


# Глобальный менеджер сессий
_session_manager = SSHInteractiveSessionManager()


def exec_command_interactive(server: Server, command: str, timeout: int = 30) -> Tuple[int, str, str]:
    """
    Выполняет команду через интерактивную SSH сессию (быстро)
    Автоматически переподключается при разрыве соединения
    
    Args:
        server: Объект сервера
        command: Команда для выполнения
        timeout: Таймаут выполнения
        
    Returns:
        Tuple (exit_code, stdout, stderr)
    """
    max_retries = 2  # Уменьшаем количество попыток для быстрого ответа
    last_error = None
    
    for attempt in range(max_retries):
        try:
            session = _session_manager.get_session(server)
            return session.execute_command(command, timeout)
        except SSHConnectionError as e:
            last_error = e
            # Закрываем невалидную сессию
            _session_manager.close_session(server)
            
            if attempt < max_retries - 1:
                # Пробуем переподключиться с небольшой задержкой
                time.sleep(0.2)
                continue
            else:
                # Последняя попытка
                raise SSHConnectionError(f"Не удалось выполнить команду: {str(last_error)}")

