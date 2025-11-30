import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { paymentApi } from '../api/payment'
import { userApi } from '../api/user'
import ProfileMenu from '../components/ProfileMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import AlertDialog from '../components/AlertDialog'
import './Subscriptions.css'

export default function Subscriptions() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'plus' | null>(null)
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

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: userApi.getProfile,
  })

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type?: 'success' | 'error' | 'info' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  })

  const buyMutation = useMutation({
    mutationFn: (type: 'pro' | 'plus') => paymentApi.buySubscription(type),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setAlertDialog({
        isOpen: true,
        title: 'Подписка активирована!',
        message: `Подписка ${data.subscription_type.toUpperCase()} успешно активирована!\n\nДействует до: ${new Date(data.expires_at).toLocaleDateString('ru-RU')}\nОстаток на балансе: ${data.balance?.toFixed(2) || 0} ₽`,
        type: 'success'
      })
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.error || 'Ошибка при покупке подписки',
        type: 'error'
      })
    }
  })

  const handleBuy = (type: 'pro' | 'plus') => {
    if (!profile) return
    const price = type === 'pro' ? 200 : 1000
    if (profile.balance < price) {
      setAlertDialog({
        isOpen: true,
        title: 'Недостаточно средств',
        message: `Недостаточно средств на балансе.\n\nТребуется: ${price} ₽\nВаш баланс: ${profile.balance.toFixed(2)} ₽\n\nНеобходимо пополнить баланс на ${(price - profile.balance).toFixed(2)} ₽`,
        type: 'warning'
      })
      return
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Покупка подписки',
      message: `Вы уверены, что хотите купить подписку ${type.toUpperCase()} за ${price}₽?`,
      type: 'info',
      onConfirm: () => {
        buyMutation.mutate(type)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      }
    })
  }

  const plans = [
    {
      type: 'pro' as const,
      name: 'PRO',
      price: 200,
      icon: '⭐',
      color: '#60a5fa',
      features: [
        'До 5 собственных серверов по SSH',
        'Базовые ресурсы',
        'Приоритетная поддержка',
        'Доступ к API'
      ]
    },
    {
      type: 'plus' as const,
      name: 'PLUS',
      price: 1000,
      icon: '👑',
      color: '#a78bfa',
      features: [
        'Неограниченное количество собственных серверов',
        'Выданные серверы с гарантированными ресурсами',
        'Высокопроизводительные CPU и память',
        'Расширенное хранилище',
        'Приоритетная поддержка 24/7',
        'Полный доступ к API'
      ]
    }
  ]

  return (
    <div className="subscriptions-container">
      <div className="subscriptions-background">
        <div className="subscriptions-bg-orb orb-1"></div>
        <div className="subscriptions-bg-orb orb-2"></div>
        <div className="subscriptions-bg-orb orb-3"></div>
      </div>

      <ProfileMenu />

      <div className="subscriptions-card">
        <div className="subscriptions-header">
          <button
            className="back-btn"
            onClick={() => navigate('/profile')}
          >
            ← Назад
          </button>
          <h1>⭐ Подписки</h1>
          <p className="subscriptions-subtitle">Выберите подходящий план для ваших нужд</p>
          {profile && (
            <div className="balance-info">
              Ваш баланс: <strong>{profile.balance.toFixed(2)} ₽</strong>
            </div>
          )}
        </div>

        <div className="plans-grid">
          {plans.map((plan) => {
            const canAfford = profile ? profile.balance >= plan.price : false
            const isActive = profile?.subscription_type === plan.type && profile?.has_active_subscription

            return (
              <div
                key={plan.type}
                className={`plan-card ${selectedPlan === plan.type ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                style={{ borderColor: plan.color }}
              >
                <div className="plan-header" style={{ background: `linear-gradient(135deg, ${plan.color} 0%, ${plan.color}dd 100%)` }}>
                  <div className="plan-icon">{plan.icon}</div>
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price">
                    {plan.price} <span className="currency">₽</span>
                    <div className="plan-period">/ 30 дней</div>
                  </div>
                </div>

                <div className="plan-features">
                  <ul>
                    {plan.features.map((feature, index) => (
                      <li key={index}>✓ {feature}</li>
                    ))}
                  </ul>
                </div>

                <div className="plan-actions">
                  {isActive ? (
                    <div className="plan-status active-status">
                      ✓ Активна до {profile?.subscription_expires_at 
                        ? new Date(profile.subscription_expires_at).toLocaleDateString('ru-RU')
                        : ''}
                    </div>
                  ) : (
                    <button
                      className={`plan-buy-btn ${!canAfford ? 'disabled' : ''}`}
                      onClick={() => canAfford ? handleBuy(plan.type) : navigate('/deposit')}
                      disabled={buyMutation.isPending}
                      style={{ background: plan.color }}
                    >
                      {!canAfford ? 'Пополнить баланс' : buyMutation.isPending ? 'Обработка...' : 'Купить'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText="Купить"
        onConfirm={() => {
          confirmDialog.onConfirm()
          setConfirmDialog({ ...confirmDialog, isOpen: false })
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      <AlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        type={alertDialog.type}
        onClose={() => {
          setAlertDialog({ ...alertDialog, isOpen: false })
          if (alertDialog.type === 'success') {
            navigate('/profile')
          } else if (alertDialog.type === 'warning' && alertDialog.message.includes('Недостаточно средств')) {
            navigate('/deposit')
          }
        }}
      />
    </div>
  )
}

