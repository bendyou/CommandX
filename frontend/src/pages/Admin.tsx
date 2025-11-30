import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { adminApi, AdminUser } from '../api/admin'
import { userApi } from '../api/user'
import ProfileMenu from '../components/ProfileMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import './Admin.css'

export default function Admin() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceAction, setBalanceAction] = useState<'set' | 'add'>('add')
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    type?: 'danger' | 'warning' | 'info'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'info'
  })
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [subscriptionType, setSubscriptionType] = useState<'pro' | 'plus' | null>(null)
  const [subscriptionDays, setSubscriptionDays] = useState(30)

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: userApi.getProfile,
  })

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: adminApi.getUsers,
    enabled: profile?.is_staff === true,
  })

  useEffect(() => {
    if (profile && !profile.is_staff) {
      navigate('/profile')
    }
  }, [profile, navigate])

  const updateBalanceMutation = useMutation({
    mutationFn: ({ userId, amount }: { userId: number; amount: number }) =>
      balanceAction === 'set'
        ? adminApi.updateBalance(userId, amount)
        : adminApi.addBalance(userId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      setShowBalanceModal(false)
      setBalanceAmount('')
      setSelectedUser(null)
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: adminApi.toggleUserStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
    },
  })

  const grantSubscriptionMutation = useMutation({
    mutationFn: ({ userId, type, days }: { userId: number; type: 'pro' | 'plus' | 'none'; days: number }) =>
      adminApi.grantSubscription(userId, type, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      setShowSubscriptionModal(false)
      setSubscriptionType(null)
      setSubscriptionDays(30)
      setSelectedUser(null)
    },
  })

  const handleBalanceClick = (user: AdminUser) => {
    setSelectedUser(user)
    setBalanceAmount('')
    setBalanceAction('add')
    setShowBalanceModal(true)
  }

  const handleBalanceSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || !balanceAmount) return

    const amount = parseFloat(balanceAmount)
    if (isNaN(amount) || amount < 0) {
      alert('Введите корректную сумму')
      return
    }

    updateBalanceMutation.mutate({
      userId: selectedUser.id,
      amount: amount
    })
  }

  const handleToggleStatus = (userId: number, currentStatus: boolean) => {
    const action = currentStatus ? 'деактивировать' : 'активировать'
    setConfirmDialog({
      isOpen: true,
      title: 'Изменение статуса пользователя',
      message: `Вы уверены, что хотите ${action} этого пользователя?`,
      type: 'warning',
      onConfirm: () => {
        toggleStatusMutation.mutate(userId)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      }
    })
  }

  const handleDeleteUser = (userId: number, username: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Удаление пользователя',
      message: `Вы уверены, что хотите удалить пользователя ${username}? Это действие нельзя отменить.`,
      type: 'danger',
      confirmText: 'Удалить',
      onConfirm: () => {
        deleteUserMutation.mutate(userId)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      }
    })
  }

  const handleGrantSubscription = (user: AdminUser) => {
    setSelectedUser(user)
    setSubscriptionType(null)
    setSubscriptionDays(30)
    setShowSubscriptionModal(true)
  }

  const handleSubscriptionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    if (subscriptionType === null) {
      // Убираем подписку
      setConfirmDialog({
        isOpen: true,
        title: 'Удаление подписки',
        message: `Вы уверены, что хотите убрать подписку у пользователя ${selectedUser.username}?`,
        type: 'warning',
        confirmText: 'Убрать',
        onConfirm: () => {
          grantSubscriptionMutation.mutate({
            userId: selectedUser.id,
            type: 'none' as any,
            days: 0
          })
          setConfirmDialog({ ...confirmDialog, isOpen: false })
        }
      })
    } else {
      grantSubscriptionMutation.mutate({
        userId: selectedUser.id,
        type: subscriptionType,
        days: subscriptionDays
      })
    }
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

  if (!profile || !profile.is_staff) {
    return (
      <div className="admin-container">
        <div className="admin-loading">
          <p>Доступ запрещен. Требуются права администратора.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="admin-container">
        <div className="admin-loading">
          <div className="loading-spinner"></div>
          <p>Загрузка пользователей...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div className="admin-background">
        <div className="admin-bg-orb orb-1"></div>
        <div className="admin-bg-orb orb-2"></div>
        <div className="admin-bg-orb orb-3"></div>
      </div>

      <ProfileMenu />

      <div className="admin-card">
        <div className="admin-header">
          <h1>⚙️ Админ панель</h1>
          <p className="admin-subtitle">Управление пользователями</p>
        </div>

        <div className="admin-stats">
          <div className="admin-stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-info">
              <div className="stat-value">{users.length}</div>
              <div className="stat-label">Всего пользователей</div>
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <div className="stat-value">{users.filter(u => u.is_active).length}</div>
              <div className="stat-label">Активных</div>
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-icon">👑</div>
            <div className="stat-info">
              <div className="stat-value">{users.filter(u => u.is_staff).length}</div>
              <div className="stat-label">Администраторов</div>
            </div>
          </div>
        </div>

        <div className="admin-users-list">
          <h2>Список пользователей</h2>
          <div className="users-table">
            {users.map((user) => (
              <div key={user.id} className="user-row">
                <div className="user-info">
                  <div 
                    className="user-avatar-small"
                    style={user.avatar ? {
                      backgroundImage: `url(${user.avatar})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat'
                    } : {}}
                  >
                    {!user.avatar && user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-details">
                    <div className="user-name-row">
                      <span className="user-name">{user.username}</span>
                      {user.is_staff && <span className="admin-badge">👑 Админ</span>}
                      {!user.is_active && <span className="inactive-badge">🚫 Неактивен</span>}
                    </div>
                    <div className="user-meta">
                      <span>ID: #{user.id}</span>
                      <span>•</span>
                      <span>{user.email}</span>
                      <span>•</span>
                      <span>Баланс: {user.balance.toFixed(2)} ₽</span>
                    </div>
                  </div>
                </div>
                <div className="user-actions">
                  <button
                    className="action-btn balance-btn"
                    onClick={() => handleBalanceClick(user)}
                  >
                    💰 Баланс
                  </button>
                  <button
                    className="action-btn subscription-btn"
                    onClick={() => handleGrantSubscription(user)}
                  >
                    ⭐ Подписка
                  </button>
                  <button
                    className={`action-btn status-btn ${user.is_active ? 'active' : 'inactive'}`}
                    onClick={() => handleToggleStatus(user.id, user.is_active)}
                    title={user.is_active ? 'Деактивировать пользователя' : 'Активировать пользователя'}
                  >
                    {user.is_active ? '✅ Активен' : '🚫 Неактивен'}
                  </button>
                  {!user.is_staff && (
                    <button
                      className="action-btn delete-btn"
                      onClick={() => handleDeleteUser(user.id, user.username)}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showBalanceModal && selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setShowBalanceModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Управление балансом</h3>
              <button className="close-btn" onClick={() => setShowBalanceModal(false)}>×</button>
            </div>
            <div className="admin-modal-content">
              <div className="modal-user-info">
                <div 
                  className="modal-user-avatar"
                  style={selectedUser.avatar ? {
                    backgroundImage: `url(${selectedUser.avatar})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  } : {}}
                >
                  {!selectedUser.avatar && selectedUser.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="modal-user-name">{selectedUser.username}</div>
                  <div className="modal-user-balance">Текущий баланс: {selectedUser.balance.toFixed(2)} ₽</div>
                </div>
              </div>

              <form onSubmit={handleBalanceSubmit} className="balance-form">
                <div className="form-group">
                  <label>Действие</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="add"
                        checked={balanceAction === 'add'}
                        onChange={(e) => setBalanceAction(e.target.value as 'add' | 'set')}
                      />
                      <span>Добавить к балансу</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="set"
                        checked={balanceAction === 'set'}
                        onChange={(e) => setBalanceAction(e.target.value as 'add' | 'set')}
                      />
                      <span>Установить баланс</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Сумма (₽)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="balance-input"
                  />
                </div>

                {balanceAmount && !isNaN(parseFloat(balanceAmount)) && (
                  <div className="balance-preview">
                    {balanceAction === 'add' ? (
                      <span>Новый баланс: {(selectedUser.balance + parseFloat(balanceAmount)).toFixed(2)} ₽</span>
                    ) : (
                      <span>Новый баланс: {parseFloat(balanceAmount).toFixed(2)} ₽</span>
                    )}
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setShowBalanceModal(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="submit-btn"
                    disabled={updateBalanceMutation.isPending}
                  >
                    {updateBalanceMutation.isPending ? 'Сохранение...' : 'Применить'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showSubscriptionModal && selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setShowSubscriptionModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Выдача подписки</h3>
              <button className="close-btn" onClick={() => setShowSubscriptionModal(false)}>×</button>
            </div>
            <div className="admin-modal-content">
              <div className="modal-user-info">
                <div 
                  className="modal-user-avatar"
                  style={selectedUser.avatar ? {
                    backgroundImage: `url(${selectedUser.avatar})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  } : {}}
                >
                  {!selectedUser.avatar && selectedUser.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="modal-user-name">{selectedUser.username}</div>
                  <div className="modal-user-balance">
                    Текущая подписка: {selectedUser.has_active_subscription 
                      ? selectedUser.subscription_type.toUpperCase() 
                      : 'Нет'}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubscriptionSubmit} className="subscription-form">
                <div className="form-group">
                  <label>Тип подписки</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="pro"
                        checked={subscriptionType === 'pro'}
                        onChange={(e) => setSubscriptionType(e.target.value as 'pro' | 'plus')}
                      />
                      <span>⭐ PRO</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="plus"
                        checked={subscriptionType === 'plus'}
                        onChange={(e) => setSubscriptionType(e.target.value as 'pro' | 'plus')}
                      />
                      <span>💎 PLUS</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        value="none"
                        checked={subscriptionType === null}
                        onChange={() => setSubscriptionType(null)}
                      />
                      <span>🚫 Убрать подписку</span>
                    </label>
                  </div>
                </div>

                {subscriptionType && (
                  <div className="form-group">
                    <label>Количество дней</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={subscriptionDays}
                      onChange={(e) => setSubscriptionDays(parseInt(e.target.value) || 30)}
                      className="balance-input"
                      required
                    />
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setShowSubscriptionModal(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="submit-btn"
                    disabled={grantSubscriptionMutation.isPending || (subscriptionType === null && !selectedUser.has_active_subscription)}
                  >
                    {grantSubscriptionMutation.isPending ? 'Обработка...' : subscriptionType ? 'Выдать' : 'Убрать подписку'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={() => {
          confirmDialog.onConfirm()
          setConfirmDialog({ ...confirmDialog, isOpen: false })
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  )
}

