import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Transactions from './pages/Transactions'
import Deposit from './pages/Deposit'
import Subscriptions from './pages/Subscriptions'
import CreateServer from './pages/CreateServer'
import Dashboard from './pages/Dashboard'
import ServerDetail from './pages/ServerDetail'

function App() {
  const { token, isLoading } = useAuth()

  // Показываем загрузку, пока проверяем токен из localStorage
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{ color: 'white', fontSize: '1.2rem' }}>Загрузка...</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={!token ? <Login /> : <Navigate to="/profile" replace />} />
      <Route path="/register" element={!token ? <Register /> : <Navigate to="/profile" replace />} />
      <Route path="/" element={<Home />} />
      <Route path="/profile" element={token ? <Profile /> : <Navigate to="/login" replace />} />
      <Route path="/admin" element={token ? <Admin /> : <Navigate to="/login" replace />} />
      <Route path="/transactions" element={token ? <Transactions /> : <Navigate to="/login" replace />} />
      <Route path="/deposit" element={token ? <Deposit /> : <Navigate to="/login" replace />} />
      <Route path="/subscriptions" element={token ? <Subscriptions /> : <Navigate to="/login" replace />} />
      <Route path="/servers" element={token ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/servers/create" element={token ? <CreateServer /> : <Navigate to="/login" replace />} />
      <Route path="/servers/:id" element={token ? <ServerDetail /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App

