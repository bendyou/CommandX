#!/usr/bin/env python
"""
Скрипт для создания администратора и очистки базы данных
Удаляет всех существующих пользователей и создает нового admin пользователя
"""
import os
import django

# Настройка Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'commandx.settings')
django.setup()

from django.contrib.auth import get_user_model
from api.models import UserProfile

User = get_user_model()

def create_admin():
    # Удаляем всех существующих пользователей (включая admin и суперпользователей)
    print("Удаление всех пользователей...")
    User.objects.all().delete()
    print("Все пользователи удалены.")
    
    # Создаем нового администратора
    print("Создание администратора...")
    
    admin_user = User.objects.create_user(
        username='admin',
        email='admin@commandx.local',
        password='admin',
        is_staff=True,
        is_superuser=True,
        is_active=True
    )
    print(f"Пользователь admin создан (ID: {admin_user.id})")
    
    # Создаем или обновляем профиль
    profile, created = UserProfile.objects.get_or_create(user=admin_user)
    profile.balance = 1000.00  # Начальный баланс
    profile.save()
    
    if created:
        print("Профиль администратора создан")
    else:
        print("Профиль администратора обновлен")
    
    print("\n" + "="*50)
    print("Администратор успешно создан!")
    print("="*50)
    print(f"Имя пользователя: admin")
    print(f"Пароль: admin")
    print(f"ID: {admin_user.id}")
    print(f"Баланс: {profile.balance} ₽")
    print("="*50)

if __name__ == '__main__':
    create_admin()

