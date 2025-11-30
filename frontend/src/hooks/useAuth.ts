import { useState, useEffect } from 'react'

// Запоминание сессии на 1 устройстве (используем localStorage)
const STORAGE_KEY_ACCESS = 'access_token'
const STORAGE_KEY_REFRESH = 'refresh_token'
const STORAGE_KEY_USERNAME = 'username'

export const useAuth = () => {
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Проверяем наличие токена при загрузке
    const storedToken = localStorage.getItem(STORAGE_KEY_ACCESS)
    const storedUsername = localStorage.getItem(STORAGE_KEY_USERNAME)
    
    if (storedToken) {
      setToken(storedToken)
    }
    if (storedUsername) {
      setUsername(storedUsername)
    }
    setIsLoading(false)
  }, [])

  const login = (accessToken: string, refreshToken: string, userUsername?: string) => {
    // Сохраняем токены в localStorage для запоминания сессии
    localStorage.setItem(STORAGE_KEY_ACCESS, accessToken)
    localStorage.setItem(STORAGE_KEY_REFRESH, refreshToken)
    
    if (userUsername) {
      localStorage.setItem(STORAGE_KEY_USERNAME, userUsername)
      setUsername(userUsername)
    }
    
    setToken(accessToken)
  }

  const logout = () => {
    // Очищаем все данные сессии
    localStorage.removeItem(STORAGE_KEY_ACCESS)
    localStorage.removeItem(STORAGE_KEY_REFRESH)
    localStorage.removeItem(STORAGE_KEY_USERNAME)
    setToken(null)
    setUsername(null)
  }

  return { token, username, login, logout, isLoading }
}

