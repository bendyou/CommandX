from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from .models import UserProfile, Transaction, AllocatedServer, ServerMetric
from .ssh_utils import exec_command, list_directory, get_system_stats, test_connection, upload_file, delete_file
from .allocated_server_utils import (
    exec_command_local,
    list_directory_local,
    upload_file_local,
    create_file_local,
    create_directory_local,
    rename_file_local,
    read_file_local,
    write_file_local,
    delete_file_local,
    search_files_local,
    get_system_stats_local,
    get_detailed_stats_local,
    test_connection_local,
    get_server_root
)

User = get_user_model()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deposit_balance(request):
    """
    POST /api/payment/deposit/
    Body: {"amount": 100.00}
    """
    amount = request.data.get('amount')
    
    try:
        amount = Decimal(str(amount))
        if amount <= 0:
            return Response(
                {'error': 'Сумма должна быть больше нуля'},
                status=status.HTTP_400_BAD_REQUEST
            )
    except (ValueError, TypeError):
        return Response(
            {'error': 'Некорректная сумма'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    profile, created = UserProfile.objects.get_or_create(user=request.user)
    profile.balance += amount
    profile.save()
    
    # Создаем транзакцию
    Transaction.objects.create(
        user=request.user,
        transaction_type='deposit',
        amount=amount,
        description=f'Пополнение баланса на {amount}₽'
    )
    
    return Response({
        'message': 'Баланс пополнен',
        'balance': float(profile.balance)
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def buy_subscription(request):
    """
    POST /api/payment/buy-subscription/
    Body: {"subscription_type": "pro" | "plus"}
    """
    subscription_type = request.data.get('subscription_type')
    
    if subscription_type not in ['pro', 'plus']:
        return Response(
            {'error': 'Некорректный тип подписки'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    prices = {
        'pro': Decimal('200.00'),
        'plus': Decimal('1000.00')
    }
    
    price = prices[subscription_type]
    profile, created = UserProfile.objects.get_or_create(user=request.user)
    
    if profile.balance < price:
        return Response(
            {'error': 'Недостаточно средств на балансе'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Списываем средства
    profile.balance -= price
    profile.save()
    
    # Выдаем подписку на 30 дней
    profile.subscription_type = subscription_type
    profile.subscription_expires_at = timezone.now() + timedelta(days=30)
    profile.save()
    
    # Создаем транзакцию
    Transaction.objects.create(
        user=request.user,
        transaction_type=f'subscription_{subscription_type}',
        amount=price,
        description=f'Покупка подписки {subscription_type.upper()} на 30 дней'
    )
    
    return Response({
        'message': f'Подписка {subscription_type.upper()} активирована на 30 дней',
        'subscription_type': subscription_type,
        'expires_at': profile.subscription_expires_at.isoformat(),
        'balance': float(profile.balance)
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_transactions(request):
    """
    GET /api/payment/transactions/
    """
    transactions = Transaction.objects.filter(user=request.user)
    
    transactions_data = []
    for transaction in transactions:
        transactions_data.append({
            'id': transaction.id,
            'type': transaction.transaction_type,
            'type_display': transaction.get_transaction_type_display(),
            'amount': float(transaction.amount),
            'description': transaction.description,
            'created_at': transaction.created_at.isoformat()
        })
    
    return Response(transactions_data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUser])
def grant_subscription(request):
    """
    POST /api/admin/grant-subscription/
    Body: {
        "user_id": 1,
        "subscription_type": "pro" | "plus" | "none",
        "days": 30
    }
    """
    user_id = request.data.get('user_id')
    subscription_type = request.data.get('subscription_type')
    days = request.data.get('days', 30)
    
    if not user_id:
        return Response(
            {'error': 'user_id обязателен'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Если subscription_type = "none", убираем подписку
    if subscription_type == 'none':
        try:
            user = User.objects.get(id=user_id)
            profile, created = UserProfile.objects.get_or_create(user=user)
            profile.subscription_type = 'none'
            profile.subscription_expires_at = None
            profile.save()
            
            Transaction.objects.create(
                user=user,
                transaction_type='admin_grant',
                amount=Decimal('0.00'),
                description='Админ убрал подписку'
            )
            
            return Response({
                'message': 'Подписка удалена',
                'user_id': user.id,
                'username': user.username,
                'subscription_type': 'none',
                'expires_at': None
            })
        except User.DoesNotExist:
            return Response(
                {'error': 'Пользователь не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    if subscription_type not in ['pro', 'plus']:
        return Response(
            {'error': 'Некорректный тип подписки'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        days = int(days)
        if days <= 0:
            return Response(
                {'error': 'Количество дней должно быть больше нуля'},
                status=status.HTTP_400_BAD_REQUEST
            )
    except (ValueError, TypeError):
        return Response(
            {'error': 'Некорректное количество дней'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user = User.objects.get(id=user_id)
        profile, created = UserProfile.objects.get_or_create(user=user)
        
        # Выдаем подписку
        profile.subscription_type = subscription_type
        if profile.subscription_expires_at and profile.subscription_expires_at > timezone.now():
            # Если подписка еще активна, продлеваем
            profile.subscription_expires_at += timedelta(days=days)
        else:
            # Иначе начинаем с текущего момента
            profile.subscription_expires_at = timezone.now() + timedelta(days=days)
        profile.save()
        
        # Создаем транзакцию
        Transaction.objects.create(
            user=user,
            transaction_type='admin_grant',
            amount=Decimal('0.00'),
            description=f'Админ выдал подписку {subscription_type.upper()} на {days} дней'
        )
        
        return Response({
            'message': f'Подписка {subscription_type.upper()} выдана на {days} дней',
            'user_id': user.id,
            'username': user.username,
            'subscription_type': subscription_type,
            'expires_at': profile.subscription_expires_at.isoformat()
        })
    except User.DoesNotExist:
        return Response(
            {'error': 'Пользователь не найден'},
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdminUser])
def create_allocated_server(request):
    """
    POST /api/admin/create-allocated-server/
    Body: {
        "user_id": 1,
        "name": "Сервер 1",
        "cpu_cores": 2,
        "memory_gb": 4,
        "disk_gb": 20
    }
    """
    user_id = request.data.get('user_id')
    name = request.data.get('name')
    cpu_cores = request.data.get('cpu_cores', 1)
    memory_gb = request.data.get('memory_gb', 1)
    disk_gb = request.data.get('disk_gb', 10)
    
    if not user_id or not name:
        return Response(
            {'error': 'user_id и name обязательны'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user = User.objects.get(id=user_id)
        
        # Генерируем данные для сервера (в реальности это будет создание виртуального сервера)
        allocated_server = AllocatedServer.objects.create(
            user=user,
            name=name,
            host='localhost',  # Локальный сервер
            port=0,  # Не используется для локальных серверов
            username=f'user{user.id}',
            password='',  # Не используется для локальных серверов
            cpu_cores=cpu_cores,
            memory_gb=memory_gb,
            disk_gb=disk_gb,
            is_active=True
        )
        
        # Создаем директорию для сервера
        server_root = get_server_root(allocated_server)
        server_root.mkdir(parents=True, exist_ok=True)
        
        # Создаем README файл
        readme_path = server_root / 'README.txt'
        readme_path.write_text(f"""Добро пожаловать на ваш сервер {name}!

Это ваша персональная директория. Здесь вы можете:
- Загружать файлы
- Создавать директории
- Выполнять команды
- Управлять файлами

Ваш сервер:
- CPU: {cpu_cores} ядер
- Память: {memory_gb} GB
- Диск: {disk_gb} GB

Начните работу с командой: ls -la
""")
        
        return Response({
            'message': 'Сервер создан',
            'server': {
                'id': allocated_server.id,
                'name': allocated_server.name,
                'host': allocated_server.host,
                'port': allocated_server.port,
                'username': allocated_server.username,
                'cpu_cores': allocated_server.cpu_cores,
                'memory_gb': allocated_server.memory_gb,
                'disk_gb': allocated_server.disk_gb,
            }
        })
    except User.DoesNotExist:
        return Response(
            {'error': 'Пользователь не найден'},
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_allocated_servers(request):
    """
    GET /api/servers/allocated/
    """
    servers = AllocatedServer.objects.filter(user=request.user)
    
    servers_data = []
    for server in servers:
        servers_data.append({
            'id': server.id,
            'name': server.name,
            'host': server.host,
            'port': server.port,
            'username': server.username,
            'cpu_cores': server.cpu_cores,
            'memory_gb': server.memory_gb,
            'disk_gb': server.disk_gb,
            'is_active': server.is_active,
            'created_at': server.created_at.isoformat(),
            'expires_at': server.expires_at.isoformat() if server.expires_at else None,
        })
    
    return Response(servers_data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_user_allocated_server(request):
    """
    POST /api/servers/create-allocated/
    Body: {
        "name": "Мой сервер",
        "cpu_cores": 2,
        "memory_gb": 4,
        "disk_gb": 20
    }
    Только для пользователей с подпиской PLUS
    Минимальная конфигурация бесплатна, за дополнительные ресурсы нужно доплатить
    """
    profile, created = UserProfile.objects.get_or_create(user=request.user)
    
    # Проверяем подписку PLUS
    if not profile.has_active_subscription or profile.subscription_type != 'plus':
        return Response(
            {'error': 'Для создания выданного сервера требуется активная подписка PLUS'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    name = request.data.get('name')
    cpu_cores = request.data.get('cpu_cores', 1)
    memory_gb = request.data.get('memory_gb', 1)
    disk_gb = request.data.get('disk_gb', 10)
    
    if not name:
        return Response(
            {'error': 'Название сервера обязательно'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Минимальная бесплатная конфигурация
    MIN_CPU = 1
    MIN_MEMORY = 1
    MIN_DISK = 10
    
    cpu_cores = max(int(cpu_cores), MIN_CPU)
    memory_gb = max(int(memory_gb), MIN_MEMORY)
    disk_gb = max(int(disk_gb), MIN_DISK)
    
    # Ограничения
    cpu_cores = min(cpu_cores, 8)  # Максимум 8 ядер
    memory_gb = min(memory_gb, 16)  # Максимум 16 GB
    disk_gb = min(disk_gb, 100)  # Максимум 100 GB
    
    # Расчет стоимости дополнительных ресурсов
    # Цены за единицу ресурса
    CPU_PRICE = 50  # рублей за ядро сверх минимума
    MEMORY_PRICE = 30  # рублей за GB сверх минимума
    DISK_PRICE = 5  # рублей за GB сверх минимума
    
    extra_cpu = max(0, cpu_cores - MIN_CPU)
    extra_memory = max(0, memory_gb - MIN_MEMORY)
    extra_disk = max(0, disk_gb - MIN_DISK)
    
    total_cost = (extra_cpu * CPU_PRICE) + (extra_memory * MEMORY_PRICE) + (extra_disk * DISK_PRICE)
    
    # Проверяем баланс
    if total_cost > 0 and profile.balance < total_cost:
        return Response(
            {
                'error': f'Недостаточно средств. Требуется {total_cost:.2f} ₽ для дополнительных ресурсов',
                'required_balance': total_cost,
                'current_balance': float(profile.balance)
            },
            status=status.HTTP_402_PAYMENT_REQUIRED
        )
    
    try:
        # Списываем средства, если есть доплата
        if total_cost > 0:
            profile.balance -= Decimal(str(total_cost))
            profile.save()
            
            # Создаем транзакцию
            Transaction.objects.create(
                user=request.user,
                transaction_type='deposit',  # Используем существующий тип
                amount=Decimal(str(-total_cost)),
                description=f'Доплата за ресурсы сервера: CPU +{extra_cpu}, RAM +{extra_memory}GB, Disk +{extra_disk}GB'
            )
        
        allocated_server = AllocatedServer.objects.create(
            user=request.user,
            name=name,
            host='localhost',  # Локальный сервер
            port=0,  # Не используется для локальных серверов
            username=f'user{request.user.id}',
            password='',  # Не используется для локальных серверов
            cpu_cores=cpu_cores,
            memory_gb=memory_gb,
            disk_gb=disk_gb,
            is_active=True
        )
        
        # Создаем директорию для сервера
        server_root = get_server_root(allocated_server)
        server_root.mkdir(parents=True, exist_ok=True)
        
        # Создаем README файл
        readme_path = server_root / 'README.txt'
        readme_path.write_text(f"""Добро пожаловать на ваш сервер {name}!

Это ваша персональная директория. Здесь вы можете:
- Загружать файлы
- Создавать директории
- Выполнять команды
- Управлять файлами

Ваш сервер:
- CPU: {cpu_cores} ядер
- Память: {memory_gb} GB
- Диск: {disk_gb} GB

Начните работу с командой: ls -la
""")
        
        return Response({
            'message': 'Выданный сервер успешно создан',
            'server': {
                'id': allocated_server.id,
                'name': allocated_server.name,
                'host': allocated_server.host,
                'port': allocated_server.port,
                'username': allocated_server.username,
                'cpu_cores': allocated_server.cpu_cores,
                'memory_gb': allocated_server.memory_gb,
                'disk_gb': allocated_server.disk_gb,
            },
            'cost': total_cost,
            'balance': float(profile.balance)
        }, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response(
            {'error': f'Ошибка при создании сервера: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def allocated_server_exec(request, server_id):
    """
    POST /api/servers/allocated/{id}/exec/
    Body: {"command": "ls -la"}
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'error': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    command = request.data.get('command')
    if not command:
        return Response(
            {'error': 'Команда не указана'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Получаем таймаут из запроса (по умолчанию 30 секунд, для pip install - 300 секунд)
    timeout = request.data.get('timeout', 30)
    if 'pip install' in command.lower():
        timeout = 300  # 5 минут для установки пакетов
    
    try:
        # Используем локальное выполнение команд для выданных серверов
        exit_code, stdout, stderr = exec_command_local(server, command, timeout=timeout)
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def allocated_server_ls(request, server_id):
    """
    GET /api/servers/allocated/{id}/ls/?path=/home/user
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'error': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    path = request.query_params.get('path', '~')
    
    try:
        # Используем локальное получение списка файлов для выданных серверов
        result = list_directory_local(server, path)
        return Response(result)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def allocated_server_upload_file(request, server_id):
    """
    POST /api/servers/allocated/{id}/upload_file/
    Body: multipart/form-data с полями 'file' и 'remote_path'
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    if 'file' not in request.FILES:
        return Response({
            'success': False,
            'message': 'Файл не предоставлен'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    remote_path = request.data.get('remote_path', '~')
    if not remote_path:
        remote_path = '~'
    
    uploaded_file = request.FILES['file']
    
    import tempfile
    import os
    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        for chunk in uploaded_file.chunks():
            tmp_file.write(chunk)
        tmp_path = tmp_file.name
    
    try:
        # Используем локальную загрузку файлов для выданных серверов
        result = upload_file_local(server, tmp_path, remote_path)
        return Response(result)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Ошибка загрузки: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def allocated_server_create_file(request, server_id):
    """
    POST /api/servers/allocated/{id}/create_file/
    Body: {"file_path": "/path/to/file"}
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    file_path = request.data.get('file_path')
    if not file_path:
        return Response({
            'success': False,
            'message': 'Путь к файлу не указан'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        result = create_file_local(server, file_path)
        return Response(result)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Ошибка создания файла: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def allocated_server_create_directory(request, server_id):
    """
    POST /api/servers/allocated/{id}/create_directory/
    Body: {"dir_path": "/path/to/directory"}
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    dir_path = request.data.get('dir_path')
    if not dir_path:
        return Response({
            'success': False,
            'message': 'Путь к директории не указан'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        result = create_directory_local(server, dir_path)
        return Response(result)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Ошибка создания директории: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def allocated_server_delete_file(request, server_id):
    """
    POST /api/servers/allocated/{id}/delete_file/
    Body: {"file_path": "/path/to/file"}
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    file_path = request.data.get('file_path')
    if not file_path:
        return Response({
            'success': False,
            'message': 'Путь к файлу не указан'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Используем локальное удаление файлов для выданных серверов
        result = delete_file_local(server, file_path)
        return Response(result)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Ошибка удаления: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def allocated_server_rename_file(request, server_id):
    """
    POST /api/servers/allocated/{id}/rename_file/
    Body: {"old_path": "/path/to/old", "new_path": "/path/to/new"}
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    old_path = request.data.get('old_path')
    new_path = request.data.get('new_path')
    
    if not old_path or not new_path:
        return Response({
            'success': False,
            'message': 'Старый и новый пути должны быть указаны'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        result = rename_file_local(server, old_path, new_path)
        return Response(result)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Ошибка переименования: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def allocated_server_read_file(request, server_id):
    """
    GET /api/servers/allocated/{id}/read_file/?file_path=/path/to/file
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    file_path = request.query_params.get('file_path')
    if not file_path:
        return Response({
            'success': False,
            'message': 'Путь к файлу не указан'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        result = read_file_local(server, file_path)
        return Response(result)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Ошибка чтения файла: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def allocated_server_write_file(request, server_id):
    """
    POST /api/servers/allocated/{id}/write_file/
    Body: {"file_path": "/path/to/file", "content": "file content"}
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    file_path = request.data.get('file_path')
    content = request.data.get('content', '')
    
    if not file_path:
        return Response({
            'success': False,
            'message': 'Путь к файлу не указан'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        result = write_file_local(server, file_path, content)
        return Response(result)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Ошибка записи файла: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def allocated_server_search_files(request, server_id):
    """
    POST /api/servers/allocated/{id}/search_files/
    Body: {"search_path": "~", "pattern": "filename", "max_results": 100}
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
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
        result = search_files_local(server, search_path, pattern, max_results)
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
def toggle_allocated_server_status(request, server_id):
    """
    POST /api/servers/allocated/{id}/toggle_status/
    Переключает статус выданного сервера
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
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


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_allocated_server(request, server_id):
    """
    DELETE /api/servers/allocated/{id}/
    Удаляет выданный сервер пользователя
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    try:
        # Удаляем директорию сервера
        import shutil
        import os
        from .allocated_server_utils import get_server_root
        
        server_root = get_server_root(server)
        if os.path.exists(server_root):
            shutil.rmtree(server_root)
        
        # Удаляем запись из БД
        server.delete()
        
        return Response({
            'success': True,
            'message': 'Сервер успешно удален'
        })
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Ошибка при удалении сервера: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def allocated_server_detailed_stats(request, server_id):
    """
    GET /api/servers/allocated/{id}/detailed_stats/
    Получает детальную статистику с процентами для allocated сервера
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'error': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    try:
        stats = get_detailed_stats_local(server)
        
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
                'message': 'Метрики не удалось получить.'
            })
        
        # Сохраняем метрику в БД только если есть хотя бы одна валидная метрика
        if any(v is not None for v in stats.values()):
            try:
                ServerMetric.objects.create(
                    allocated_server=server,
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
        logger.error(f"Ошибка получения метрик для allocated сервера {server.id}: {str(e)}\n{traceback.format_exc()}")
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def allocated_server_metrics_history(request, server_id):
    """
    GET /api/servers/allocated/{id}/metrics_history/?hours=1
    Получает историю метрик для allocated сервера
    """
    try:
        server = AllocatedServer.objects.get(id=server_id, user=request.user)
    except AllocatedServer.DoesNotExist:
        return Response(
            {'error': 'Сервер не найден'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    hours = int(request.query_params.get('hours', 1))
    
    try:
        since = timezone.now() - timedelta(hours=hours)
        metrics = ServerMetric.objects.filter(
            allocated_server=server,
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

