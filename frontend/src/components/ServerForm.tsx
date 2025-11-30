import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { serversApi, Server, ServerCreate } from '../api/servers'
import AlertDialog from './AlertDialog'
import './ServerForm.css'

interface ServerFormProps {
  server?: Server | null
  onClose: () => void
  onSuccess: () => void
}

export default function ServerForm({ server, onClose, onSuccess }: ServerFormProps) {
  const [formData, setFormData] = useState<ServerCreate>({
    name: '',
    host: '',
    port: 22,
    username: '',
    auth_type: 'password',
    password: '',
    private_key: '',
    passphrase: '',
  })

  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        host: server.host,
        port: server.port,
        username: server.username,
        auth_type: server.auth_type,
        password: '',
        private_key: '',
        passphrase: '',
      })
    }
  }, [server])

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

  const mutation = useMutation({
    mutationFn: (data: ServerCreate) =>
      server
        ? serversApi.update(server.id, data)
        : serversApi.create(data),
    onSuccess: (data) => {
      console.log('Server created/updated:', data)
      setAlertDialog({
        isOpen: true,
        title: 'Успех',
        message: server ? 'Сервер успешно обновлен' : 'Сервер успешно создан',
        type: 'success'
      })
      // Вызываем onSuccess после небольшой задержки, чтобы показать сообщение
      setTimeout(() => {
        onSuccess()
      }, 1500)
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.detail ||
                          error.message || 
                          'Ошибка при сохранении сервера'
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: errorMessage,
        type: 'error'
      })
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  return (
    <div className="modal-overlay" onClick={(e) => {
      // Не закрываем форму, если идет отправка или открыт диалог
      if (!mutation.isPending && !alertDialog.isOpen) {
        onClose()
      }
    }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{server ? 'Редактировать сервер' : 'Добавить сервер'}</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <form onSubmit={handleSubmit} className="server-form">
          <div className="form-group">
            <label>Название сервера *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Например: Мой сервер"
              required
            />
            <p className="form-hint">Укажите понятное имя для вашего сервера</p>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Хост *</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Порт *</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                required
                min="1"
                max="65535"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Имя пользователя *</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Тип аутентификации *</label>
            <select
              value={formData.auth_type}
              onChange={(e) => setFormData({ ...formData, auth_type: e.target.value as 'password' | 'private_key' })}
            >
              <option value="password">Пароль</option>
              <option value="private_key">Приватный ключ</option>
            </select>
          </div>

          {formData.auth_type === 'password' ? (
            <div className="form-group">
              <label>Пароль *</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!server}
              />
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Приватный ключ *</label>
                <textarea
                  value={formData.private_key}
                  onChange={(e) => setFormData({ ...formData, private_key: e.target.value })}
                  required={!server}
                  rows={6}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
                />
              </div>
              <div className="form-group">
                <label>Пароль для ключа (если требуется)</label>
                <input
                  type="password"
                  value={formData.passphrase}
                  onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
                />
              </div>
            </>
          )}

          {mutation.isError && (
            <div className="error-message" style={{ color: '#ef4444', padding: '0.5rem', background: '#fee2e2', borderRadius: '4px', marginBottom: '1rem' }}>
              Произошла ошибка. Проверьте сообщение выше.
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Отмена
            </button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Сохранение...' : server ? 'Сохранить' : 'Создать'}
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
          // Если успех, форма уже закрыта через onSuccess
          // Если ошибка, форма остается открытой
        }}
      />
    </div>
  )
}

