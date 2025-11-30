import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { serversApi, Server } from '../api/servers'
import { paymentApi, AllocatedServer } from '../api/payment'
import ServerForm from '../components/ServerForm'
import ConfirmDialog from '../components/ConfirmDialog'
import ProfileMenu from '../components/ProfileMenu'
import './Dashboard.css'

export default function Dashboard() {
  const [showForm, setShowForm] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
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
    type: 'danger'
  })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: servers = [], isLoading, refetch: refetchServers } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const result = await serversApi.list()
      console.log('Servers loaded from API (after processing):', result)
      // Убеждаемся, что это массив
      return Array.isArray(result) ? result : []
    },
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })
  
  // Логируем текущее состояние серверов
  useEffect(() => {
    console.log('Current servers state:', servers, 'Length:', servers.length)
  }, [servers])

  const { data: allocatedServers = [], isLoading: isLoadingAllocated, refetch: refetchAllocated } = useQuery({
    queryKey: ['allocatedServers'],
    queryFn: paymentApi.getAllocatedServers,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const deleteMutation = useMutation({
    mutationFn: serversApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
  })

  const toggleServerStatusMutation = useMutation({
    mutationFn: serversApi.toggleStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
  })

  const toggleAllocatedServerStatusMutation = useMutation({
    mutationFn: paymentApi.toggleAllocatedServerStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocatedServers'] })
    },
  })

  const deleteAllocatedServerMutation = useMutation({
    mutationFn: paymentApi.deleteAllocatedServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocatedServers'] })
    },
  })

  const handleEdit = (server: Server) => {
    setEditingServer(server)
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Удаление сервера',
      message: 'Вы уверены, что хотите удалить этот сервер? Это действие нельзя отменить.',
      type: 'danger',
      onConfirm: () => {
        deleteMutation.mutate(id)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      }
    })
  }

  const handleDeleteAllocated = async (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Удаление сервера',
      message: 'Вы уверены, что хотите удалить этот выданный сервер? Это действие нельзя отменить. Все данные на сервере будут удалены.',
      type: 'danger',
      onConfirm: () => {
        deleteAllocatedServerMutation.mutate(id)
        setConfirmDialog({ ...confirmDialog, isOpen: false })
      }
    })
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingServer(null)
  }

  // Обновляем список серверов при монтировании компонента и при фокусе окна
  useEffect(() => {
    const handleFocus = () => {
      console.log('Window focused, refetching servers...')
      refetchServers()
      refetchAllocated()
    }
    
    // Обновляем сразу при монтировании
    refetchServers()
    refetchAllocated()
    
    // Обновляем при фокусе окна
    window.addEventListener('focus', handleFocus)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [refetchServers, refetchAllocated])

  if (isLoading || isLoadingAllocated) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="dashboard">
      <ProfileMenu />
      <div className="dashboard-header">
        <h2>Мои серверы</h2>
        <div className="header-actions">
          <button onClick={() => navigate('/servers/create')} className="btn-primary">
            + Создать сервер
          </button>
        </div>
      </div>

      {servers.length === 0 && allocatedServers.length === 0 ? (
        <div className="empty-state">
          <p>У вас пока нет серверов</p>
          <button onClick={() => navigate('/servers/create')} className="btn-primary">
            + Создать первый сервер
          </button>
        </div>
      ) : (
        <>
          {servers.length > 0 && (
            <div className="servers-section">
              <h3 className="section-title">🔌 SSH Серверы</h3>
              <div className="servers-grid">
                {servers.map((server, index) => (
                  <div key={server.id} className={`server-card server-card-animate ${!server.is_active ? 'inactive' : ''}`} style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className="server-card-header">
                      <div className="server-header-row">
                        <h3>{server.name}</h3>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={server.is_active}
                            onChange={() => toggleServerStatusMutation.mutate(server.id)}
                            disabled={toggleServerStatusMutation.isPending}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <span className={`auth-badge ${server.auth_type}`}>
                        {server.auth_type === 'password' ? 'Пароль' : 'Ключ'}
                      </span>
                    </div>
                    <div className="server-info">
                      <p><strong>Хост:</strong> {server.host}:{server.port}</p>
                      <p><strong>Пользователь:</strong> {server.username}</p>
                      <p className="server-status">
                        {server.is_active ? '🟢 Активен' : '🔴 Выключен'}
                      </p>
                    </div>
                    <div className="server-actions">
                      <button
                        onClick={() => navigate(`/servers/${server.id}`)}
                        className="btn-secondary"
                      >
                        Открыть
                      </button>
                      <button
                        onClick={() => handleEdit(server)}
                        className="btn-secondary"
                      >
                        Редактировать
                      </button>
                      <button
                        onClick={() => handleDelete(server.id)}
                        className="btn-danger"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allocatedServers.length > 0 && (
            <div className="servers-section">
              <h3 className="section-title">☁️ Выданные серверы</h3>
              <div className="servers-grid">
                {allocatedServers.map((server, index) => (
                  <div key={server.id} className={`server-card allocated server-card-animate ${!server.is_active ? 'inactive' : ''}`} style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className="server-card-header">
                      <div className="server-header-row">
                        <h3>{server.name}</h3>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={server.is_active}
                            onChange={() => toggleAllocatedServerStatusMutation.mutate(server.id)}
                            disabled={toggleAllocatedServerStatusMutation.isPending}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <span className="allocated-badge">Выданный</span>
                    </div>
                    <div className="server-info">
                      <p><strong>Хост:</strong> {server.host}:{server.port}</p>
                      <p><strong>Пользователь:</strong> {server.username}</p>
                      <p className="server-status">
                        {server.is_active ? '🟢 Активен' : '🔴 Выключен'}
                      </p>
                      <div className="server-resources">
                        <span>CPU: {server.cpu_cores} ядер</span>
                        <span>RAM: {server.memory_gb} GB</span>
                        <span>Диск: {server.disk_gb} GB</span>
                      </div>
                    </div>
                           <div className="server-actions">
                             <button
                               onClick={() => navigate(`/servers/${server.id}`)}
                               className="btn-secondary"
                             >
                               Открыть
                             </button>
                             <button
                               onClick={() => handleDeleteAllocated(server.id)}
                               className="btn-danger"
                               disabled={deleteAllocatedServerMutation.isPending}
                             >
                               Удалить
                             </button>
                           </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showForm && (
        <ServerForm
          server={editingServer}
          onClose={handleFormClose}
          onSuccess={async () => {
            handleFormClose()
            // Принудительно обновляем список серверов
            await queryClient.refetchQueries({ queryKey: ['servers'] })
          }}
        />
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

