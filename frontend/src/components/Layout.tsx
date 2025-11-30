import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import './Layout.css'

export default function Layout() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleLogin = () => {
    navigate('/login')
  }

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <Link to="/" className="logo">
            <h1>CommandX</h1>
          </Link>
          <nav className="nav">
            <Link to="/" className="nav-link">Главная</Link>
            {token && (
              <>
                <Link to="/servers" className="nav-link">Серверы</Link>
                <Link to="/profile" className="nav-link">Профиль</Link>
              </>
            )}
            {token ? (
              <button onClick={handleLogout} className="logout-btn button-animated">
                <span className="button-content">Выйти</span>
              </button>
            ) : (
              <button onClick={handleLogin} className="login-btn button-animated">
                <span className="button-content">Войти</span>
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

