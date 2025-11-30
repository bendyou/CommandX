import { useEffect, useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { userApi, UserProfile, UpdateProfileData } from '../api/user'
import ProfileMenu from '../components/ProfileMenu'
import AvatarCropper from '../components/AvatarCropper'
import './Profile.css'

export default function Profile() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editUsername, setEditUsername] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null)
  const [showCropper, setShowCropper] = useState(false)
  const [imageToCrop, setImageToCrop] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: userApi.getProfile,
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateProfileData) => userApi.updateProfile(data),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(['userProfile'], updatedProfile)
      setIsEditing(false)
      setSelectedAvatar(null)
      // Не сбрасываем avatarPreview, чтобы аватарка оставалась видимой
      if (updatedProfile.avatar) {
        setAvatarPreview(updatedProfile.avatar)
      }
    },
  })

  useEffect(() => {
    document.body.classList.add('page-transition-enter')
    return () => {
      document.body.classList.remove('page-transition-enter')
    }
  }, [])

  useEffect(() => {
    if (profile) {
      setEditUsername(profile.username)
      setEditEmail(profile.email)
      // Устанавливаем аватарку из профиля, если она есть
      if (profile.avatar) {
        setAvatarPreview(profile.avatar)
      } else {
        setAvatarPreview(null)
      }
    }
  }, [profile])

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    if (profile) {
      setEditUsername(profile.username)
      setEditEmail(profile.email)
      // Восстанавливаем аватарку из профиля
      setAvatarPreview(profile.avatar || null)
    }
    setSelectedAvatar(null)
  }

  const handleSave = async () => {
    if (!profile) return

    const updateData: UpdateProfileData = {}
    
    if (editUsername !== profile.username) {
      updateData.username = editUsername
    }
    if (editEmail !== profile.email) {
      updateData.email = editEmail
    }
    if (selectedAvatar !== null) {
      updateData.avatar = selectedAvatar
    }

    if (Object.keys(updateData).length > 0 || selectedAvatar) {
      updateMutation.mutate(updateData)
    } else {
      setIsEditing(false)
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Размер файла не должен превышать 10 МБ')
        return
      }
      if (!file.type.startsWith('image/')) {
        alert('Выберите изображение')
        return
      }
      // Открываем обрезчик вместо прямой установки
      setImageToCrop(file)
      setShowCropper(true)
    }
    // Сбрасываем input для возможности повторного выбора того же файла
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = (croppedFile: File) => {
    setSelectedAvatar(croppedFile)
    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(croppedFile)
    setShowCropper(false)
    setImageToCrop(null)
  }

  const handleCropCancel = () => {
    setShowCropper(false)
    setImageToCrop(null)
  }

  const handleRemoveAvatar = () => {
    setSelectedAvatar(null)
    setAvatarPreview(null)
    if (profile) {
      userApi.updateProfile({ avatar: null })
        .then((updatedProfile) => {
          queryClient.setQueryData(['userProfile'], updatedProfile)
        })
    }
  }

  const handleVerifyEmail = () => {
    // TODO: Реализовать отправку письма для подтверждения
    alert('Функция подтверждения email будет реализована позже')
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Не указано'
    const date = new Date(dateString)
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <div className="profile-container">
        <div className="profile-loading">
          <div className="loading-spinner"></div>
          <p>Загрузка профиля...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="profile-container">
        <div className="profile-error">
          <p>Не удалось загрузить профиль</p>
        </div>
      </div>
    )
  }

  return (
    <div className="profile-container">
      {showCropper && imageToCrop && (
        <AvatarCropper
          image={imageToCrop}
          onCrop={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
      
      <div className="profile-background">
        <div className="profile-bg-orb orb-1"></div>
        <div className="profile-bg-orb orb-2"></div>
        <div className="profile-bg-orb orb-3"></div>
      </div>

      <ProfileMenu />

      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-avatar-container">
            <div 
              className="profile-avatar"
              style={avatarPreview ? { 
                backgroundImage: `url(${avatarPreview})`, 
                backgroundSize: 'cover', 
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              } : {}}
            >
              {!avatarPreview && profile.username.charAt(0).toUpperCase()}
            </div>
            {isEditing && (
              <div className="avatar-actions">
                <button
                  className="avatar-action-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📷
                </button>
                {avatarPreview && (
                  <button
                    className="avatar-action-btn"
                    onClick={handleRemoveAvatar}
                  >
                    🗑️
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
          </div>
          {isEditing ? (
            <div className="profile-header-edit">
              <input
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="profile-edit-input"
                placeholder="Имя пользователя"
              />
            </div>
          ) : (
            <>
              <h1>{profile.username}</h1>
              <p className="profile-subtitle">Профиль пользователя</p>
            </>
          )}
        </div>

        <div className="profile-content">
          <div className="profile-info-card">
            <div className="info-item">
              <div className="info-label">
                <span className="info-icon">👤</span>
                <span>Имя пользователя</span>
              </div>
              {isEditing ? (
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="profile-edit-input"
                />
              ) : (
                <div className="info-value">{profile.username}</div>
              )}
            </div>

            <div className="info-item">
              <div className="info-label">
                <span className="info-icon">📧</span>
                <span>Email</span>
                {!profile.email_verified && (
                  <span className="email-verify-badge">Не подтвержден</span>
                )}
              </div>
              {isEditing ? (
                <div className="info-edit-group">
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="profile-edit-input"
                  />
                  {!profile.email_verified && (
                    <button
                      className="verify-email-btn"
                      onClick={handleVerifyEmail}
                    >
                      Подтвердить
                    </button>
                  )}
                </div>
              ) : (
                <div className="info-value-group">
                  <div className="info-value">{profile.email}</div>
                  {!profile.email_verified && (
                    <button
                      className="verify-email-btn"
                      onClick={handleVerifyEmail}
                    >
                      Подтвердить email
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="info-item">
              <div className="info-label">
                <span className="info-icon">🆔</span>
                <span>ID пользователя</span>
              </div>
              <div className="info-value">#{profile.id}</div>
            </div>

            <div className="info-item">
              <div className="info-label">
                <span className="info-icon">💰</span>
                <span>Баланс</span>
              </div>
              <div className="info-value-group">
                <div className="info-value">{profile.balance?.toFixed(2) || '0.00'} ₽</div>
                <button
                  className="profile-action-btn small"
                  onClick={() => navigate('/deposit')}
                  style={{ marginTop: '0.5rem' }}
                >
                  Пополнить
                </button>
              </div>
            </div>

            <div className="info-item">
              <div className="info-label">
                <span className="info-icon">⭐</span>
                <span>Подписка</span>
              </div>
              <div className="info-value-group">
                {profile.has_active_subscription ? (
                  <>
                    <div className="info-value">
                      {profile.subscription_type === 'pro' ? 'PRO' : 'PLUS'}
                    </div>
                    <div className="subscription-expires">
                      До: {profile.subscription_expires_at 
                        ? new Date(profile.subscription_expires_at).toLocaleDateString('ru-RU')
                        : 'Не указано'}
                    </div>
                  </>
                ) : (
                  <div className="info-value">Без подписки</div>
                )}
                <button
                  className="profile-action-btn small"
                  onClick={() => navigate('/subscriptions')}
                  style={{ marginTop: '0.5rem' }}
                >
                  {profile.has_active_subscription ? 'Продлить' : 'Купить'}
                </button>
              </div>
            </div>

            <div className="info-item">
              <div className="info-label">
                <span className="info-icon">📅</span>
                <span>Дата регистрации</span>
              </div>
              <div className="info-value">{formatDate(profile.date_joined)}</div>
            </div>
          </div>

          <div className="profile-actions">
            {isEditing ? (
              <>
                <button
                  className="profile-action-btn"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  <span>{updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}</span>
                </button>
                <button
                  className="profile-action-btn secondary"
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                >
                  <span>Отмена</span>
                </button>
              </>
            ) : (
              <>
                <button
                  className="profile-action-btn"
                  onClick={handleEdit}
                >
                  <span>Редактировать профиль</span>
                  <span className="button-arrow">→</span>
                </button>
                <button
                  className="profile-action-btn"
                  onClick={() => navigate('/servers')}
                >
                  <span>Мои серверы</span>
                  <span className="button-arrow">→</span>
                </button>
                <button
                  className="profile-action-btn"
                  onClick={() => navigate('/transactions')}
                >
                  <span>История транзакций</span>
                  <span className="button-arrow">→</span>
                </button>
              </>
            )}
          </div>

          {updateMutation.isError && (
            <div className="profile-error-message">
              Ошибка при обновлении профиля. Попробуйте еще раз.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
