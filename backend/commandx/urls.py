"""
URL configuration for commandx project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.permissions import AllowAny

# Создаем кастомные view с явным указанием AllowAny для обхода глобальных настроек
class PublicTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]

class PublicTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', PublicTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', PublicTokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('api.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

