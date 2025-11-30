import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { userApi } from '../api/user'
import './ProfileMenu.css'

export default function ProfileMenu() {
  const navigate = useNavigate()
  const { logout, username } = useAuth()
  const [showMenu, setShowMenu] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: userApi.getProfile,
    // Загружаем всегда, чтобы аватарка отображалась
  })

  useEffect(() => {
    // Закрытие меню при клике вне его
    const handleClickOutside = (event: MouseEvent) => {
      const menuContainer = document.querySelector('.profile-menu-container')
      if (menuContainer && !menuContainer.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const displayUsername = profile?.username || username || 'Пользователь'
  const displayEmail = profile?.email || ''

  return (
    <>
      {/* Overlay для закрытия меню */}
      <div 
        className={`profile-menu-overlay ${showMenu ? 'menu-open' : ''}`}
        onClick={() => setShowMenu(false)}
      ></div>

      {/* Анимированное меню профиля */}
      <div className="profile-menu-container">
        <button 
          className="profile-menu-toggle"
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Меню профиля"
        >
          <span className="menu-icon">☰</span>
        </button>
        
        <div className={`profile-menu ${showMenu ? 'menu-open' : ''}`}>
          <div className="menu-header">
            <div 
              className="menu-avatar"
              style={profile?.avatar ? {
                backgroundImage: `url(${profile.avatar})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              } : {}}
            >
              {!profile?.avatar && displayUsername.charAt(0).toUpperCase()}
            </div>
            <div className="menu-user-info">
              <h3>{displayUsername}</h3>
              {displayEmail && <p>{displayEmail}</p>}
            </div>
          </div>
          
          <div className="menu-items">
            {profile?.is_staff && (
              <button 
                className="menu-item menu-item-admin"
                onClick={() => {
                  setShowMenu(false)
                  navigate('/admin')
                }}
              >
                <span className="menu-item-icon">⚙️</span>
                <span>Админ панель</span>
              </button>
            )}
            <button 
              className="menu-item"
              onClick={() => {
                setShowMenu(false)
                navigate('/profile')
              }}
            >
              <span className="menu-item-icon">👤</span>
              <span>Профиль</span>
            </button>
            <button 
              className="menu-item"
              onClick={() => {
                setShowMenu(false)
                navigate('/servers')
              }}
            >
              <span className="menu-item-icon">🖥️</span>
              <span>Мои серверы</span>
            </button>
            <button 
              className="menu-item"
              onClick={() => {
                setShowMenu(false)
                navigate('/')
              }}
            >
              <span className="menu-item-icon">🏠</span>
              <span>Главная</span>
            </button>
            <div className="menu-divider"></div>
            <button 
              className="menu-item menu-item-danger"
              onClick={handleLogout}
            >
              <span className="menu-item-icon">🚪</span>
              <span>Выйти</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

