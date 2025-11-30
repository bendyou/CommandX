from django.contrib import admin
from .models import Server


@admin.register(Server)
class ServerAdmin(admin.ModelAdmin):
    list_display = ['name', 'host', 'port', 'username', 'auth_type', 'created_by', 'created_at']
    list_filter = ['auth_type', 'created_at']
    search_fields = ['name', 'host', 'username']
    readonly_fields = ['created_at', 'updated_at']





