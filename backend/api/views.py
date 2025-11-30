from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from decimal import Decimal

from .models import Server, UserProfile, ServerMetric
from .serializers import (
    ServerSerializer, 
    ServerListSerializer, 
    CommandSerializer,
    DirectorySerializer
)
from .ssh_utils import exec_command, list_directory, get_system_stats, get_detailed_stats, test_connection, upload_file, create_file, create_directory, rename_file, read_file, write_file, delete_file, search_files
from .allocated_server_utils import get_detailed_stats_local
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


class ServerViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления серверами
    """
    queryset = Server.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ServerListSerializer
        return ServerSerializer
    
    def get_queryset(self):
        """Возвращает только серверы текущего пользователя"""
        user = self.request.user
        profile = getattr(user, 'profile', None)
        
        # Проверяем подписку PRO или PLUS для добавления своих серверов
        if profile and profile.has_active_subscription and profile.subscription_type in ['pro', 'plus']:
            return Server.objects.filter(created_by=user).order_by('-created_at')
        else:
            # Если нет подписки, возвращаем пустой queryset
            return Server.objects.none()
    
    def perform_create(self, serializer):
        """Сохраняет сервер с привязкой к текущему пользователю"""
        user = self.request.user
        profile = getattr(user, 'profile', None)
        
        # Проверяем подписку PRO или PLUS для добавления своих серверов
        if not profile or not profile.has_active_subscription or profile.subscription_type not in ['pro', 'plus']:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Для добавления своих серверов требуется активная подписка PRO или PLUS')
        
        serializer.save(created_by=user)
    
    @action(detail=True, methods=['post'], serializer_class=CommandSerializer)
    def exec(self, request, pk=None):
        """
        Выполняет команду на сервере
        POST /api/servers/{id}/exec/
        Body: {"command": "ls -la"}
        """
        server = self.get_object()
        serializer = CommandSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        command = serializer.validated_data['command']
        
        try:
            exit_code, stdout, stderr = exec_command(server, command)
            return Response({
                'success': exit_code == 0,
                'exit_code': exit_code,
                'stdout': stdout,
                'stderr': stderr
            })
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def ls(self, request, pk=None):
        """
        Получает список файлов в директории
        GET /api/servers/{id}/ls/?path=/home/user
        """
        server = self.get_object()
        path = request.query_params.get('path', '~')
        
        try:
            result = list_directory(server, path)
            return Response(result)
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        Получает статистику системы
        GET /api/servers/{id}/stats/
        """
        server = self.get_object()
        
        try:
            result = get_system_stats(server)
            return Response(result)
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def detailed_stats(self, request, pk=None):
        """
        Получает детальную статистику с процентами
        GET /api/servers/{id}/detailed_stats/
        """
        server = self.get_object()
        
        try:
            stats = get_detailed_stats(server)
            
            # Если все метрики None, возвращаем пустой ответ, но не ошибку
            if not any(v is not None for v in stats.values()):
                return Response({
                    'cpu_percent': None,
                    'memory_percent': None,
                    'memory_used_mb': None,
                    'memory_total_mb': None,
                    'disk_percent': None,
                    'disk_used_gb': None,
                    'disk_total_gb': None,
                    'message': 'Метрики не удалось получить. Возможно, команды мониторинга недоступны на сервере.'
                })
            
            # Сохраняем метрику в БД только если есть хотя бы одна валидная метрика
            if any(v is not None for v in stats.values()):
                try:
                    ServerMetric.objects.create(
                        server=server,
                        **stats
                    )
                except Exception as db_error:
                    # Логируем ошибку, но не прерываем выполнение
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Ошибка сохранения метрики: {db_error}")
            
            return Response(stats)
        except Exception as e:
            import logging
            import traceback
            logger = logging.getLogger(__name__)
            logger.error(f"Ошибка получения метрик для сервера {server.id}: {str(e)}\n{traceback.format_exc()}")
            return Response({
                'error': f'Ошибка получения метрик: {str(e)}',
                'cpu_percent': None,
                'memory_percent': None,
                'memory_used_mb': None,
                'memory_total_mb': None,
                'disk_percent': None,
                'disk_used_gb': None,
                'disk_total_gb': None,
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def metrics_history(self, request, pk=None):
        """
        Получает историю метрик для графиков
        GET /api/servers/{id}/metrics_history/?hours=1
        """
        server = self.get_object()
        hours = int(request.query_params.get('hours', 1))
        
        try:
            since = timezone.now() - timedelta(hours=hours)
            metrics = ServerMetric.objects.filter(
                server=server,
                created_at__gte=since
            ).order_by('created_at')
            
            metrics_data = []
            for metric in metrics:
                metrics_data.append({
                    'timestamp': metric.created_at.isoformat(),
                    'cpu_percent': metric.cpu_percent,
                    'memory_percent': metric.memory_percent,
                    'memory_used_mb': metric.memory_used_mb,
                    'memory_total_mb': metric.memory_total_mb,
                    'disk_percent': metric.disk_percent,
                    'disk_used_gb': metric.disk_used_gb,
                    'disk_total_gb': metric.disk_total_gb,
                })
            
            return Response(metrics_data)
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        """
        Тестирует подключение к серверу
        POST /api/servers/{id}/test_connection/
        """
        server = self.get_object()
        
        try:
            success, message = test_connection(server)
            return Response({
                'success': success,
                'message': message
            })
        except Exception as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def upload_file(self, request, pk=None):
        """
        Загружает файл на сервер
        POST /api/servers/{id}/upload_file/
        Body: multipart/form-data с полями 'file' и 'remote_path'
        """
        server = self.get_object()
        
        if 'file' not in request.FILES:
            return Response({
                'success': False,
                'message': 'Файл не предоставлен'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        remote_path = request.data.get('remote_path', '~')
        if not remote_path:
            remote_path = '~'
        
        uploaded_file = request.FILES['file']
        
        # Сохраняем временный файл
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
            for chunk in uploaded_file.chunks():
                tmp_file.write(chunk)
            tmp_path = tmp_file.name
        
        try:
            result = upload_file(server, tmp_path, remote_path)
            return Response(result)
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Ошибка загрузки: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            # Удаляем временный файл
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    @action(detail=True, methods=['post'])
    def create_file(self, request, pk=None):
        """
        Создает пустой файл на сервере
        POST /api/servers/{id}/create_file/
        Body: {"file_path": "/path/to/file"}
        """
        server = self.get_object()
        file_path = request.data.get('file_path')
        
        if not file_path:
            return Response({
                'success': False,
                'message': 'Путь к файлу не указан'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = create_file(server, file_path)
            return Response(result)
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Ошибка создания файла: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def create_directory(self, request, pk=None):
        """
        Создает директорию на сервере
        POST /api/servers/{id}/create_directory/
        Body: {"dir_path": "/path/to/directory"}
        """
        server = self.get_object()
        dir_path = request.data.get('dir_path')
        
        if not dir_path:
            return Response({
                'success': False,
                'message': 'Путь к директории не указан'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = create_directory(server, dir_path)
            return Response(result)
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Ошибка создания директории: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def rename_file(self, request, pk=None):
        """
        Переименовывает файл или директорию на сервере
        POST /api/servers/{id}/rename_file/
        Body: {"old_path": "/path/to/old", "new_path": "/path/to/new"}
        """
        server = self.get_object()
        old_path = request.data.get('old_path')
        new_path = request.data.get('new_path')
        
        if not old_path or not new_path:
            return Response({
                'success': False,
                'message': 'Старый и новый пути должны быть указаны'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = rename_file(server, old_path, new_path)
            return Response(result)
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Ошибка переименования: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def read_file(self, request, pk=None):
        """
        Читает содержимое текстового файла на сервере
        GET /api/servers/{id}/read_file/?file_path=/path/to/file
        """
        server = self.get_object()
        file_path = request.query_params.get('file_path')
        
        if not file_path:
            return Response({
                'success': False,
                'message': 'Путь к файлу не указан'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = read_file(server, file_path)
            return Response(result)
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Ошибка чтения файла: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def write_file(self, request, pk=None):
        """
        Записывает содержимое в файл на сервере
        POST /api/servers/{id}/write_file/
        Body: {"file_path": "/path/to/file", "content": "file content"}
        """
        server = self.get_object()
        file_path = request.data.get('file_path')
        content = request.data.get('content', '')
        
        if not file_path:
            return Response({
                'success': False,
                'message': 'Путь к файлу не указан'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = write_file(server, file_path, content)
            return Response(result)
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Ошибка записи файла: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def delete_file(self, request, pk=None):
        """
        Удаляет файл или директорию на сервере
        POST /api/servers/{id}/delete_file/
        Body: {"file_path": "/path/to/file"}
        """
        server = self.get_object()
        file_path = request.data.get('file_path')
        
        if not file_path:
            return Response({
                'success': False,
                'message': 'Путь к файлу не указан'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = delete_file(server, file_path)
            return Response(result)
        except Exception as e:
            return Response({
                'success': False,
                'message': f'Ошибка удаления: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def search_files(self, request, pk=None):
        """
        Ищет файлы по имени на сервере
        POST /api/servers/{id}/search_files/
        Body: {"search_path": "/path/to/search", "pattern": "filename", "max_results": 100}
        """
        server = self.get_object()
        search_path = request.data.get('search_path', '~')
        pattern = request.data.get('pattern', '')
        max_results = int(request.data.get('max_results', 100))
        
        if not pattern:
            return Response({
                'success': False,
                'message': 'Паттерн поиска не указан'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if max_results < 1 or max_results > 500:
            max_results = 100
        
        try:
            result = search_files(server, search_path, pattern, max_results)
            return Response(result)
        except Exception as e:
            return Response({
                'success': False,
                'files': [],
                'count': 0,
                'message': f'Ошибка поиска: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_server_status(request, server_id):
    """
    POST /api/servers/{id}/toggle_status/
    Переключает статус сервера (включен/выключен)
    """
    try:
        server = Server.objects.get(id=server_id, created_by=request.user)
    except Server.DoesNotExist:
        return Response(
            {'error': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    server.is_active = not server.is_active
    server.save()
    
    return Response({
        'success': True,
        'is_active': server.is_active,
        'message': f'Сервер {"включен" if server.is_active else "выключен"}'
    })


class RegisterView(APIView):
    """
    API для регистрации нового пользователя
    POST /api/auth/register/
    Body: {
        "username": "user123",
        "email": "user@example.com",
        "password": "securepass123",
        "password_confirm": "securepass123"
    }
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        username = request.data.get('username')
        email = request.data.get('email')
        password = request.data.get('password')
        password_confirm = request.data.get('password_confirm')
        
        # Валидация данных
        errors = {}
        
        if not username:
            errors['username'] = 'Имя пользователя обязательно'
        elif len(username) < 3:
            errors['username'] = 'Имя пользователя должно содержать минимум 3 символа'
        elif len(username) > 150:
            errors['username'] = 'Имя пользователя не должно превышать 150 символов'
        elif User.objects.filter(username=username).exists():
            errors['username'] = 'Пользователь с таким именем уже существует'
        
        if not email:
            errors['email'] = 'Email обязателен'
        elif '@' not in email or '.' not in email.split('@')[1]:
            errors['email'] = 'Введите корректный email адрес'
        elif User.objects.filter(email=email).exists():
            errors['email'] = 'Пользователь с таким email уже существует'
        
        if not password:
            errors['password'] = 'Пароль обязателен'
        elif len(password) < 8:
            errors['password'] = 'Пароль должен содержать минимум 8 символов'
        else:
            try:
                validate_password(password)
            except ValidationError as e:
                errors['password'] = '; '.join(e.messages)
        
        if not password_confirm:
            errors['password_confirm'] = 'Подтверждение пароля обязательно'
        elif password != password_confirm:
            errors['password_confirm'] = 'Пароли не совпадают'
        
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        
        # Создание пользователя
        try:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password
            )
            
            # Генерируем токены для автоматического входа
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)
            
            return Response({
                'message': 'Пользователь успешно зарегистрирован',
                'username': user.username,
                'email': user.email,
                'access': str(refresh.access_token),
                'refresh': str(refresh)
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({
                'error': f'Ошибка при создании пользователя: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UserProfileView(APIView):
    """
    API для получения и обновления информации о текущем пользователе
    GET /api/auth/profile/ - получить профиль
    PUT /api/auth/profile/ - обновить профиль
    PATCH /api/auth/profile/ - частично обновить профиль
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        profile = getattr(user, 'profile', None)
        
        avatar_url = None
        if profile and profile.avatar:
            avatar_url = request.build_absolute_uri(profile.avatar.url)
        
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'date_joined': user.date_joined.isoformat() if hasattr(user, 'date_joined') else None,
            'avatar': avatar_url,
            'email_verified': profile.email_verified if profile else False,
            'balance': float(profile.balance) if profile else 0.00,
            'is_staff': user.is_staff,
            'subscription_type': profile.subscription_type if profile else 'none',
            'subscription_expires_at': profile.subscription_expires_at.isoformat() if profile and profile.subscription_expires_at else None,
            'has_active_subscription': profile.has_active_subscription if profile else False,
        })
    
    def put(self, request):
        """Полное обновление профиля"""
        return self._update_profile(request, partial=False)
    
    def patch(self, request):
        """Частичное обновление профиля"""
        return self._update_profile(request, partial=True)
    
    def _update_profile(self, request, partial=False):
        user = request.user
        profile, created = UserProfile.objects.get_or_create(user=user)
        
        # Обновление username
        if 'username' in request.data:
            new_username = request.data['username']
            if new_username and len(new_username) >= 3 and len(new_username) <= 150:
                if User.objects.filter(username=new_username).exclude(id=user.id).exists():
                    return Response(
                        {'username': 'Пользователь с таким именем уже существует'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                user.username = new_username
        
        # Обновление email
        if 'email' in request.data:
            new_email = request.data['email']
            if new_email and '@' in new_email:
                if User.objects.filter(email=new_email).exclude(id=user.id).exists():
                    return Response(
                        {'email': 'Пользователь с таким email уже существует'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                old_email = user.email
                user.email = new_email
                # Сбрасываем подтверждение email при изменении
                if new_email != old_email:
                    profile.email_verified = False
        
        # Обновление аватарки
        if 'avatar' in request.FILES:
            profile.avatar = request.FILES['avatar']
        
        # Удаление аватарки (передается как пустая строка или null)
        if 'avatar' in request.data:
            avatar_value = request.data.get('avatar')
            if avatar_value == '' or avatar_value is None:
                if profile.avatar:
                    profile.avatar.delete()
                profile.avatar = None
        
        user.save()
        profile.save()
        
        avatar_url = None
        if profile.avatar:
            avatar_url = request.build_absolute_uri(profile.avatar.url)
        
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'date_joined': user.date_joined.isoformat() if hasattr(user, 'date_joined') else None,
            'avatar': avatar_url,
            'email_verified': profile.email_verified,
            'balance': float(profile.balance),
            'is_staff': user.is_staff,
            'subscription_type': profile.subscription_type,
            'subscription_expires_at': profile.subscription_expires_at.isoformat() if profile.subscription_expires_at else None,
            'has_active_subscription': profile.has_active_subscription,
        })


class AdminView(APIView):
    """
    API для получения списка пользователей
    GET /api/admin/users/ - получить список всех пользователей
    """
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get(self, request):
        users = User.objects.all().select_related('profile')
        users_data = []
        
        for user in users:
            profile = getattr(user, 'profile', None)
            avatar_url = None
            if profile and profile.avatar:
                avatar_url = request.build_absolute_uri(profile.avatar.url)
            
            users_data.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_staff': user.is_staff,
                'is_active': user.is_active,
                'date_joined': user.date_joined.isoformat() if hasattr(user, 'date_joined') else None,
                'avatar': avatar_url,
                'balance': float(profile.balance) if profile else 0.00,
                'email_verified': profile.email_verified if profile else False,
                'subscription_type': profile.subscription_type if profile else 'none',
                'subscription_expires_at': profile.subscription_expires_at.isoformat() if profile and profile.subscription_expires_at else None,
                'has_active_subscription': profile.has_active_subscription if profile else False,
            })
        
        return Response(users_data)


class AdminBalanceView(APIView):
    """
    API для управления балансом пользователей
    """
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def post(self, request):
        action = request.path.split('/')[-2]  # 'update-balance' или 'add-balance'
        user_id = request.data.get('user_id')
        amount = request.data.get('amount')
        
        if not user_id:
            return Response(
                {'error': 'user_id обязателен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            amount = Decimal(str(amount))
        except (ValueError, TypeError):
            return Response(
                {'error': 'Некорректная сумма'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id)
            profile, created = UserProfile.objects.get_or_create(user=user)
            
            if 'update' in action:
                profile.balance = amount
                message = 'Баланс обновлен'
            else:  # add
                profile.balance += amount
                message = 'Баланс добавлен'
            
            profile.save()
            
            return Response({
                'message': message,
                'user_id': user.id,
                'username': user.username,
                'balance': float(profile.balance)
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'Пользователь не найден'},
                status=status.HTTP_404_NOT_FOUND
            )


class AdminUserStatusView(APIView):
    """
    API для изменения статуса пользователя
    """
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def post(self, request):
        user_id = request.data.get('user_id')
        
        if not user_id:
            return Response(
                {'error': 'user_id обязателен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id)
            user.is_active = not user.is_active
            user.save()
            
            return Response({
                'message': 'Статус пользователя изменен',
                'user_id': user.id,
                'username': user.username,
                'is_active': user.is_active
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'Пользователь не найден'},
                status=status.HTTP_404_NOT_FOUND
            )


class AdminDeleteUserView(APIView):
    """
    API для удаления пользователя
    """
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def post(self, request):
        user_id = request.data.get('user_id')
        
        if not user_id:
            return Response(
                {'error': 'user_id обязателен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id)
            username = user.username
            user.delete()
            
            return Response({
                'message': f'Пользователь {username} удален'
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'Пользователь не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

