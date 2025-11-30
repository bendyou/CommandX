import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { serversApi } from '../api/servers'
import { paymentApi } from '../api/payment'
import { sanitizeError } from '../utils/sanitizeError'
import './Console.css'

interface ConsoleProps {
  serverId: number
  serverType?: 'ssh' | 'allocated'
}

interface ConsoleHistoryItem {
  command: string
  output: string
  error?: string
  directory?: string // Путь, в котором была выполнена команда
}

const CONSOLE_STORAGE_PREFIX = 'console_history_'
const CONSOLE_ACTIVITY_PREFIX = 'console_activity_'
const INACTIVITY_TIMEOUT = 60 * 60 * 1000 // 1 час в миллисекундах

export default function Console({ serverId, serverType = 'ssh' }: ConsoleProps) {
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<Array<ConsoleHistoryItem>>([])
  const [commandHistory, setCommandHistory] = useState<string[]>([]) // История только команд для навигации
  const [historyIndex, setHistoryIndex] = useState<number>(-1) // Индекс текущей позиции в истории (-1 = новая команда)
  const [tempCommand, setTempCommand] = useState<string>('') // Временное сохранение команды при навигации
  const [currentDirectory, setCurrentDirectory] = useState<string>('~') // Текущая рабочая директория
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Функция для сохранения истории в localStorage
  const saveHistory = (newHistory: Array<ConsoleHistoryItem>) => {
    const storageKey = `${CONSOLE_STORAGE_PREFIX}${serverId}_${serverType}`
    try {
      localStorage.setItem(storageKey, JSON.stringify(newHistory))
      // Обновляем время последней активности
      const activityKey = `${CONSOLE_ACTIVITY_PREFIX}${serverId}_${serverType}`
      localStorage.setItem(activityKey, Date.now().toString())
    } catch (error) {
      console.error('Ошибка сохранения истории консоли:', error)
    }
  }

  // Функция для сохранения истории команд
  const saveCommandHistory = (newCommandHistory: string[]) => {
    const storageKey = `command_history_${serverId}_${serverType}`
    try {
      // Сохраняем только уникальные команды, ограничиваем до 100 последних
      const uniqueCommands = Array.from(new Set(newCommandHistory)).slice(-100)
      localStorage.setItem(storageKey, JSON.stringify(uniqueCommands))
    } catch (error) {
      console.error('Ошибка сохранения истории команд:', error)
    }
  }

  // Функция для загрузки истории команд
  const loadCommandHistory = (): string[] => {
    const storageKey = `command_history_${serverId}_${serverType}`
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (error) {
      console.error('Ошибка загрузки истории команд:', error)
    }
    return []
  }

  // Функция для загрузки истории из localStorage
  const loadHistory = (): Array<ConsoleHistoryItem> => {
    const storageKey = `${CONSOLE_STORAGE_PREFIX}${serverId}_${serverType}`
    const activityKey = `${CONSOLE_ACTIVITY_PREFIX}${serverId}_${serverType}`
    
    try {
      const savedHistory = localStorage.getItem(storageKey)
      const lastActivity = localStorage.getItem(activityKey)
      
      // Проверяем, не прошло ли больше часа с последней активности
      if (lastActivity) {
        const lastActivityTime = parseInt(lastActivity, 10)
        const now = Date.now()
        const timeSinceActivity = now - lastActivityTime
        
        if (timeSinceActivity > INACTIVITY_TIMEOUT) {
          // Прошло больше часа - очищаем историю
          localStorage.removeItem(storageKey)
          localStorage.removeItem(activityKey)
          return []
        }
      }
      
      if (savedHistory) {
        return JSON.parse(savedHistory)
      }
    } catch (error) {
      console.error('Ошибка загрузки истории консоли:', error)
    }
    
    return []
  }

  // Загружаем историю при монтировании компонента
  useEffect(() => {
    const loadedHistory = loadHistory()
    if (loadedHistory.length > 0) {
      setHistory(loadedHistory)
    }
    
    // Загружаем историю команд
    const loadedCommandHistory = loadCommandHistory()
    if (loadedCommandHistory.length > 0) {
      setCommandHistory(loadedCommandHistory)
    }
    
    // Проверяем активность каждые 5 минут
    activityCheckIntervalRef.current = setInterval(() => {
      const activityKey = `${CONSOLE_ACTIVITY_PREFIX}${serverId}_${serverType}`
      const lastActivity = localStorage.getItem(activityKey)
      
      if (lastActivity) {
        const lastActivityTime = parseInt(lastActivity, 10)
        const now = Date.now()
        const timeSinceActivity = now - lastActivityTime
        
        if (timeSinceActivity > INACTIVITY_TIMEOUT) {
          // Прошло больше часа - очищаем историю
          const storageKey = `${CONSOLE_STORAGE_PREFIX}${serverId}_${serverType}`
          const commandHistoryKey = `command_history_${serverId}_${serverType}`
          localStorage.removeItem(storageKey)
          localStorage.removeItem(activityKey)
          localStorage.removeItem(commandHistoryKey)
          setHistory([])
          setCommandHistory([])
        }
      }
    }, 5 * 60 * 1000) // Проверяем каждые 5 минут
    
    return () => {
      if (activityCheckIntervalRef.current) {
        clearInterval(activityCheckIntervalRef.current)
      }
    }
  }, [serverId, serverType])

  // Отслеживаем активность пользователя (ввод команды, клики и т.д.)
  useEffect(() => {
    const updateActivity = () => {
      const activityKey = `${CONSOLE_ACTIVITY_PREFIX}${serverId}_${serverType}`
      localStorage.setItem(activityKey, Date.now().toString())
    }
    
    // Обновляем активность при различных действиях
    const handleActivity = () => {
      updateActivity()
    }
    
    // Слушаем события активности
    window.addEventListener('focus', handleActivity)
    window.addEventListener('mousedown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    
    return () => {
      window.removeEventListener('focus', handleActivity)
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
    }
  }, [serverId, serverType])

  // Проверяем и создаем venv при первом подключении
  useEffect(() => {
    const initVenv = async () => {
      const venvCheckKey = `venv_initialized_${serverId}_${serverType}`
      const isInitialized = localStorage.getItem(venvCheckKey)
      
      if (!isInitialized) {
        // Проверяем существование venv
        const checkCmd = serverType === 'allocated' 
          ? paymentApi.allocatedServerExec(serverId, '[ -d "venv" ] && echo "exists" || echo "not_exists"')
          : serversApi.exec(serverId, '[ -d "venv" ] && echo "exists" || echo "not_exists"')
        
        try {
          const checkResult = await checkCmd
          if (checkResult.stdout.includes('not_exists')) {
            // Создаем venv
            const createCmd = serverType === 'allocated'
              ? paymentApi.allocatedServerExec(serverId, 'python3 -m venv venv')
              : serversApi.exec(serverId, 'python3 -m venv venv')
            
            await createCmd
            localStorage.setItem(venvCheckKey, 'true')
          } else {
            localStorage.setItem(venvCheckKey, 'true')
          }
        } catch (error) {
          console.error('Ошибка инициализации venv:', error)
        }
      }
    }
    
    initVenv()
  }, [serverId, serverType])

  // Обработчик навигации по истории команд
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length === 0) return
      
      let newIndex = historyIndex
      
      // Если мы в режиме новой команды, сохраняем текущий ввод
      if (historyIndex === -1) {
        setTempCommand(command)
        newIndex = commandHistory.length - 1
      } else if (newIndex > 0) {
        newIndex = newIndex - 1
      } else {
        // Уже на первой команде, остаемся на ней
        return
      }
      
      setHistoryIndex(newIndex)
      setCommand(commandHistory[newIndex])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      
      if (historyIndex === -1) return // Уже в режиме новой команды
      
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      } else {
        // Достигли конца истории, возвращаемся к новой команде
        setHistoryIndex(-1)
        setCommand(tempCommand)
        setTempCommand('')
      }
    }
  }

  // Обработчик изменения команды (сбрасываем индекс при ручном вводе)
  const handleCommandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCommand = e.target.value
    setCommand(newCommand)
    // Если пользователь начал вводить команду вручную, сбрасываем индекс истории
    if (historyIndex !== -1) {
      setHistoryIndex(-1)
      setTempCommand('')
    }
  }

  const execMutation = useMutation({
    mutationFn: async (cmd: string) => {
      // Сохраняем текущую директорию ДО выполнения команды для истории
      const commandDirectory = currentDirectory
      
      // Блокируем команды deactivate и exit из venv
      const blockedCommands = ['deactivate', 'exit venv', 'source deactivate']
      const lowerCmd = cmd.toLowerCase().trim()
      
      if (blockedCommands.some(blocked => lowerCmd.includes(blocked))) {
        throw new Error('Выход из виртуального окружения запрещен для безопасности')
      }
      
      // Обрабатываем команду cd отдельно
      const cdMatch = cmd.trim().match(/^cd\s+(.+)$/)
      if (cdMatch) {
        let targetDir = cdMatch[1].trim()
        // Убираем кавычки если есть
        if ((targetDir.startsWith('"') && targetDir.endsWith('"')) || 
            (targetDir.startsWith("'") && targetDir.endsWith("'"))) {
          targetDir = targetDir.slice(1, -1)
        }
        
        // Для allocated серверов блокируем попытки выйти за пределы
        if (serverType === 'allocated') {
          // Блокируем абсолютные пути и попытки выйти выше
          if (targetDir.startsWith('/') || targetDir.includes('..')) {
            throw new Error('Доступ запрещен: выход за пределы директории сервера')
          }
          // Если путь не начинается с ~, добавляем ~/
          if (targetDir !== '~' && !targetDir.startsWith('~/')) {
            targetDir = `~/${targetDir}`
          }
        }
        
        // Обрабатываем специальные случаи
        if (targetDir === '-' || targetDir === '~') {
          targetDir = '~'
        }
        
        // Если путь содержит wildcards (*, ?, []), нужно расширить их
        const hasWildcard = /[*?\[\]]/.test(targetDir)
        
        let cdCommand: string
        if (hasWildcard) {
          // Для wildcards используем правильное расширение glob
          if (serverType === 'allocated') {
            const currentDirPath = currentDirectory === '~' ? '.' : currentDirectory.replace(/^~\//, '')
            // Используем ls -d для поиска директорий, соответствующих паттерну
            cdCommand = `cd "${currentDirPath}" && matched_dir=$(ls -d ${targetDir} 2>/dev/null | head -1) && if [ -n "$matched_dir" ]; then cd "$matched_dir" && pwd; else echo "cd: ${targetDir}: No such file or directory" >&2 && exit 1; fi`
          } else {
            // Для SSH серверов используем правильное расширение glob
            // Выполняем команду напрямую в текущей директории для правильного расширения wildcard
            const safeCurrentDir = currentDirectory.replace(/'/g, "'\\''")
            // Не экранируем wildcard - он должен расшириться в shell
            // Используем простую команду без лишних оберток
            cdCommand = `cd '${safeCurrentDir}' && matched_dir=$(ls -d ${targetDir} 2>/dev/null | head -1) && if [ -n "$matched_dir" ]; then cd "$matched_dir" && pwd; else echo "cd: ${targetDir}: No such file or directory" >&2 && exit 1; fi`
          }
        } else {
          // Обычный путь без wildcards
          if (serverType === 'allocated') {
            const currentDirPath = currentDirectory === '~' ? '.' : currentDirectory.replace(/^~\//, '')
            const targetDirPath = targetDir === '~' ? '.' : targetDir.replace(/^~\//, '')
            cdCommand = `cd "${currentDirPath}" && cd "${targetDirPath}" && pwd`
          } else {
            const safeCurrentDir = currentDirectory.replace(/'/g, "'\\''")
            const safeTargetDir = targetDir.replace(/'/g, "'\\''")
            cdCommand = `bash -c "cd '${safeCurrentDir}' && cd '${safeTargetDir}' && pwd"`
          }
        }
        
        const result = serverType === 'allocated'
          ? await paymentApi.allocatedServerExec(serverId, cdCommand)
          : await serversApi.exec(serverId, cdCommand)
        
        // Проверяем результат выполнения
        if (!result.success || (result.stderr && result.stderr.includes('No such file or directory'))) {
          const errorMsg = result.stderr || result.stdout || `cd: ${targetDir}: No such file or directory`
          // Убираем дублирование ошибок
          const cleanError = errorMsg.replace(/cd: cd: /g, 'cd: ').replace(/: No such file or directory: No such file or directory/g, ': No such file or directory')
          throw new Error(cleanError)
        }
        
        if (result.stdout) {
          const output = result.stdout.trim()
          // Берем последнюю непустую строку (это должен быть путь от pwd)
          const lines = output.split('\n').filter(line => line.trim())
          let newDir = lines[lines.length - 1] || output || currentDirectory
          
          // Убираем возможные ошибки из вывода
          if (newDir.includes('No such file or directory')) {
            const errorMsg = newDir
            throw new Error(errorMsg.replace(/cd: cd: /g, 'cd: '))
          }
          
          // Для allocated серверов нормализуем путь - убираем попытки выйти за пределы
          if (serverType === 'allocated') {
            // Если путь содержит .. или начинается с /, нормализуем
            if (newDir.includes('..') || newDir.startsWith('/')) {
              // Преобразуем в относительный путь от ~
              if (newDir.startsWith('/')) {
                newDir = '~'
              } else {
                // Убираем .. из пути
                const parts = newDir.split('/')
                const safeParts: string[] = []
                for (const part of parts) {
                  if (part === '..') {
                    if (safeParts.length > 0) {
                      safeParts.pop()
                    }
                  } else if (part !== '.' && part !== '') {
                    safeParts.push(part)
                  }
                }
                newDir = safeParts.length === 0 ? '~' : `~/${safeParts.join('/')}`
              }
            } else if (!newDir.startsWith('~')) {
              // Если путь не начинается с ~, добавляем ~/
              newDir = `~/${newDir}`
            }
          }
          
          setCurrentDirectory(newDir)
          return {
            success: true,
            stdout: '',
            stderr: '',
            directory: commandDirectory, // Сохраняем путь, в котором была выполнена команда
          }
        } else {
          throw new Error(`cd: ${targetDir}: No such file or directory`)
        }
      }
      
      // Для остальных команд: оптимизируем выполнение
      // Не активируем venv автоматически - пользователь может сделать это сам если нужно
      let fullCommand: string
      
      // Если команда уже содержит cd или абсолютный путь, не добавляем cd
      const needsCd = !cmd.trim().startsWith('cd ') && 
                      !cmd.trim().startsWith('/') && 
                      currentDirectory !== '~'
      
      if (serverType === 'allocated') {
        // Для allocated серверов используем простую команду
        // Упрощаем: если currentDirectory = ~, используем .
        if (needsCd) {
          const workDir = currentDirectory === '~' ? '.' : currentDirectory.replace(/^~\//, '')
          fullCommand = `cd "${workDir}" && ${cmd}`
        } else {
          fullCommand = cmd
        }
      } else {
        // Для SSH серверов оптимизируем: используем bash -c только если нужно
        if (needsCd) {
          // Используем более эффективный способ: просто cd и выполнение команды
          const escapedCmd = cmd.replace(/'/g, "'\\''")
          const safeCurrentDir = currentDirectory.replace(/'/g, "'\\''")
          fullCommand = `bash -c "cd '${safeCurrentDir}' && ${escapedCmd}"`
        } else {
          // Если не нужно менять директорию, выполняем команду напрямую
          fullCommand = cmd
        }
      }
      
      const result = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, fullCommand)
        : await serversApi.exec(serverId, fullCommand)
      
      // Добавляем путь в результат для сохранения в истории
      return {
        ...result,
        directory: commandDirectory,
      }
    },
    onSuccess: (data, command) => {
      // Для команды cd не показываем вывод, только обновляем директорию
      const isCdCommand = command.trim().startsWith('cd ')
      // Используем путь из результата (был сохранен в mutationFn)
      const commandDirectory = (data as any).directory || currentDirectory
      const newHistoryItem: ConsoleHistoryItem = {
        command,
        output: isCdCommand ? undefined : (data.stdout ? sanitizeError(data.stdout) : undefined),
        error: data.stderr ? sanitizeError(data.stderr) : (data.success ? undefined : 'Команда завершилась с ошибкой'),
        directory: commandDirectory,
      }
      
      const newHistory = [...history, newHistoryItem]
      setHistory(newHistory)
      saveHistory(newHistory) // Сохраняем в localStorage
      
      // Добавляем команду в историю команд (если её еще нет или она отличается от последней)
      const trimmedCommand = command.trim()
      if (trimmedCommand && (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== trimmedCommand)) {
        const newCommandHistory = [...commandHistory, trimmedCommand]
        setCommandHistory(newCommandHistory)
        saveCommandHistory(newCommandHistory)
      }
      
      // Сбрасываем индекс истории и команду
      setHistoryIndex(-1)
      setTempCommand('')
      setCommand('')
      // Автоматически возвращаем фокус на поле ввода
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    },
    onError: (error: any) => {
      const errorMessage = sanitizeError(error?.message || 'Ошибка выполнения команды')
      // Сохраняем путь, в котором была выполнена команда
      const commandDirectory = currentDirectory
      const newHistoryItem: ConsoleHistoryItem = {
        command,
        output: '',
        error: errorMessage,
        directory: commandDirectory,
      }
      
      const newHistory = [...history, newHistoryItem]
      setHistory(newHistory)
      saveHistory(newHistory)
      
      // Добавляем команду в историю команд даже при ошибке
      const trimmedCommand = command.trim()
      if (trimmedCommand && (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== trimmedCommand)) {
        const newCommandHistory = [...commandHistory, trimmedCommand]
        setCommandHistory(newCommandHistory)
        saveCommandHistory(newCommandHistory)
      }
      
      // Сбрасываем индекс истории и команду
      setHistoryIndex(-1)
      setTempCommand('')
      setCommand('')
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    },
  })

  // Инициализируем текущую директорию при монтировании
  // Не выполняем pwd сразу - это замедляет загрузку, просто устанавливаем ~
  useEffect(() => {
    // Устанавливаем ~ по умолчанию, pwd выполнится при первой команде если нужно
    setCurrentDirectory('~')
    
    // Опционально: получаем домашнюю директорию в фоне (не блокируем UI)
    let cancelled = false
    const initDirectory = async () => {
      try {
        const pwdCommand = serverType === 'allocated'
          ? 'pwd'
          : 'pwd'  // Упрощаем для SSH тоже
        
        const result = serverType === 'allocated'
          ? await paymentApi.allocatedServerExec(serverId, pwdCommand)
          : await serversApi.exec(serverId, pwdCommand)
        
        if (!cancelled && result.success && result.stdout) {
          let dir = result.stdout.trim().split('\n').pop() || '~'
          
          // Для allocated серверов нормализуем путь - показываем только относительный путь
          if (serverType === 'allocated') {
            // Если путь абсолютный или содержит .., нормализуем
            if (dir.startsWith('/') || dir.includes('..')) {
              dir = '~'
            } else if (!dir.startsWith('~')) {
              dir = `~/${dir}`
            }
          }
          
          setCurrentDirectory(dir)
        }
      } catch (error: any) {
        // Игнорируем ошибки при инициализации - не критично
        if (error?.code !== 'ECONNABORTED' && !cancelled) {
          // Только логируем если это не отмена запроса
        }
      }
    }
    
    // Выполняем в фоне с небольшой задержкой
    const timeoutId = setTimeout(() => {
      initDirectory()
    }, 100)
    
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, serverType])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [history])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (command.trim()) {
      execMutation.mutate(command)
    }
  }

  return (
    <div className="console">
      <div className="console-output" ref={outputRef}>
        {history.length === 0 ? (
          <div className="console-welcome">
            <p>Добро пожаловать в консоль CommandX!</p>
            <p>Введите команду ниже для выполнения на удаленном сервере.</p>
          </div>
        ) : (
          history.map((item, index) => (
            <div key={index} className="console-entry">
              <div className="console-command">
                <span className="prompt" style={{ color: '#569cd6' }}>{item.directory || currentDirectory}$</span> {item.command}
              </div>
              {item.output && (
                <div className="console-stdout">{item.output}</div>
              )}
              {item.error && (
                <div className="console-stderr">{item.error}</div>
              )}
            </div>
          ))
        )}
        {execMutation.isPending && (
          <div className="console-loading">Выполнение команды...</div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="console-input-form">
        <span className="prompt" style={{ color: '#569cd6', marginRight: '0.5rem', whiteSpace: 'nowrap' }}>{currentDirectory}$</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={handleCommandChange}
          onKeyDown={handleKeyDown}
          placeholder="Введите команду..."
          className="console-input"
          disabled={execMutation.isPending}
          autoFocus
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={execMutation.isPending || !command.trim()} className="console-submit">
          Выполнить
        </button>
      </form>
    </div>
  )
}

