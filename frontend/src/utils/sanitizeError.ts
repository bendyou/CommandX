/**
 * Утилита для санитизации ошибок - удаляет чувствительную информацию
 * (пути к файлам, директории, имена пользователей и т.д.)
 */

export function sanitizeError(error: string): string {
  if (!error) return error

  let sanitized = error

  // Удаляем абсолютные пути (начинающиеся с /)
  sanitized = sanitized.replace(/\/[^\s:]+/g, '[путь скрыт]')

  // Удаляем пути с тильдой (~/path)
  sanitized = sanitized.replace(/~\/[^\s:]+/g, '[путь скрыт]')

  // Удаляем пути с точками (./path, ../path)
  sanitized = sanitized.replace(/\.\.?\/[^\s:]+/g, '[путь скрыт]')

  // Удаляем пути Windows (C:\path, D:\path)
  sanitized = sanitized.replace(/[A-Z]:\\[^\s:]+/gi, '[путь скрыт]')

  // Удаляем пути с user_ или server_ (структура allocated_servers)
  sanitized = sanitized.replace(/user_\d+\/[^\s:]+/g, '[путь скрыт]')
  sanitized = sanitized.replace(/server_\d+\/[^\s:]+/g, '[путь скрыт]')

  // Удаляем пути с allocated_servers
  sanitized = sanitized.replace(/allocated_servers\/[^\s:]+/g, '[путь скрыт]')

  // Удаляем пути к venv
  sanitized = sanitized.replace(/venv\/[^\s:]+/g, '[путь скрыт]')

  // Удаляем пути к .cache, .pip_cache, .cargo, .rustup
  sanitized = sanitized.replace(/\.(cache|pip_cache|cargo|rustup)\/[^\s:]+/g, '[путь скрыт]')

  // Удаляем пути к Library
  sanitized = sanitized.replace(/Library\/[^\s:]+/g, '[путь скрыт]')

  // Удаляем полные пути к файлам (содержащие /)
  sanitized = sanitized.replace(/[^\s]+\/[^\s:]+/g, (match) => {
    // Если это похоже на путь к файлу, заменяем
    if (match.includes('/') && !match.startsWith('http')) {
      const parts = match.split('/')
      return parts[parts.length - 1] // Оставляем только имя файла
    }
    return match
  })

  // Удаляем имена пользователей из путей (если есть)
  sanitized = sanitized.replace(/\/Users\/[^\/\s]+/g, '/Users/[пользователь]')
  sanitized = sanitized.replace(/\/home\/[^\/\s]+/g, '/home/[пользователь]')

  // Удаляем IP-адреса
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP скрыт]')

  // Удаляем email-адреса
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email скрыт]')

  // Удаляем токены и ключи (длинные строки из букв и цифр)
  sanitized = sanitized.replace(/\b[a-zA-Z0-9]{32,}\b/g, '[токен скрыт]')

  return sanitized
}





