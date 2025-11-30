from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ServerViewSet, 
    RegisterView, 
    UserProfileView, 
    AdminView,
    AdminBalanceView,
    AdminUserStatusView,
    AdminDeleteUserView,
    toggle_server_status
)
from .payment_views import (
    deposit_balance,
    buy_subscription,
    get_transactions,
    grant_subscription,
    create_allocated_server,
    get_allocated_servers,
    create_user_allocated_server,
    allocated_server_exec,
    allocated_server_ls,
    allocated_server_upload_file,
    allocated_server_create_file,
    allocated_server_create_directory,
    allocated_server_rename_file,
    allocated_server_read_file,
    allocated_server_write_file,
    allocated_server_delete_file,
    allocated_server_search_files,
    toggle_allocated_server_status,
    delete_allocated_server,
    allocated_server_detailed_stats,
    allocated_server_metrics_history
)
from .ai_views import ai_chat

router = DefaultRouter()
router.register(r'servers', ServerViewSet, basename='server')

urlpatterns = [
    # Важно: пути для серверов должны быть ДО router.urls, чтобы не конфликтовать
    path('servers/allocated/', get_allocated_servers, name='get-allocated-servers'),
    path('servers/allocated/<int:server_id>/exec/', allocated_server_exec, name='allocated-server-exec'),
    path('servers/allocated/<int:server_id>/ls/', allocated_server_ls, name='allocated-server-ls'),
    path('servers/allocated/<int:server_id>/upload_file/', allocated_server_upload_file, name='allocated-server-upload-file'),
    path('servers/allocated/<int:server_id>/create_file/', allocated_server_create_file, name='allocated-server-create-file'),
    path('servers/allocated/<int:server_id>/create_directory/', allocated_server_create_directory, name='allocated-server-create-directory'),
    path('servers/allocated/<int:server_id>/rename_file/', allocated_server_rename_file, name='allocated-server-rename-file'),
    path('servers/allocated/<int:server_id>/read_file/', allocated_server_read_file, name='allocated-server-read-file'),
    path('servers/allocated/<int:server_id>/write_file/', allocated_server_write_file, name='allocated-server-write-file'),
    path('servers/allocated/<int:server_id>/delete_file/', allocated_server_delete_file, name='allocated-server-delete-file'),
    path('servers/allocated/<int:server_id>/search_files/', allocated_server_search_files, name='allocated-server-search-files'),
    path('servers/allocated/<int:server_id>/toggle_status/', toggle_allocated_server_status, name='toggle-allocated-server-status'),
    path('servers/allocated/<int:server_id>/detailed_stats/', allocated_server_detailed_stats, name='allocated-server-detailed-stats'),
    path('servers/allocated/<int:server_id>/metrics_history/', allocated_server_metrics_history, name='allocated-server-metrics-history'),
    path('servers/allocated/<int:server_id>/', delete_allocated_server, name='delete-allocated-server'),
    path('servers/create-allocated/', create_user_allocated_server, name='create-user-allocated-server'),
    path('', include(router.urls)),
    path('servers/<int:server_id>/toggle_status/', toggle_server_status, name='toggle-server-status'),
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/profile/', UserProfileView.as_view(), name='profile'),
    path('admin/users/', AdminView.as_view(), name='admin-users'),
    path('admin/update-balance/', AdminBalanceView.as_view(), name='admin-update-balance'),
    path('admin/add-balance/', AdminBalanceView.as_view(), name='admin-add-balance'),
    path('admin/toggle-user-status/', AdminUserStatusView.as_view(), name='admin-toggle-status'),
    path('admin/delete-user/', AdminDeleteUserView.as_view(), name='admin-delete-user'),
    path('admin/grant-subscription/', grant_subscription, name='admin-grant-subscription'),
    path('admin/create-allocated-server/', create_allocated_server, name='admin-create-allocated-server'),
    path('payment/deposit/', deposit_balance, name='deposit-balance'),
    path('payment/buy-subscription/', buy_subscription, name='buy-subscription'),
    path('payment/transactions/', get_transactions, name='get-transactions'),
    path('ai/chat/', ai_chat, name='ai-chat'),
]

