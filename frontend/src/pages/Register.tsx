import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi, RegisterError } from '../api/auth'
import { useAuth } from '../hooks/useAuth'
import './Register.css'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterError, string>>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  useEffect(() => {
    document.body.classList.add('page-transition-enter')
    return () => {
      document.body.classList.remove('page-transition-enter')
    }
  }, [])

  // Валидация на фронтенде
  const validateField = (name: string, value: string): string => {
    switch (name) {
      case 'username':
        if (!value) return 'Имя пользователя обязательно'
        if (value.length < 3) return 'Минимум 3 символа'
        if (value.length > 150) return 'Максимум 150 символов'
        if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Только буквы, цифры и подчеркивание'
        return ''
      
      case 'email':
        if (!value) return 'Email обязателен'
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(value)) return 'Некорректный email адрес'
        return ''
      
      case 'password':
        if (!value) return 'Пароль обязателен'
        if (value.length < 8) return 'Минимум 8 символов'
        if (!/(?=.*[a-z])/.test(value)) return 'Должна быть хотя бы одна строчная буква'
        if (!/(?=.*[A-Z])/.test(value)) return 'Должна быть хотя бы одна заглавная буква'
        if (!/(?=.*\d)/.test(value)) return 'Должна быть хотя бы одна цифра'
        if (!/(?=.*[@$!%*?&])/.test(value)) return 'Должен быть хотя бы один спецсимвол (@$!%*?&)'
        return ''
      
      case 'password_confirm':
        if (!value) return 'Подтверждение пароля обязательно'
        if (value !== password) return 'Пароли не совпадают'
        return ''
      
      default:
        return ''
    }
  }

  const handleBlur = (field: string, value: string) => {
    const error = validateField(field, value)
    setErrors(prev => ({ ...prev, [field]: error }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)

    // Валидация всех полей
    const newErrors: Partial<Record<keyof RegisterError, string>> = {}
    newErrors.username = validateField('username', username)
    newErrors.email = validateField('email', email)
    newErrors.password = validateField('password', password)
    newErrors.password_confirm = validateField('password_confirm', passwordConfirm)

    const hasErrors = Object.values(newErrors).some(error => error !== '')
    
    if (hasErrors) {
      setErrors(newErrors)
      setLoading(false)
      return
    }

    try {
      const response = await authApi.register({
        username,
        email,
        password,
        password_confirm: passwordConfirm
      })
      
      // Очищаем ошибки при успехе
      setErrors({})
      setSuccess(true)
      
      // Автоматически логиним пользователя
      if (response.access && response.refresh) {
        login(response.access, response.refresh, response.username)
        
        if (e.currentTarget) {
          const button = e.currentTarget.querySelector('.submit-btn') as HTMLElement
          if (button) {
            button.classList.add('button-success')
          }
        }
        
        // Проверяем, что токен сохранен, и перенаправляем
        setTimeout(() => {
          const savedToken = localStorage.getItem('access_token')
          if (savedToken) {
            window.location.href = '/profile'
          } else {
            // Если токен не сохранился, пробуем еще раз
            console.error('Токен не был сохранен, повторная попытка...')
            login(response.access, response.refresh, response.username)
            setTimeout(() => {
              window.location.href = '/profile'
            }, 100)
          }
        }, 800)
      } else {
        // Если токены не пришли, перекидываем на логин
        setTimeout(() => {
          navigate('/login')
        }, 1500)
      }
    } catch (err: any) {
      // Очищаем success при ошибке
      setSuccess(false)
      setLoading(false)
      
      const errorData = err.response?.data as RegisterError
      if (errorData) {
        const formattedErrors: Partial<Record<keyof RegisterError, string>> = {}
        Object.keys(errorData).forEach(key => {
          const value = errorData[key as keyof RegisterError]
          if (Array.isArray(value)) {
            formattedErrors[key as keyof RegisterError] = value[0]
          } else if (typeof value === 'string') {
            formattedErrors[key as keyof RegisterError] = value
          }
        })
        setErrors(formattedErrors)
      } else {
        setErrors({ error: 'Ошибка регистрации. Попробуйте позже.' })
      }
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
    <div className="register-container">
      <div className="register-background">
        <div className="register-bg-orb orb-1"></div>
        <div className="register-bg-orb orb-2"></div>
        <div className="register-bg-orb orb-3"></div>
      </div>
      <div className="register-card">
        <div className="register-header">
          <div className="register-logo">✨</div>
          <h1>Регистрация</h1>
          <p>Создайте аккаунт и начните управлять серверами</p>
        </div>
        <form onSubmit={handleSubmit} className="register-form">
          {!success && errors.error && <div className="error-message fade-in-error">{errors.error}</div>}
          {success && (
            <div className="success-message fade-in-error">
              ✓ Регистрация успешна! Перенаправление на страницу профиля...
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="username">Имя пользователя</label>
            <div className="input-wrapper">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={(e) => handleBlur('username', e.target.value)}
                placeholder="Например: user123"
                required
                autoFocus
                className={`form-input ${errors.username ? 'input-error' : ''}`}
              />
            </div>
            {errors.username && <span className="field-error">{errors.username}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => handleBlur('email', e.target.value)}
                placeholder="Например: user@example.com"
                required
                className={`form-input ${errors.email ? 'input-error' : ''}`}
              />
            </div>
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <div className="input-wrapper">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={(e) => handleBlur('password', e.target.value)}
                placeholder="Например: MyP@ssw0rd123"
                required
                className={`form-input ${errors.password ? 'input-error' : ''}`}
              />
            </div>
            {errors.password && <span className="field-error">{errors.password}</span>}
            <div className="password-hint">
              Пароль должен содержать: минимум 8 символов, заглавные и строчные буквы, цифры, спецсимволы
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password_confirm">Подтверждение пароля</label>
            <div className="input-wrapper">
              <input
                id="password_confirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                onBlur={(e) => handleBlur('password_confirm', e.target.value)}
                placeholder="Повторите пароль"
                required
                className={`form-input ${errors.password_confirm ? 'input-error' : ''}`}
              />
            </div>
            {errors.password_confirm && <span className="field-error">{errors.password_confirm}</span>}
          </div>

          <button type="submit" disabled={loading || success} className="submit-btn button-animated">
            <span className="button-content">
              {loading ? (
                <>
                  <span className="button-loader"></span>
                  <span>Регистрация...</span>
                </>
              ) : success ? (
                <>
                  <span>✓ Успешно!</span>
                </>
              ) : (
                <>
                  <span>Зарегистрироваться</span>
                  <span className="button-arrow">→</span>
                </>
              )}
            </span>
          </button>
          
          <div className="register-footer">
            <p className="login-link-text">
              Уже есть аккаунт?{' '}
              <Link 
                to="/login" 
                className="login-link link-animated"
                onClick={(e) => {
                  e.preventDefault()
                  handleNavigate('/login')
                }}
              >
                Войти
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

