import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { aiApi, AIMessage } from '../api/ai'
import botAvatar from '../image/AiAss.png'
import './AIAssistant.css'

// Функция для парсинга сообщения и выделения команд
const parseMessage = (content: string) => {
  const parts: Array<{ type: 'text' | 'command'; content: string }> = []
  const originalContent = content
  
  // Сначала ищем блоки кода с тройными обратными кавычками
  const codeBlockPattern = /```(?:bash|sh|shell|zsh)?\n?([\s\S]*?)```/g
  const matches: Array<{ start: number; end: number; command: string }> = []
  
  let match
  while ((match = codeBlockPattern.exec(originalContent)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      command: match[1].trim()
    })
  }
  
  if (matches.length > 0) {
    // Обрабатываем блоки кода
    let lastIndex = 0
    for (const codeMatch of matches) {
      // Добавляем текст до блока
      if (codeMatch.start > lastIndex) {
        const textBefore = originalContent.substring(lastIndex, codeMatch.start).trim()
        if (textBefore) {
          parts.push({ type: 'text', content: textBefore })
        }
      }
      
      // Добавляем команду
      if (codeMatch.command) {
        parts.push({ type: 'command', content: codeMatch.command })
      }
      
      lastIndex = codeMatch.end
    }
    
    // Добавляем оставшийся текст
    if (lastIndex < originalContent.length) {
      const remainingText = originalContent.substring(lastIndex).trim()
      if (remainingText) {
        parts.push({ type: 'text', content: remainingText })
      }
    }
  } else {
    // Если нет блоков кода, ищем инлайн команды в одинарных кавычках
    const inlineCodePattern = /`([^`\n]+)`/g
    let lastIndex = 0
    
    while ((match = inlineCodePattern.exec(originalContent)) !== null) {
      // Добавляем текст до команды
      if (match.index > lastIndex) {
        const textBefore = originalContent.substring(lastIndex, match.index).trim()
        if (textBefore) {
          parts.push({ type: 'text', content: textBefore })
        }
      }
      
      // Добавляем команду (если достаточно длинная)
      const command = match[1].trim()
      if (command && command.length > 2 && !command.includes(' ')) {
        // Короткие команды без пробелов - вероятно команды
        parts.push({ type: 'command', content: command })
      } else if (command && (command.startsWith('$') || command.startsWith('sudo') || /^[a-z]+\s/.test(command))) {
        // Команды начинающиеся с $, sudo или обычные команды
        parts.push({ type: 'command', content: command })
      } else {
        // Остальное - текст
        parts.push({ type: 'text', content: match[0] })
      }
      
      lastIndex = match.index + match[0].length
    }
    
    // Добавляем оставшийся текст
    if (lastIndex < originalContent.length) {
      const remainingText = originalContent.substring(lastIndex).trim()
      if (remainingText) {
        parts.push({ type: 'text', content: remainingText })
      }
    }
  }
  
  // Если не найдено команд, возвращаем весь текст
  if (parts.length === 0) {
    parts.push({ type: 'text', content: originalContent })
  }
  
  return parts
}

// Компонент для отображения команды с кнопкой копирования
const CommandBlock = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
  
  return (
    <div className="ai-command-block">
      <code className="ai-command-text">{command}</code>
      <button 
        className="ai-command-copy-btn"
        onClick={handleCopy}
        title={copied ? 'Скопировано!' : 'Копировать команду'}
      >
        {copied ? '✓' : '📋'}
      </button>
    </div>
  )
}

interface AIAssistantProps {
  serverId?: number
  serverType?: 'ssh' | 'allocated'
}

const SYSTEM_PROMPT = `Ты полезный AI-ассистент для платформы CommandX — интеллектуальной панели для управления серверами.

Твоя задача — помогать пользователям с вопросами, связанными ТОЛЬКО с:
- Управлением серверами через CommandX
- Работой с командной строкой и терминалом
- Установкой и управлением библиотеками/пакетами
- Управлением файлами на серверах
- Мониторингом и диагностикой серверов
- Оптимизацией работы с серверами
- Объяснением ошибок и проблем при работе с серверами
- Командами Linux/Unix для управления серверами

ВАЖНО: Если пользователь задает вопрос, НЕ связанный с управлением серверами, CommandX или техническими аспектами работы с серверами, вежливо откажись отвечать и предложи задать вопрос по теме.

CommandX позволяет:
- Подключаться к серверам по SSH
- Управлять файлами через веб-интерфейс
- Устанавливать библиотеки и зависимости
- Запускать и останавливать процессы
- Отслеживать загрузку системы в реальном времени
- Автоматически выполнять рутинные задачи

Будь кратким, точным и полезным в своих ответах.`

const WELCOME_MESSAGE = 'Привет! Я AI-ассистент CommandX. Я помогу вам с вопросами по управлению серверами, командам, установке библиотек и работе с вашими серверами. Чем могу помочь?'

export default function AIAssistant({ serverId, serverType }: AIAssistantProps) {
  const [isMinimized, setIsMinimized] = useState(true)
  const [showTooltip, setShowTooltip] = useState(false)
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      role: 'system',
      content: SYSTEM_PROMPT
    },
    {
      role: 'assistant',
      content: WELCOME_MESSAGE
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Проверяем, нужно ли показывать подсказку
  useEffect(() => {
    const tooltipHidden = localStorage.getItem('ai-assistant-tooltip-hidden')
    if (!tooltipHidden) {
      setShowTooltip(true)
    }
  }, [])
  
  const handleHideTooltip = () => {
    localStorage.setItem('ai-assistant-tooltip-hidden', 'true')
    setShowTooltip(false)
  }
  
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ isResizing: boolean; corner: string | null }>({ isResizing: false, corner: null })
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number; startLeft: number; startTop: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0
  })
  const sizeRef = useRef({ width: 400, height: 600 })
  const positionRef = useRef({ 
    left: 'auto', 
    right: '2rem', 
    top: 'auto', 
    bottom: '2rem',
    isDragged: false // Флаг, что пользователь переместил окно
  })
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 })


  // Автопрокрутка к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Обработка перетаскивания окна
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    // Получаем текущую позицию с учетом right/bottom или left/top
    let currentLeft = rect.left
    let currentTop = rect.top
    
    // Если окно использует right/bottom, вычисляем left/top
    if (!positionRef.current.isDragged) {
      const computedStyle = window.getComputedStyle(containerRef.current)
      if (computedStyle.right !== 'auto') {
        currentLeft = window.innerWidth - rect.width - parseFloat(computedStyle.right || '0')
      }
      if (computedStyle.bottom !== 'auto') {
        currentTop = window.innerHeight - rect.height - parseFloat(computedStyle.bottom || '0')
      }
    }
    
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: currentLeft,
      startTop: currentTop
    }
  }, [])

  // Обработка изменения размера
  const handleMouseDown = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    resizeRef.current = { isResizing: true, corner }
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    }
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current.isDragging && containerRef.current) {
        const deltaX = e.clientX - dragRef.current.startX
        const deltaY = e.clientY - dragRef.current.startY
        
        const newLeft = dragRef.current.startLeft + deltaX
        const newTop = dragRef.current.startTop + deltaY
        
        // Ограничиваем перемещение в пределах окна
        const maxLeft = window.innerWidth - containerRef.current.offsetWidth
        const maxTop = window.innerHeight - containerRef.current.offsetHeight
        
        const clampedLeft = Math.max(0, Math.min(maxLeft, newLeft))
        const clampedTop = Math.max(0, Math.min(maxTop, newTop))
        
        containerRef.current.style.left = `${clampedLeft}px`
        containerRef.current.style.top = `${clampedTop}px`
        containerRef.current.style.right = 'auto'
        containerRef.current.style.bottom = 'auto'
        
        // Сохраняем новую позицию
        positionRef.current = {
          left: `${clampedLeft}px`,
          right: 'auto',
          top: `${clampedTop}px`,
          bottom: 'auto',
          isDragged: true
        }
      }

      if (resizeRef.current.isResizing && containerRef.current) {
        const deltaX = e.clientX - resizeStartRef.current.x
        const deltaY = e.clientY - resizeStartRef.current.y
        const corner = resizeRef.current.corner

        let newWidth = resizeStartRef.current.width
        let newHeight = resizeStartRef.current.height

        // Изменение размера справа - не меняет позицию
        if (corner?.includes('right')) {
          newWidth = Math.max(320, Math.min(800, resizeStartRef.current.width + deltaX))
        }
        
        // Изменение размера слева
        if (corner?.includes('left')) {
          newWidth = Math.max(320, Math.min(800, resizeStartRef.current.width - deltaX))
          // Если окно не было перемещено пользователем, используем right вместо left
          if (!positionRef.current.isDragged) {
            // Вычисляем текущий right и обновляем его
            const currentRight = window.innerWidth - resizeStartRef.current.left - resizeStartRef.current.width
            const newRight = currentRight + deltaX
            containerRef.current.style.right = `${newRight}px`
            containerRef.current.style.left = 'auto'
            positionRef.current.right = `${newRight}px`
            positionRef.current.left = 'auto'
          } else {
            // Если было перемещено, используем left
            const widthDelta = resizeStartRef.current.width - newWidth
            const newLeft = resizeStartRef.current.left + widthDelta
            containerRef.current.style.left = `${newLeft}px`
            containerRef.current.style.right = 'auto'
            positionRef.current.left = `${newLeft}px`
            positionRef.current.right = 'auto'
          }
        }
        
        // Изменение размера снизу - не меняет позицию
        if (corner?.includes('bottom')) {
          newHeight = Math.max(400, Math.min(window.innerHeight - 50, resizeStartRef.current.height + deltaY))
        }
        
        // Изменение размера сверху
        if (corner?.includes('top')) {
          newHeight = Math.max(400, Math.min(window.innerHeight - 50, resizeStartRef.current.height - deltaY))
          // Если окно не было перемещено пользователем, используем bottom вместо top
          if (!positionRef.current.isDragged) {
            // Вычисляем текущий bottom и обновляем его
            const currentBottom = window.innerHeight - resizeStartRef.current.top - resizeStartRef.current.height
            const newBottom = currentBottom + deltaY
            containerRef.current.style.bottom = `${newBottom}px`
            containerRef.current.style.top = 'auto'
            positionRef.current.bottom = `${newBottom}px`
            positionRef.current.top = 'auto'
          } else {
            // Если было перемещено, используем top
            const heightDelta = resizeStartRef.current.height - newHeight
            const newTop = resizeStartRef.current.top + heightDelta
            containerRef.current.style.top = `${newTop}px`
            containerRef.current.style.bottom = 'auto'
            positionRef.current.top = `${newTop}px`
            positionRef.current.bottom = 'auto'
          }
        }

        sizeRef.current = { width: newWidth, height: newHeight }
        containerRef.current.style.width = `${newWidth}px`
        containerRef.current.style.height = `${newHeight}px`
      }
    }

    const handleMouseUp = () => {
      resizeRef.current = { isResizing: false, corner: null }
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: AIMessage = { role: 'user', content: inputValue.trim() }
    const systemMessage = messages.find(m => m.role === 'system')!
    
    // Получаем все сообщения кроме системного
    const nonSystemMessages = messages.filter(m => m.role !== 'system')
    
    // Ограничиваем память: храним только последние 4 сообщения (не считая приветственное)
    // Приветственное сообщение остается видимым, но не включается в контекст
    const welcomeMsg = nonSystemMessages.find(
      msg => msg.role === 'assistant' && msg.content === WELCOME_MESSAGE
    )
    
    // Фильтруем приветственное сообщение из разговора
    const conversationMessages = nonSystemMessages.filter(
      msg => !(msg.role === 'assistant' && msg.content === WELCOME_MESSAGE)
    )
    
    // Берем последние 3 сообщения из разговора (чтобы после добавления нового было 4)
    // Всего в памяти: системное (1) + последние 4 сообщения = 5 сообщений
    const recentMessages = conversationMessages.slice(-3)
    
    // Добавляем новое сообщение пользователя
    const newConversationMessages = [...recentMessages, userMessage]
    
    // Обновляем состояние: системное + приветственное (если есть) + последние сообщения
    const updatedMessages = [
      systemMessage,
      ...(welcomeMsg ? [welcomeMsg] : []),
      ...newConversationMessages
    ]
    
    setMessages(updatedMessages)
    setInputValue('')
    setIsLoading(true)
    setError(null)

    try {
      // Ограничиваем память до 5 сообщений для API (системное + последние 4)
      // Приветственное сообщение не включаем в контекст
      const messagesToSend: AIMessage[] = [
        systemMessage, // Системное сообщение
        ...newConversationMessages.slice(-4) // Последние 4 сообщения из разговора
      ]

      const response = await aiApi.chat({
        messages: messagesToSend,
        serverId,
        serverType
      })

      if (response.success && response.response) {
        // Добавляем ответ ассистента
        const assistantMessage: AIMessage = { role: 'assistant', content: response.response }
        const finalConversation = [...newConversationMessages, assistantMessage]
        
        // Ограничиваем до последних 4 сообщений разговора
        const finalRecent = finalConversation.slice(-4)
        
        // Обновляем состояние: системное + приветственное + последние 4 сообщения
        setMessages([
          systemMessage,
          ...(welcomeMsg ? [welcomeMsg] : []),
          ...finalRecent
        ])
      } else {
        setError(response.error || 'Произошла ошибка')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось отправить сообщение')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const assistantContent = isMinimized ? (
    <>
      {showTooltip && (
        <div className="ai-assistant-tooltip">
          <div className="ai-assistant-tooltip-content">
            <div className="ai-assistant-tooltip-main">
              <div className="ai-assistant-tooltip-title">ИИ ассистент</div>
              <div className="ai-assistant-tooltip-description">
                Нажмите на кнопку, чтобы открыть помощника для работы с серверами. Он поможет с командами, установкой библиотек и решением проблем.
              </div>
            </div>
            <button 
              className="ai-assistant-tooltip-close"
              onClick={(e) => {
                e.stopPropagation()
                handleHideTooltip()
              }}
              title="Больше не показывать"
            >
              ✕
            </button>
          </div>
          <div className="ai-assistant-tooltip-arrow"></div>
        </div>
      )}
      <div className="ai-assistant-minimized" onClick={() => setIsMinimized(false)}>
        <img src={botAvatar} alt="AI Ассистент" className="ai-assistant-avatar-minimized" />
      </div>
    </>
  ) : (
    <div
      ref={containerRef}
      className="ai-assistant"
      style={{
        width: `${sizeRef.current.width}px`,
        height: `${sizeRef.current.height}px`,
        left: positionRef.current.left,
        right: positionRef.current.right,
        top: positionRef.current.top,
        bottom: positionRef.current.bottom,
      }}
    >
      {/* Заголовок с кнопками */}
      <div 
        className="ai-assistant-header"
        onMouseDown={(e) => {
          // Не запускаем перетаскивание, если клик на кнопку
          if ((e.target as HTMLElement).closest('.ai-assistant-btn')) {
            return
          }
          handleHeaderMouseDown(e)
        }}
      >
        <div className="ai-assistant-title">
          <img src={botAvatar} alt="AI Ассистент" className="ai-assistant-avatar-header" />
          <span>AI Ассистент</span>
        </div>
        <div className="ai-assistant-controls">
          <button
            className="ai-assistant-btn ai-assistant-clear-btn"
            onClick={(e) => {
              e.stopPropagation()
              const systemMessage = messages.find(m => m.role === 'system')!
              setMessages([
                systemMessage,
                { role: 'assistant', content: WELCOME_MESSAGE }
              ])
              positionRef.current.isDragged = false
            }}
            title="Очистить чат"
          >
            🗑️
          </button>
          <button
            className="ai-assistant-btn"
            onClick={(e) => {
              e.stopPropagation()
              setIsMinimized(true)
            }}
            title="Свернуть"
          >
            −
          </button>
        </div>
      </div>

      {/* Область сообщений */}
      <div className="ai-assistant-messages">
        {messages.filter(m => m.role !== 'system').map((message, index) => {
          const isAssistant = message.role === 'assistant'
          const parsedParts = isAssistant ? parseMessage(message.content) : null
          
          return (
            <div
              key={index}
              className={`ai-message ${message.role === 'user' ? 'ai-message-user' : 'ai-message-assistant'}`}
            >
              <div className="ai-message-content">
                {isAssistant && parsedParts ? (
                  parsedParts.map((part, partIndex) => (
                    <div key={partIndex}>
                      {part.type === 'command' ? (
                        <CommandBlock command={part.content} />
                      ) : (
                        <div className="ai-message-text" style={{ userSelect: 'text', cursor: 'text' }}>
                          {part.content}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="ai-message-text" style={{ userSelect: 'text', cursor: 'text' }}>
                    {message.content}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {isLoading && (
          <div className="ai-message ai-message-assistant">
            <div className="ai-message-content">
              <div className="ai-loading">Думаю...</div>
            </div>
          </div>
        )}
        {error && (
          <div className="ai-message ai-message-error">
            <div className="ai-message-content">{error}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="ai-assistant-input-container">
        <textarea
          className="ai-assistant-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Задайте вопрос о сервере..."
          rows={2}
          disabled={isLoading}
        />
        <button
          className="ai-assistant-send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
        >
          →
        </button>
      </div>

      {/* Углы для изменения размера */}
      <div
        className="ai-resize-handle ai-resize-top-left"
        onMouseDown={(e) => handleMouseDown(e, 'top-left')}
      />
      <div
        className="ai-resize-handle ai-resize-top-right"
        onMouseDown={(e) => handleMouseDown(e, 'top-right')}
      />
      <div
        className="ai-resize-handle ai-resize-bottom-left"
        onMouseDown={(e) => handleMouseDown(e, 'bottom-left')}
      />
      <div
        className="ai-resize-handle ai-resize-bottom-right"
        onMouseDown={(e) => handleMouseDown(e, 'bottom-right')}
      />
    </div>
  )

  // Используем портал для рендеринга поверх всех элементов
  return createPortal(assistantContent, document.body)
}

