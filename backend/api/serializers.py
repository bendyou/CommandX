from rest_framework import serializers
from .models import Server


class ServerSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Server"""
    
    class Meta:
        model = Server
        fields = [
            'id', 'name', 'host', 'port', 'username', 'auth_type',
            'password', 'private_key', 'passphrase', 'created_by',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'private_key': {'write_only': True, 'required': False},
            'passphrase': {'write_only': True, 'required': False},
        }
    
    def validate(self, data):
        """Валидация данных в зависимости от типа аутентификации"""
        auth_type = data.get('auth_type', Server.AUTH_PASSWORD)
        
        if auth_type == Server.AUTH_PASSWORD:
            if not data.get('password'):
                raise serializers.ValidationError({
                    'password': 'Пароль обязателен при использовании аутентификации по паролю'
                })
        elif auth_type == Server.AUTH_PRIVATE_KEY:
            if not data.get('private_key'):
                raise serializers.ValidationError({
                    'private_key': 'Приватный ключ обязателен при использовании аутентификации по ключу'
                })
        
        return data


class ServerListSerializer(serializers.ModelSerializer):
    """Упрощенный сериализатор для списка серверов (без чувствительных данных)"""
    
    class Meta:
        model = Server
        fields = ['id', 'name', 'host', 'port', 'username', 'auth_type', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CommandSerializer(serializers.Serializer):
    """Сериализатор для выполнения команды"""
    command = serializers.CharField(max_length=1000, help_text='Команда для выполнения')


class DirectorySerializer(serializers.Serializer):
    """Сериализатор для получения списка файлов"""
    path = serializers.CharField(
        max_length=500, 
        default='~',
        required=False,
        help_text='Путь к директории'
    )

