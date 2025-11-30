import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { serversApi } from '../api/servers'
import { paymentApi } from '../api/payment'
import Console from '../components/Console'
import FileManager from '../components/FileManager'
import Monitoring from '../components/Monitoring'
import PackagesManager from '../components/PackagesManager'
import ProfileMenu from '../components/ProfileMenu'
import AIAssistant from '../components/AIAssistant'
import './ServerDetail.css'

type TabType = 'console' | 'files' | 'monitoring' | 'packages'

const VALID_TABS: TabType[] = ['console', 'files', 'monitoring', 'packages']

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  // Получаем вкладку из URL или используем 'console' по умолчанию
  const getTabFromUrl = (): TabType => {
    const tab = searchParams.get('tab') as TabType
    return tab && VALID_TABS.includes(tab) ? tab : 'console'
  }
  
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    // Инициализируем из URL при первом рендере
    const tab = searchParams.get('tab') as TabType
    return tab && VALID_TABS.includes(tab) ? tab : 'console'
  })

  const [serverType, setServerType] = useState<'ssh' | 'allocated' | null>(null)
  
  // Пробуем получить SSH сервер
  const { data: sshServer, isLoading: isLoadingSSH } = useQuery({
    queryKey: ['server', id],
    queryFn: () => serversApi.get(Number(id!)),
    enabled: !!id && serverType !== 'allocated',
    retry: false,
  })

  // Пробуем получить выданный сервер
  const { data: allocatedServers = [], isLoading: isLoadingAllocated } = useQuery({
    queryKey: ['allocatedServers'],
    queryFn: paymentApi.getAllocatedServers,
    enabled: !!id && serverType !== 'ssh',
  })

  // Восстанавливаем вкладку из URL при изменении searchParams
  useEffect(() => {
    const tabFromUrl = getTabFromUrl()
    setActiveTab(prevTab => {
      // Обновляем только если вкладка из URL отличается от текущей
      return tabFromUrl !== prevTab ? tabFromUrl : prevTab
    })
  }, [searchParams])

  // Устанавливаем параметр tab в URL, если его нет
  useEffect(() => {
    if (!searchParams.get('tab')) {
      setSearchParams({ tab: 'console' }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Определяем тип сервера
  useEffect(() => {
    if (id) {
      // Сначала проверяем выданные серверы
      const allocated = allocatedServers.find(s => s.id === Number(id))
      if (allocated) {
        setServerType('allocated')
      } else if (sshServer) {
        setServerType('ssh')
      } else if (!isLoadingAllocated && !isLoadingSSH) {
        // Если оба запроса завершены и сервер не найден
        setServerType(null)
      }
    }
  }, [id, allocatedServers, sshServer, isLoadingAllocated, isLoadingSSH])

  // Функция для изменения вкладки с обновлением URL
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

  const allocatedServer = allocatedServers.find(s => s.id === Number(id))
  const server = serverType === 'allocated' ? allocatedServer : sshServer
  const isLoading = isLoadingSSH || isLoadingAllocated

  const testConnectionMutation = useMutation({
    mutationFn: () => {
      if (serverType === 'allocated') {
        // Для выданных серверов всегда успешно
        return Promise.resolve({ success: true, message: 'Выданный сервер активен' })
      }
      return serversApi.testConnection(Number(id!))
    },
  })

  if (isLoading) {
    return <div className="loading">Загрузка...</div>
  }

  if (!server) {
    return <div className="error">Сервер не найден</div>
  }

  return (
    <div className="server-detail">
      <ProfileMenu />
      <div className="server-detail-header">
        <button onClick={() => navigate('/servers')} className="back-btn">
          ← Назад
        </button>
        <div className="server-info-header">
          <h2>{serverType === 'allocated' && allocatedServer ? allocatedServer.name : (server as any).name}</h2>
          <span className="server-host">
            {serverType === 'allocated' && allocatedServer 
              ? `${allocatedServer.host}:${allocatedServer.port}`
              : `${(server as any).host}:${(server as any).port}`}
          </span>
          {serverType === 'allocated' && allocatedServer && (
            <div className="server-resources-info">
              <span>CPU: {allocatedServer.cpu_cores} ядер</span>
              <span>RAM: {allocatedServer.memory_gb} GB</span>
              <span>Диск: {allocatedServer.disk_gb} GB</span>
            </div>
          )}
        </div>
        <button
          onClick={() => testConnectionMutation.mutate()}
          className="test-btn"
          disabled={testConnectionMutation.isPending}
        >
          {testConnectionMutation.isPending
            ? 'Проверка...'
            : 'Проверить подключение'}
        </button>
      </div>

      {testConnectionMutation.data && (
        <div
          className={`connection-status ${
            testConnectionMutation.data.success ? 'success' : 'error'
          }`}
        >
          {testConnectionMutation.data.message}
        </div>
      )}

      <div className="tabs">
        <button
          className={activeTab === 'console' ? 'tab active' : 'tab'}
          onClick={() => handleTabChange('console')}
        >
          Консоль
        </button>
        <button
          className={activeTab === 'files' ? 'tab active' : 'tab'}
          onClick={() => handleTabChange('files')}
        >
          Файлы
        </button>
        <button
          className={activeTab === 'monitoring' ? 'tab active' : 'tab'}
          onClick={() => handleTabChange('monitoring')}
        >
          Мониторинг
        </button>
        <button
          className={activeTab === 'packages' ? 'tab active' : 'tab'}
          onClick={() => handleTabChange('packages')}
        >
          Библиотеки
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'console' && (
          <Console 
            serverId={Number(id!)} 
            serverType={serverType || 'ssh'}
          />
        )}
        {activeTab === 'files' && (
          <FileManager 
            serverId={Number(id!)} 
            serverType={serverType || 'ssh'}
          />
        )}
        {activeTab === 'monitoring' && (
          <Monitoring 
            serverId={Number(id!)} 
            serverType={serverType || 'ssh'}
          />
        )}
        {activeTab === 'packages' && (
          <PackagesManager 
            serverId={Number(id!)} 
            serverType={serverType || 'ssh'}
          />
        )}
      </div>

      <AIAssistant 
        serverId={Number(id!)} 
        serverType={serverType || 'ssh'}
      />
    </div>
  )
}

