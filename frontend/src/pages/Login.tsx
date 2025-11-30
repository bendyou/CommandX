import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { authApi } from '../api/auth'
import './Login.css'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    // Анимация появления страницы
    document.body.classList.add('page-transition-enter')
    return () => {
      document.body.classList.remove('page-transition-enter')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authApi.login({ username, password })
      
      if (response && response.access && response.refresh) {
        // Очищаем ошибку перед успешным логином
        setError('')
        login(response.access, response.refresh, username)
        setLoading(false)
        
        // Анимация перед переходом
        if (e.currentTarget) {
          const button = e.currentTarget.querySelector('.submit-btn') as HTMLElement
          if (button) {
            button.classList.add('button-success')
          }
        }
        
        // Проверяем, что токен сохранен, и перенаправляем
        // Используем window.location для гарантированного обновления состояния
        setTimeout(() => {
          const savedToken = localStorage.getItem('access_token')
          if (savedToken) {
            window.location.href = '/profile'
          } else {
            // Если токен не сохранился, пробуем еще раз
            console.error('Токен не был сохранен, повторная попытка...')
            login(response.access, response.refresh, username)
            setTimeout(() => {
              window.location.href = '/profile'
            }, 100)
          }
        }, 300)
      } else {
        throw new Error('Неверный формат ответа от сервера')
      }
    } catch (err: any) {
      console.error('Login error:', err)
      const errorMessage = err.response?.data?.detail || 
                          err.response?.data?.error || 
                          err.message || 
                          'Ошибка входа. Проверьте данные.'
      setError(errorMessage)
      setLoading(false)
    }
  }

  const handleNavigate = (path: string) => {
    const link = document.querySelector('.back-link') as HTMLElement
    if (link) {
      link.classList.add('link-click-animation')
      setTimeout(() => {
        navigate(path)
      }, 300)
    } else {
      navigate(path)
    }
  }

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="login-bg-orb orb-1"></div>
        <div className="login-bg-orb orb-2"></div>
        <div className="login-bg-orb orb-3"></div>
      </div>
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🚀</div>
          <h1>CommandX</h1>
          <p>Интеллектуальная панель для управления серверами</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && error.trim() !== '' && (
            <div className="error-message fade-in-error">{error}</div>
          )}
          <div className="form-group">
            <label htmlFor="username">Имя пользователя</label>
            <div className="input-wrapper">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Например: user123"
                required
                autoFocus
                className="form-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <div className="input-wrapper">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите ваш пароль"
                required
                className="form-input"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="submit-btn button-animated">
            <span className="button-content">
              {loading ? (
                <>
                  <span className="button-loader"></span>
                  <span>Вход...</span>
                </>
              ) : (
                <>
                  <span>Войти</span>
                  <span className="button-arrow">→</span>
                </>
              )}
            </span>
          </button>
          <div className="login-footer">
            <p className="register-link-text">
              Нет аккаунта?{' '}
              <Link 
                to="/register" 
                className="register-link link-animated"
                onClick={(e) => {
                  e.preventDefault()
                  handleNavigate('/register')
                }}
              >
                Зарегистрироваться
              </Link>
            </p>
            <Link 
              to="/" 
              className="back-link link-animated"
              onClick={(e) => {
                e.preventDefault()
                handleNavigate('/')
              }}
            >
              ← Вернуться на главную
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

