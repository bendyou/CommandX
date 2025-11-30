from django.db import models
from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

User = get_user_model()


class UserProfile(models.Model):
    """Расширенный профиль пользователя"""
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name='Пользователь'
    )
    avatar = models.ImageField(
        upload_to='avatars/',
        null=True,
        blank=True,
        verbose_name='Аватар'
    )
    email_verified = models.BooleanField(
        default=False,
        verbose_name='Email подтвержден'
    )
    email_verification_token = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name='Токен подтверждения email'
    )
    balance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        verbose_name='Баланс'
    )
    subscription_type = models.CharField(
        max_length=20,
        choices=[('none', 'Без подписки'), ('pro', 'PRO'), ('plus', 'PLUS')],
        default='none',
        verbose_name='Тип подписки'
    )
    subscription_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Подписка истекает'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлен')
    
    @property
    def has_active_subscription(self):
        """Проверяет, активна ли подписка"""
        if self.subscription_type == 'none':
            return False
        if self.subscription_expires_at is None:
            return False
        from django.utils import timezone
        return self.subscription_expires_at > timezone.now()
    
    class Meta:
        verbose_name = 'Профиль пользователя'
        verbose_name_plural = 'Профили пользователей'
    
    def __str__(self):
        return f"Профиль {self.user.username}"


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Автоматически создает профиль при создании пользователя"""
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Автоматически сохраняет профиль при сохранении пользователя"""
    if hasattr(instance, 'profile'):
        instance.profile.save()


class Server(models.Model):
    """Модель сервера для подключения по SSH"""
    
    AUTH_PASSWORD = 'password'
    AUTH_PRIVATE_KEY = 'private_key'
    
    AUTH_CHOICES = [
        (AUTH_PASSWORD, 'Password'),
        (AUTH_PRIVATE_KEY, 'Private Key'),
    ]
    
    name = models.CharField(max_length=120, verbose_name='Название')
    host = models.CharField(max_length=255, verbose_name='Хост')
    port = models.PositiveIntegerField(default=22, verbose_name='Порт')
    username = models.CharField(max_length=120, verbose_name='Имя пользователя')
    auth_type = models.CharField(
        max_length=20, 
        choices=AUTH_CHOICES, 
        default=AUTH_PASSWORD,
        verbose_name='Тип аутентификации'
    )
    password = models.CharField(max_length=255, blank=True, default='', verbose_name='Пароль')
    private_key = models.TextField(blank=True, default='', verbose_name='Приватный ключ')
    passphrase = models.CharField(max_length=255, blank=True, default='', verbose_name='Пароль для ключа')
    
    created_by = models.ForeignKey(
        User, 
        null=True, 
        blank=True, 
        on_delete=models.SET_NULL, 
        related_name='servers',
        verbose_name='Создатель'
    )
    is_active = models.BooleanField(default=True, verbose_name='Активен')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлен')
    
    class Meta:
        verbose_name = 'Сервер'
        verbose_name_plural = 'Серверы'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.host}:{self.port})"


class Transaction(models.Model):
    """Модель транзакции"""
    TRANSACTION_TYPES = [
        ('deposit', 'Пополнение'),
        ('subscription_pro', 'Покупка PRO'),
        ('subscription_plus', 'Покупка PLUS'),
        ('admin_grant', 'Выдача админом'),
    ]
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='transactions',
        verbose_name='Пользователь'
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=TRANSACTION_TYPES,
        verbose_name='Тип транзакции'
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Сумма'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создана')
    
    class Meta:
        verbose_name = 'Транзакция'
        verbose_name_plural = 'Транзакции'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.user.username} - {self.get_transaction_type_display()} - {self.amount}₽"


class AllocatedServer(models.Model):
    """Выданный сервер пользователю"""
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='allocated_servers',
        verbose_name='Пользователь'
    )
    name = models.CharField(max_length=120, verbose_name='Название')
    host = models.CharField(max_length=255, verbose_name='Хост')
    port = models.PositiveIntegerField(default=22, verbose_name='Порт')
    username = models.CharField(max_length=120, verbose_name='Имя пользователя')
    password = models.CharField(max_length=255, blank=True, default='', verbose_name='Пароль')
    cpu_cores = models.PositiveIntegerField(default=1, verbose_name='Ядра CPU')
    memory_gb = models.PositiveIntegerField(default=1, verbose_name='Память (GB)')
    disk_gb = models.PositiveIntegerField(default=10, verbose_name='Диск (GB)')
    is_active = models.BooleanField(default=True, verbose_name='Активен')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    expires_at = models.DateTimeField(null=True, blank=True, verbose_name='Истекает')
    
    class Meta:
        verbose_name = 'Выданный сервер'
        verbose_name_plural = 'Выданные серверы'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.user.username})"


class ServerMetric(models.Model):
    """Метрики сервера для графиков мониторинга"""
    server = models.ForeignKey(
        Server,
        on_delete=models.CASCADE,
        related_name='metrics',
        null=True,
        blank=True,
        verbose_name='SSH Сервер'
    )
    allocated_server = models.ForeignKey(
        AllocatedServer,
        on_delete=models.CASCADE,
        related_name='metrics',
        null=True,
        blank=True,
        verbose_name='Выданный сервер'
    )
    cpu_percent = models.FloatField(null=True, blank=True, verbose_name='CPU %')
    memory_percent = models.FloatField(null=True, blank=True, verbose_name='Память %')
    memory_used_mb = models.FloatField(null=True, blank=True, verbose_name='Память использовано (MB)')
    memory_total_mb = models.FloatField(null=True, blank=True, verbose_name='Память всего (MB)')
    disk_percent = models.FloatField(null=True, blank=True, verbose_name='Диск %')
    disk_used_gb = models.FloatField(null=True, blank=True, verbose_name='Диск использовано (GB)')
    disk_total_gb = models.FloatField(null=True, blank=True, verbose_name='Диск всего (GB)')
    network_in_mb = models.FloatField(null=True, blank=True, verbose_name='Сеть входящий (MB)')
    network_out_mb = models.FloatField(null=True, blank=True, verbose_name='Сеть исходящий (MB)')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создана', db_index=True)
    
    class Meta:
        verbose_name = 'Метрика сервера'
        verbose_name_plural = 'Метрики серверов'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['server', '-created_at']),
            models.Index(fields=['allocated_server', '-created_at']),
        ]
    
    def __str__(self):
        server_name = self.server.name if self.server else (self.allocated_server.name if self.allocated_server else 'Unknown')
        return f"{server_name} - {self.created_at.strftime('%Y-%m-%d %H:%M:%S')}"
