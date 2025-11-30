import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { paymentApi, Transaction } from '../api/payment'
import ProfileMenu from '../components/ProfileMenu'
import './Transactions.css'

export default function Transactions() {
  const navigate = useNavigate()

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: paymentApi.getTransactions,
  })

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return '💰'
      case 'subscription_pro':
        return '⭐'
      case 'subscription_plus':
        return '👑'
      case 'admin_grant':
        return '🎁'
      default:
        return '📝'
    }
  }

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'deposit':
        return '#4ade80'
      case 'subscription_pro':
        return '#60a5fa'
      case 'subscription_plus':
        return '#a78bfa'
      case 'admin_grant':
        return '#fbbf24'
      default:
        return '#94a3b8'
    }
  }

  if (isLoading) {
    return (
      <div className="transactions-container">
        <div className="transactions-loading">
          <div className="loading-spinner"></div>
          <p>Загрузка транзакций...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="transactions-container">
      <div className="transactions-background">
        <div className="transactions-bg-orb orb-1"></div>
        <div className="transactions-bg-orb orb-2"></div>
        <div className="transactions-bg-orb orb-3"></div>
      </div>

      <ProfileMenu />

      <div className="transactions-card">
        <div className="transactions-header">
          <button
            className="back-btn"
            onClick={() => navigate('/profile')}
          >
            ← Назад
          </button>
          <h1>📜 История транзакций</h1>
          <p className="transactions-subtitle">Все ваши операции с балансом и подписками</p>
        </div>

        {transactions.length === 0 ? (
          <div className="transactions-empty">
            <div className="empty-icon">📭</div>
            <p>У вас пока нет транзакций</p>
            <button
              className="action-btn"
              onClick={() => navigate('/deposit')}
            >
              Пополнить баланс
            </button>
          </div>
        ) : (
          <div className="transactions-list">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="transaction-item"
                style={{
                  borderLeftColor: getTransactionColor(transaction.type)
                }}
              >
                <div className="transaction-icon">
                  {getTransactionIcon(transaction.type)}
                </div>
                <div className="transaction-info">
                  <div className="transaction-title">
                    {transaction.type_display}
                  </div>
                  <div className="transaction-description">
                    {transaction.description || 'Нет описания'}
                  </div>
                  <div className="transaction-date">
                    {formatDate(transaction.created_at)}
                  </div>
                </div>
                <div
                  className="transaction-amount"
                  style={{
                    color: transaction.type === 'deposit' ? '#4ade80' : '#f87171'
                  }}
                >
                  {transaction.type === 'deposit' ? '+' : '-'}
                  {transaction.amount.toFixed(2)} ₽
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}





