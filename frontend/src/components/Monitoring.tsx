import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { serversApi, MetricData } from '../api/servers'
import { paymentApi } from '../api/payment'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import './Monitoring.css'

interface MonitoringProps {
  serverId: number
  serverType?: 'ssh' | 'allocated'
}

export default function Monitoring({ serverId, serverType = 'ssh' }: MonitoringProps) {
  const [timeRange, setTimeRange] = useState<number>(1) // hours
  const [currentStats, setCurrentStats] = useState<any>(null)
  const queryClient = useQueryClient()

  // Получаем текущие детальные метрики - автоматически начинаем сбор данных
  const { data: detailedStats, isLoading: isLoadingStats, error: statsError } = useQuery({
    queryKey: ['detailedStats', serverId, serverType],
    queryFn: () => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerGetDetailedStats(serverId)
      }
      return serversApi.getDetailedStats(serverId)
    },
    refetchInterval: 5000, // Обновляем каждые 5 секунд (увеличено для снижения нагрузки)
    enabled: true, // Всегда включен
    retry: 1, // Уменьшено количество повторов для быстрого отображения ошибок
    staleTime: 2000, // Данные считаются свежими 2 секунды
    gcTime: 10000, // Кэш хранится 10 секунд
  })

  // При изменении detailedStats обновляем историю
  useEffect(() => {
    if (detailedStats) {
      // Инвалидируем кэш истории, чтобы получить свежие данные
      queryClient.invalidateQueries({ 
        queryKey: ['metricsHistory', serverId, serverType, timeRange] 
      })
    }
  }, [detailedStats, queryClient, serverId, serverType, timeRange])

  // Получаем историю метрик
  const { data: metricsHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['metricsHistory', serverId, serverType, timeRange],
    queryFn: () => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerGetMetricsHistory(serverId, timeRange)
      }
      return serversApi.getMetricsHistory(serverId, timeRange)
    },
    refetchInterval: 5000, // Обновляем каждые 5 секунд (увеличено для снижения нагрузки)
    staleTime: 2000, // Данные считаются свежими 2 секунды
    gcTime: 10000, // Кэш хранится 10 секунд
    retry: 1, // Уменьшено количество повторов
  })

  // Обновляем текущие метрики
  useEffect(() => {
    if (detailedStats) {
      setCurrentStats(detailedStats)
    }
  }, [detailedStats])

  // При монтировании компонента сразу запрашиваем метрики
  useEffect(() => {
    // Принудительно обновляем метрики при монтировании
    queryClient.invalidateQueries({ 
      queryKey: ['detailedStats', serverId, serverType] 
    })
  }, [serverId, serverType, queryClient])

  // Форматируем данные для графиков
  const formatChartData = (metrics: MetricData[]) => {
    return metrics.map((metric) => ({
      time: new Date(metric.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      cpu: metric.cpu_percent ?? 0,
      memory: metric.memory_percent ?? 0,
      disk: metric.disk_percent ?? 0,
      timestamp: metric.timestamp,
    }))
  }

  const chartData = formatChartData(metricsHistory)

  // Форматируем значение для отображения
  const formatValue = (value: number | null, suffix: string = '') => {
    if (value === null || value === undefined) return 'N/A'
    return `${value.toFixed(1)}${suffix}`
  }

  return (
    <div className="monitoring">
      <div className="monitoring-header">
        <h3>Мониторинг системы в реальном времени</h3>
        <div className="monitoring-controls">
          <label>
            Период:
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="time-range-select"
            >
              <option value={0.5}>30 минут</option>
              <option value={1}>1 час</option>
              <option value={3}>3 часа</option>
              <option value={6}>6 часов</option>
              <option value={12}>12 часов</option>
              <option value={24}>24 часа</option>
            </select>
          </label>
        </div>
      </div>

      {/* Текущие значения */}
      {isLoadingStats && !currentStats && !detailedStats && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          Загрузка метрик...
        </div>
      )}
      {statsError && !currentStats && !detailedStats && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
          Ошибка загрузки метрик. Попробуйте обновить страницу.
        </div>
      )}
      {(currentStats || detailedStats) && (
        <div className="current-stats">
          <div className="stat-card current">
            <h4>CPU</h4>
            <div className="stat-value-large">{formatValue((currentStats || detailedStats)?.cpu_percent)}%</div>
            <div className="stat-progress">
              <div
                className="stat-progress-bar"
                style={{
                  width: `${(currentStats || detailedStats)?.cpu_percent ?? 0}%`,
                  backgroundColor: ((currentStats || detailedStats)?.cpu_percent ?? 0) > 80 ? '#ef4444' : ((currentStats || detailedStats)?.cpu_percent ?? 0) > 50 ? '#f59e0b' : '#10b981',
                }}
              />
            </div>
          </div>
          <div className="stat-card current">
            <h4>Память</h4>
            <div className="stat-value-large">{formatValue((currentStats || detailedStats)?.memory_percent)}%</div>
            <div className="stat-info">
              {formatValue((currentStats || detailedStats)?.memory_used_mb)} MB / {formatValue((currentStats || detailedStats)?.memory_total_mb)} MB
            </div>
            <div className="stat-progress">
              <div
                className="stat-progress-bar"
                style={{
                  width: `${(currentStats || detailedStats)?.memory_percent ?? 0}%`,
                  backgroundColor: ((currentStats || detailedStats)?.memory_percent ?? 0) > 80 ? '#ef4444' : ((currentStats || detailedStats)?.memory_percent ?? 0) > 50 ? '#f59e0b' : '#10b981',
                }}
              />
            </div>
          </div>
          <div className="stat-card current">
            <h4>Диск</h4>
            <div className="stat-value-large">{formatValue((currentStats || detailedStats)?.disk_percent)}%</div>
            <div className="stat-info">
              {formatValue((currentStats || detailedStats)?.disk_used_gb)} GB / {formatValue((currentStats || detailedStats)?.disk_total_gb)} GB
            </div>
            <div className="stat-progress">
              <div
                className="stat-progress-bar"
                style={{
                  width: `${(currentStats || detailedStats)?.disk_percent ?? 0}%`,
                  backgroundColor: ((currentStats || detailedStats)?.disk_percent ?? 0) > 80 ? '#ef4444' : ((currentStats || detailedStats)?.disk_percent ?? 0) > 50 ? '#f59e0b' : '#10b981',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ошибка получения метрик */}
      {statsError && (
        <div className="error-message" style={{ 
          padding: '1rem', 
          background: '#fee2e2', 
          border: '1px solid #fca5a5', 
          borderRadius: '8px',
          color: '#991b1b',
          marginBottom: '1rem'
        }}>
          <strong>⚠️ Ошибка получения метрик:</strong> 
          <p style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            {statsError instanceof Error ? statsError.message : 'Неизвестная ошибка'}
          </p>
          <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Возможные причины:
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
              <li>Сервер недоступен или не отвечает</li>
              <li>Команды мониторинга недоступны на сервере (top, free, df)</li>
              <li>Проблемы с SSH подключением</li>
            </ul>
          </div>
        </div>
      )}

      {/* Сообщение о недоступности метрик */}
      {detailedStats && (detailedStats as any).message && (
        <div className="info-message" style={{ 
          padding: '1rem', 
          background: '#fef3c7', 
          border: '1px solid #fcd34d', 
          borderRadius: '8px',
          color: '#92400e',
          marginBottom: '1rem'
        }}>
          <strong>ℹ️ Информация:</strong> {(detailedStats as any).message}
        </div>
      )}

      {/* Графики */}
      {isLoadingHistory && chartData.length === 0 && !currentStats ? (
        <div className="loading">Загрузка данных...</div>
      ) : chartData.length === 0 && !isLoadingStats ? (
        <div className="empty-state">
          {currentStats ? (
            <>
              <p style={{ marginBottom: '1rem' }}>
                📊 Сбор данных начат. Графики появятся после накопления нескольких точек данных (обычно через 10-15 секунд).
              </p>
              <div className="current-stats-fallback" style={{ marginTop: '2rem' }}>
                <p style={{ marginBottom: '1rem', fontWeight: 600, fontSize: '1.1rem' }}>Текущие значения:</p>
                <div className="current-stats">
                  <div className="stat-card current">
                    <h4>CPU</h4>
                    <div className="stat-value-large">{formatValue(currentStats.cpu_percent)}%</div>
                    {currentStats.cpu_percent !== null && (
                      <div className="stat-progress">
                        <div
                          className="stat-progress-bar"
                          style={{
                            width: `${currentStats.cpu_percent}%`,
                            backgroundColor: currentStats.cpu_percent > 80 ? '#ef4444' : currentStats.cpu_percent > 50 ? '#f59e0b' : '#10b981',
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="stat-card current">
                    <h4>Память</h4>
                    <div className="stat-value-large">{formatValue(currentStats.memory_percent)}%</div>
                    {currentStats.memory_percent !== null && (
                      <>
                        <div className="stat-info">
                          {formatValue(currentStats.memory_used_mb)} MB / {formatValue(currentStats.memory_total_mb)} MB
                        </div>
                        <div className="stat-progress">
                          <div
                            className="stat-progress-bar"
                            style={{
                              width: `${currentStats.memory_percent}%`,
                              backgroundColor: currentStats.memory_percent > 80 ? '#ef4444' : currentStats.memory_percent > 50 ? '#f59e0b' : '#10b981',
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="stat-card current">
                    <h4>Диск</h4>
                    <div className="stat-value-large">{formatValue(currentStats.disk_percent)}%</div>
                    {currentStats.disk_percent !== null && (
                      <>
                        <div className="stat-info">
                          {formatValue(currentStats.disk_used_gb)} GB / {formatValue(currentStats.disk_total_gb)} GB
                        </div>
                        <div className="stat-progress">
                          <div
                            className="stat-progress-bar"
                            style={{
                              width: `${currentStats.disk_percent}%`,
                              backgroundColor: currentStats.disk_percent > 80 ? '#ef4444' : currentStats.disk_percent > 50 ? '#f59e0b' : '#10b981',
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p>Ожидание данных с сервера...</p>
          )}
        </div>
      ) : (
        <div className="charts-container">
          {/* График CPU */}
          <div className="chart-card">
            <h4>Загрузка CPU (%)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  stroke="#6b7280"
                  fontSize={11}
                  tick={{ fill: '#6b7280' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={12}
                  tick={{ fill: '#6b7280' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f3f4f6',
                  }}
                  animationDuration={0}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCpu)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* График памяти */}
          <div className="chart-card">
            <h4>Использование памяти (%)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  stroke="#6b7280"
                  fontSize={11}
                  tick={{ fill: '#6b7280' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={12}
                  tick={{ fill: '#6b7280' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f3f4f6',
                  }}
                  animationDuration={0}
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorMemory)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* График диска */}
          <div className="chart-card">
            <h4>Использование диска (%)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  stroke="#6b7280"
                  fontSize={11}
                  tick={{ fill: '#6b7280' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={12}
                  tick={{ fill: '#6b7280' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f3f4f6',
                  }}
                  animationDuration={0}
                />
                <Area
                  type="monotone"
                  dataKey="disk"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDisk)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Комбинированный график */}
          <div className="chart-card chart-card-full">
            <h4>Все метрики</h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  stroke="#6b7280"
                  fontSize={11}
                  tick={{ fill: '#6b7280' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={12}
                  tick={{ fill: '#6b7280' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f3f4f6',
                  }}
                  animationDuration={0}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="CPU %"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="memory"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Память %"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="disk"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name="Диск %"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
