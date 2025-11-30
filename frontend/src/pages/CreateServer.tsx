import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { userApi } from '../api/user'
import { serversApi } from '../api/servers'
import { paymentApi } from '../api/payment'
import ServerForm from '../components/ServerForm'
import ProfileMenu from '../components/ProfileMenu'
import AlertDialog from '../components/AlertDialog'
import './CreateServer.css'

type ServerType = 'ssh' | 'allocated'

export default function CreateServer() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [serverType, setServerType] = useState<ServerType>('ssh')
  const [showSSHForm, setShowSSHForm] = useState(false)
  
  // Форма для выданного сервера
  const [allocatedName, setAllocatedName] = useState('')
  const [cpuCores, setCpuCores] = useState(1)
  const [memoryGb, setMemoryGb] = useState(1)
  const [diskGb, setDiskGb] = useState(10)
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

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: userApi.getProfile,
  })

  const createAllocatedMutation = useMutation({
    mutationFn: () => paymentApi.createAllocatedServer(allocatedName, cpuCores, memoryGb, diskGb),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['allocatedServers'] })
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      const cost = data.cost || 0
      if (cost > 0) {
        setAlertDialog({
          isOpen: true,
          title: 'Сервер создан!',
          message: `Выданный сервер успешно создан!\n\nС баланса списано: ${cost.toFixed(2)} ₽\nОстаток на балансе: ${data.balance?.toFixed(2) || 0} ₽`,
          type: 'success'
        })
      } else {
        setAlertDialog({
          isOpen: true,
          title: 'Сервер создан!',
          message: 'Выданный сервер успешно создан!',
          type: 'success'
        })
      }
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || 'Ошибка при создании сервера'
      if (error.response?.status === 402) {
        // Недостаточно средств
        const required = error.response?.data?.required_balance
        const current = error.response?.data?.current_balance
        setAlertDialog({
          isOpen: true,
          title: 'Недостаточно средств',
          message: `${errorMsg}\n\nТребуется: ${required?.toFixed(2) || 0} ₽\nВаш баланс: ${current?.toFixed(2) || 0} ₽\n\nНеобходимо пополнить баланс на ${((required || 0) - (current || 0)).toFixed(2)} ₽`,
          type: 'warning'
        })
      } else {
        setAlertDialog({
          isOpen: true,
          title: 'Ошибка',
          message: errorMsg,
          type: 'error'
        })
      }
    }
  })

  const hasProSubscription = profile?.has_active_subscription && 
    (profile.subscription_type === 'pro' || profile.subscription_type === 'plus')
  const hasPlusSubscription = profile?.has_active_subscription && 
    profile.subscription_type === 'plus'

  const handleAllocatedSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!allocatedName.trim()) {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: 'Введите название сервера',
        type: 'error'
      })
      return
    }
    createAllocatedMutation.mutate()
  }

  return (
    <div className="create-server-container">
      <div className="create-server-background">
        <div className="create-server-bg-orb orb-1"></div>
        <div className="create-server-bg-orb orb-2"></div>
        <div className="create-server-bg-orb orb-3"></div>
      </div>

      <ProfileMenu />

      <div className="create-server-card">
        <div className="create-server-header">
          <button
            className="back-btn"
            onClick={() => navigate('/servers')}
          >
            ← Назад
          </button>
          <h1>🖥️ Создание сервера</h1>
          <p className="create-server-subtitle">Выберите тип сервера для создания</p>
        </div>

        <div className="server-type-selector">
          <button
            className={`type-btn ${serverType === 'ssh' ? 'active' : ''}`}
            onClick={() => setServerType('ssh')}
            disabled={!hasProSubscription}
          >
            <div className="type-icon">🔌</div>
            <div className="type-name">Свой SSH сервер</div>
            <div className="type-description">
              Подключите свой существующий сервер по SSH
            </div>
            {!hasProSubscription && (
              <div className="type-requirement">Требуется подписка PRO или PLUS</div>
            )}
          </button>

          <button
            className={`type-btn ${serverType === 'allocated' ? 'active' : ''}`}
            onClick={() => setServerType('allocated')}
            disabled={!hasPlusSubscription}
          >
            <div className="type-icon">☁️</div>
            <div className="type-name">Выданный сервер</div>
            <div className="type-description">
              Создайте новый сервер с гарантированными ресурсами
            </div>
            {!hasPlusSubscription && (
              <div className="type-requirement">Требуется подписка PLUS</div>
            )}
          </button>
        </div>

        {serverType === 'ssh' && hasProSubscription && (
          <div className="server-form-section">
            <button
              className="open-form-btn"
              onClick={() => setShowSSHForm(true)}
            >
              Открыть форму добавления SSH сервера
            </button>
          </div>
        )}

        {serverType === 'allocated' && hasPlusSubscription && (
          <form onSubmit={handleAllocatedSubmit} className="allocated-server-form">
            <div className="form-group">
              <label>Название сервера *</label>
              <input
                type="text"
                value={allocatedName}
                onChange={(e) => setAllocatedName(e.target.value)}
                placeholder="Например: Мой сервер"
                required
                className="form-input"
              />
            </div>

            <div className="resources-grid">
              <div className="form-group">
                <label>CPU ядра (1-8)</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={cpuCores}
                  onChange={(e) => setCpuCores(parseInt(e.target.value) || 1)}
                  className="form-input"
                />
                <small className="resource-hint">Минимум: 1 (бесплатно), +50₽ за каждое ядро сверх</small>
              </div>

              <div className="form-group">
                <label>Память, GB (1-16)</label>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={memoryGb}
                  onChange={(e) => setMemoryGb(parseInt(e.target.value) || 1)}
                  className="form-input"
                />
                <small className="resource-hint">Минимум: 1 GB (бесплатно), +30₽ за каждый GB сверх</small>
              </div>

              <div className="form-group">
                <label>Диск, GB (10-100)</label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={diskGb}
                  onChange={(e) => setDiskGb(parseInt(e.target.value) || 10)}
                  className="form-input"
                />
                <small className="resource-hint">Минимум: 10 GB (бесплатно), +5₽ за каждый GB сверх</small>
              </div>
            </div>

            <div className="resource-preview">
              <div className="preview-item">
                <span>CPU:</span> <strong>{cpuCores} ядер</strong>
                {cpuCores > 1 && <span className="extra-cost">+{(cpuCores - 1) * 50}₽</span>}
              </div>
              <div className="preview-item">
                <span>Память:</span> <strong>{memoryGb} GB</strong>
                {memoryGb > 1 && <span className="extra-cost">+{(memoryGb - 1) * 30}₽</span>}
              </div>
              <div className="preview-item">
                <span>Диск:</span> <strong>{diskGb} GB</strong>
                {diskGb > 10 && <span className="extra-cost">+{(diskGb - 10) * 5}₽</span>}
              </div>
            </div>

            {(() => {
              const extraCpu = Math.max(0, cpuCores - 1)
              const extraMemory = Math.max(0, memoryGb - 1)
              const extraDisk = Math.max(0, diskGb - 10)
              const totalCost = (extraCpu * 50) + (extraMemory * 30) + (extraDisk * 5)
              
              return totalCost > 0 ? (
                <div className="cost-preview">
                  <div className="cost-label">Доплата за ресурсы:</div>
                  <div className="cost-value">{totalCost.toFixed(2)} ₽</div>
                  {profile && profile.balance < totalCost && (
                    <div className="cost-warning">
                      Недостаточно средств. Требуется пополнить баланс на {(totalCost - profile.balance).toFixed(2)} ₽
                    </div>
                  )}
                </div>
              ) : (
                <div className="cost-preview free">
                  <div className="cost-label">Минимальная конфигурация - бесплатно</div>
                </div>
              )
            })()}

            <div className="form-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => navigate('/servers')}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={createAllocatedMutation.isPending || !allocatedName.trim()}
              >
                {createAllocatedMutation.isPending ? 'Создание...' : 'Создать сервер'}
              </button>
            </div>
          </form>
        )}

        {(!hasProSubscription || (serverType === 'allocated' && !hasPlusSubscription)) && (
          <div className="subscription-prompt">
            <p>Для создания серверов требуется подписка</p>
            <button
              className="subscribe-btn"
              onClick={() => navigate('/subscriptions')}
            >
              Купить подписку
            </button>
          </div>
        )}
      </div>

      {showSSHForm && (
        <ServerForm
          server={null}
          onClose={() => setShowSSHForm(false)}
          onSuccess={async () => {
            setShowSSHForm(false)
            console.log('ServerForm onSuccess called, refetching...')
            // Принудительно обновляем запросы и ждем завершения
            try {
              await queryClient.refetchQueries({ queryKey: ['servers'], exact: true })
              await queryClient.refetchQueries({ queryKey: ['allocatedServers'], exact: true })
              console.log('Queries refetched, navigating...')
            } catch (error) {
              console.error('Error refetching queries:', error)
            }
            // Небольшая задержка перед переходом
            setTimeout(() => {
              navigate('/servers')
            }, 200)
          }}
        />
      )}

      <AlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        type={alertDialog.type}
        onClose={() => {
          setAlertDialog({ ...alertDialog, isOpen: false })
          if (alertDialog.type === 'success') {
            navigate('/servers')
          } else if (alertDialog.type === 'warning' && alertDialog.message.includes('Недостаточно средств')) {
            navigate('/deposit')
          }
        }}
      />
    </div>
  )
}

