import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { paymentApi } from '../api/payment'
import { userApi } from '../api/user'
import ProfileMenu from '../components/ProfileMenu'
import AlertDialog from '../components/AlertDialog'
import './Deposit.css'

export default function Deposit() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
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
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)

  const depositMutation = useMutation({
    mutationFn: (amount: number) => paymentApi.deposit(amount),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setAlertDialog({
        isOpen: true,
        title: 'Баланс пополнен!',
        message: `Баланс успешно пополнен!\n\nПополнено: ${amount} ₽\nТекущий баланс: ${data.balance?.toFixed(2) || 0} ₽`,
        type: 'success'
      })
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.error || 'Ошибка при пополнении баланса',
        type: 'error'
      })
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: 'Введите корректную сумму',
        type: 'error'
      })
      return
    }
    depositMutation.mutate(numAmount)
  }

  const quickAmounts = [100, 500, 1000, 2000, 5000]

  return (
    <div className="deposit-container">
      <div className="deposit-background">
        <div className="deposit-bg-orb orb-1"></div>
        <div className="deposit-bg-orb orb-2"></div>
        <div className="deposit-bg-orb orb-3"></div>
      </div>

      <ProfileMenu />

      <div className="deposit-card">
        <div className="deposit-header">
          <button
            className="back-btn"
            onClick={() => navigate('/profile')}
          >
            ← Назад
          </button>
          <h1>💰 Пополнение баланса</h1>
          <p className="deposit-subtitle">Пополните ваш баланс для покупки подписок и услуг</p>
        </div>

        <form onSubmit={handleSubmit} className="deposit-form">
          <div className="form-group">
            <label>Сумма пополнения (₽)</label>
            <input
              type="number"
              step="0.01"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Введите сумму"
              required
              className="amount-input"
            />
          </div>

          <div className="quick-amounts">
            <label>Быстрый выбор:</label>
            <div className="quick-amounts-grid">
              {quickAmounts.map((quickAmount) => (
                <button
                  key={quickAmount}
                  type="button"
                  className={`quick-amount-btn ${selectedAmount === quickAmount ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedAmount(quickAmount)
                    setAmount(quickAmount.toString())
                  }}
                >
                  {quickAmount} ₽
                </button>
              ))}
            </div>
          </div>

          {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
            <div className="deposit-preview">
              <div className="preview-label">К пополнению:</div>
              <div className="preview-amount">{parseFloat(amount).toFixed(2)} ₽</div>
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={() => navigate('/profile')}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="submit-btn"
              disabled={depositMutation.isPending || !amount || parseFloat(amount) <= 0}
            >
              {depositMutation.isPending ? 'Пополнение...' : 'Пополнить'}
            </button>
          </div>
        </form>
      </div>

      <AlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        type={alertDialog.type}
        onClose={() => {
          setAlertDialog({ ...alertDialog, isOpen: false })
          if (alertDialog.type === 'success') {
            navigate('/profile')
          }
        }}
      />
    </div>
  )
}

