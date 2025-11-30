import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { serversApi } from '../api/servers'
import { paymentApi } from '../api/payment'
import ConfirmDialog from './ConfirmDialog'
import AlertDialog from './AlertDialog'
import CodeEditor, { detectLanguage } from './CodeEditor'
import './FileManager.css'

interface FileManagerProps {
  serverId: number
  serverType?: 'ssh' | 'allocated'
}

export default function FileManager({ serverId, serverType = 'ssh' }: FileManagerProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Для выданных серверов всегда начинаем с ~ (корневая директория сервера)
  // Для SSH серверов начинаем с домашней директории пользователя, но можно использовать абсолютные пути
  const [currentPath, setCurrentPath] = useState(serverType === 'allocated' ? '~' : '~')
  const [uploadPath, setUploadPath] = useState('~')
  const [history, setHistory] = useState<string[]>(['~'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showCreateFileDialog, setShowCreateFileDialog] = useState(false)
  const [showCreateDirDialog, setShowCreateDirDialog] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newDirName, setNewDirName] = useState('')
  const [renameFileName, setRenameFileName] = useState('')
  const [renameFilePath, setRenameFilePath] = useState('')
  const [editFilePath, setEditFilePath] = useState('')
  const [editFileContent, setEditFileContent] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean
    filePath: string
    fileName: string
    isDir: boolean
  }>({
    isOpen: false,
    filePath: '',
    fileName: '',
    isDir: false
  })
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
  const [runningProcesses, setRunningProcesses] = useState<Map<string, number>>(new Map())
  const [showSearchDialog, setShowSearchDialog] = useState(false)
  const [searchPattern, setSearchPattern] = useState('')
  const [searchPath, setSearchPath] = useState('~')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [includeVenv, setIncludeVenv] = useState(false)
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['files', serverId, currentPath, serverType],
    queryFn: () => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerListDirectory(serverId, currentPath)
      }
      return serversApi.listDirectory(serverId, currentPath)
    },
  })

  const navigateToPath = (newPath: string) => {
    // Для выданных серверов проверяем, что путь не выходит за пределы
    if (serverType === 'allocated') {
      // Нормализуем путь: убираем попытки выйти выше
      let normalizedPath = newPath.trim()
      if (normalizedPath.startsWith('../') || normalizedPath === '..' || normalizedPath.startsWith('/')) {
        // Блокируем попытки выйти за пределы
        normalizedPath = '~'
      }
      // Если путь начинается с /, заменяем на ~
      if (normalizedPath.startsWith('/')) {
        normalizedPath = '~' + normalizedPath
      }
      // Если путь не начинается с ~, добавляем ~/
      if (!normalizedPath.startsWith('~')) {
        normalizedPath = '~/' + normalizedPath
      }
      newPath = normalizedPath
    }
    
    // Добавляем в историю, если это новый путь
    if (newPath !== currentPath) {
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(newPath)
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    }
    
    setCurrentPath(newPath)
    refetch()
  }

  const handlePathChange = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    navigateToPath(currentPath)
  }

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setCurrentPath(history[newIndex])
      refetch()
    }
  }

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setCurrentPath(history[newIndex])
      refetch()
    }
  }

  const parseLsOutput = (output: string) => {
    const lines = output.split('\n').filter((line) => line.trim())
    const files: Array<{
      permissions: string
      links: string
      owner: string
      group: string
      size: string
      date: string
      name: string
      isDir: boolean
    }> = []

    for (const line of lines) {
      // Пропускаем заголовок и строки с ошибками
      if (line.includes('total') || line.includes('Directory not found')) {
        continue
      }

      const parts = line.trim().split(/\s+/)
      if (parts.length >= 9) {
        const permissions = parts[0]
        const links = parts[1]
        const owner = parts[2]
        const group = parts[3]
        const size = parts[4]
        const date = parts.slice(5, 8).join(' ')
        const name = parts.slice(8).join(' ')

        // Пропускаем системные записи . и .. (особенно важно для выданных серверов)
        if (name === '.' || name === '..') {
          continue
        }

        files.push({
          permissions,
          links,
          owner,
          group,
          size,
          date,
          name,
          isDir: permissions.startsWith('d'),
        })
      }
    }

    return files
  }

  const uploadMutation = useMutation({
    mutationFn: ({ file, path }: { file: File; path: string }) => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerUploadFile(serverId, file, path)
      }
      return serversApi.uploadFile(serverId, file, path)
    },
    onSuccess: (data) => {
      setAlertDialog({
        isOpen: true,
        title: data.success ? 'Файл загружен' : 'Ошибка',
        message: data.message,
        type: data.success ? 'success' : 'error'
      })
      setShowUploadDialog(false)
      queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] })
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.message || 'Ошибка при загрузке файла',
        type: 'error'
      })
    }
  })

  const createFileMutation = useMutation({
    mutationFn: (filePath: string) => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerCreateFile(serverId, filePath)
      }
      return serversApi.createFile(serverId, filePath)
    },
    onSuccess: (data) => {
      setAlertDialog({
        isOpen: true,
        title: data.success ? 'Файл создан' : 'Ошибка',
        message: data.message,
        type: data.success ? 'success' : 'error'
      })
      setShowCreateFileDialog(false)
      setNewFileName('')
      queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] })
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.message || 'Ошибка при создании файла',
        type: 'error'
      })
    }
  })

  const createDirectoryMutation = useMutation({
    mutationFn: (dirPath: string) => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerCreateDirectory(serverId, dirPath)
      }
      return serversApi.createDirectory(serverId, dirPath)
    },
    onSuccess: (data) => {
      setAlertDialog({
        isOpen: true,
        title: data.success ? 'Директория создана' : 'Ошибка',
        message: data.message,
        type: data.success ? 'success' : 'error'
      })
      setShowCreateDirDialog(false)
      setNewDirName('')
      queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] })
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.message || 'Ошибка при создании директории',
        type: 'error'
      })
    }
  })

  const renameMutation = useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerRenameFile(serverId, oldPath, newPath)
      }
      return serversApi.renameFile(serverId, oldPath, newPath)
    },
    onSuccess: (data) => {
      setAlertDialog({
        isOpen: true,
        title: data.success ? 'Файл переименован' : 'Ошибка',
        message: data.message,
        type: data.success ? 'success' : 'error'
      })
      setShowRenameDialog(false)
      setRenameFileName('')
      setRenameFilePath('')
      queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] })
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.message || 'Ошибка при переименовании файла',
        type: 'error'
      })
    }
  })

  const readFileMutation = useMutation({
    mutationFn: (filePath: string) => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerReadFile(serverId, filePath)
      }
      return serversApi.readFile(serverId, filePath)
    },
    onSuccess: (data, filePath) => {
      if (data.success && data.content !== undefined) {
        setEditFilePath(filePath)
        setEditFileContent(data.content)
        setShowEditDialog(true)
      } else {
        setAlertDialog({
          isOpen: true,
          title: 'Ошибка',
          message: data.message || 'Не удалось прочитать файл',
          type: 'error'
        })
      }
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.message || 'Ошибка при чтении файла',
        type: 'error'
      })
    }
  })

  const writeFileMutation = useMutation({
    mutationFn: ({ filePath, content }: { filePath: string; content: string }) => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerWriteFile(serverId, filePath, content)
      }
      return serversApi.writeFile(serverId, filePath, content)
    },
    onSuccess: (data) => {
      setAlertDialog({
        isOpen: true,
        title: data.success ? 'Файл сохранен' : 'Ошибка',
        message: data.message,
        type: data.success ? 'success' : 'error'
      })
      if (data.success) {
        setShowEditDialog(false)
        setEditFilePath('')
        setEditFileContent('')
        queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] })
      }
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.message || 'Ошибка при сохранении файла',
        type: 'error'
      })
    }
  })

  const searchFilesMutation = useMutation({
    mutationFn: ({ searchPath, pattern }: { searchPath: string; pattern: string }) => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerSearchFiles(serverId, searchPath, pattern, 100)
      }
      return serversApi.searchFiles(serverId, searchPath, pattern, 100)
    },
    onSuccess: (data) => {
      if (data.success) {
        // Фильтруем результаты: исключаем файлы из venv, если чекбокс не отмечен
        let filteredFiles = data.files
        if (!includeVenv) {
          filteredFiles = data.files.filter(filePath => {
            // Исключаем файлы, которые находятся в папке venv
            // Проверяем различные варианты путей: ~/venv/, venv/, /venv/
            const normalizedPath = filePath.toLowerCase()
            return !normalizedPath.includes('/venv/') && 
                   !normalizedPath.includes('venv/') && 
                   !normalizedPath.startsWith('venv/') &&
                   !normalizedPath.endsWith('/venv')
          })
        }
        setSearchResults(filteredFiles)
        setIsSearching(false)
      } else {
        setAlertDialog({
          isOpen: true,
          title: 'Ошибка поиска',
          message: data.message || 'Не удалось выполнить поиск',
          type: 'error'
        })
        setIsSearching(false)
      }
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.message || 'Ошибка при поиске файлов',
        type: 'error'
      })
      setIsSearching(false)
    }
  })

  const handleSearch = () => {
    if (!searchPattern.trim()) {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: 'Введите паттерн для поиска',
        type: 'warning'
      })
      return
    }
    setIsSearching(true)
    searchFilesMutation.mutate({ searchPath, pattern: searchPattern })
  }

  const handleSearchResultClick = (filePath: string) => {
    // Нормализуем путь (убираем ~ если есть)
    let normalizedFilePath = filePath
    if (normalizedFilePath.startsWith('~/')) {
      normalizedFilePath = normalizedFilePath.substring(2)
    } else if (normalizedFilePath === '~') {
      normalizedFilePath = ''
    }
    
    // Извлекаем директорию из пути
    const lastSlashIndex = normalizedFilePath.lastIndexOf('/')
    let dirPath = '~'
    let fileName = normalizedFilePath
    
    if (lastSlashIndex !== -1) {
      dirPath = normalizedFilePath.substring(0, lastSlashIndex)
      fileName = normalizedFilePath.substring(lastSlashIndex + 1)
      // Если путь не начинается с ~, добавляем
      if (!dirPath.startsWith('~')) {
        dirPath = dirPath ? `~/${dirPath}` : '~'
      }
    }
    
    // Переходим к директории
    navigateToPath(dirPath)
    
    // Ждем немного, чтобы файлы загрузились, затем подсвечиваем
    setTimeout(() => {
      setHighlightedFile(fileName)
      
      // Убираем подсветку через 2 секунды
      setTimeout(() => {
        setHighlightedFile(null)
      }, 2000)
    }, 300)
    
    // Закрываем диалог поиска
    setShowSearchDialog(false)
    setSearchPattern('')
    setSearchResults([])
  }

  const deleteMutation = useMutation({
    mutationFn: (filePath: string) => {
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerDeleteFile(serverId, filePath)
      }
      return serversApi.deleteFile(serverId, filePath)
    },
    onSuccess: (data) => {
      // Если удален venv, очищаем флаг инициализации, чтобы он пересоздался
      if (deleteDialog.fileName === 'venv' && deleteDialog.isDir) {
        const venvCheckKey = `venv_initialized_${serverId}_${serverType}`
        localStorage.removeItem(venvCheckKey)
      }
      
      setAlertDialog({
        isOpen: true,
        title: data.success ? (deleteDialog.isDir ? 'Директория удалена' : 'Файл удален') : 'Ошибка',
        message: data.message,
        type: data.success ? 'success' : 'error'
      })
      setDeleteDialog({ ...deleteDialog, isOpen: false })
      queryClient.invalidateQueries({ queryKey: ['files', serverId, currentPath] })
    },
    onError: (error: any) => {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.response?.data?.message || 'Ошибка при удалении файла',
        type: 'error'
      })
    }
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const remotePath = uploadPath === '~' 
        ? `~/${file.name}`
        : `${uploadPath}/${file.name}`
      uploadMutation.mutate({ file, path: remotePath })
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDelete = (filePath: string, fileName: string, isDir: boolean = false) => {
    setDeleteDialog({
      isOpen: true,
      filePath,
      fileName,
      isDir
    })
  }

  const handleRename = (filePath: string, fileName: string) => {
    setRenameFilePath(filePath)
    setRenameFileName(fileName)
    setShowRenameDialog(true)
  }

  const handleEdit = (filePath: string) => {
    readFileMutation.mutate(filePath)
  }

  const isTextFile = (fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop()
    const textExtensions = ['txt', 'md', 'json', 'yml', 'yaml', 'xml', 'csv', 'log', 'conf', 'config', 'ini', 'py', 'js', 'ts', 'html', 'css', 'sh', 'bash', 'env', 'gitignore', 'dockerfile', 'sql', 'php', 'java', 'cpp', 'c', 'h', 'hpp', 'go', 'rs', 'rb', 'pl', 'lua', 'r', 'swift', 'kt', 'scala', 'clj', 'hs', 'ml', 'fs', 'vb', 'cs', 'dart', 'elm', 'ex', 'exs', 'erl', 'hrl', 'vim', 'zsh', 'fish', 'ps1', 'bat', 'cmd']
    return textExtensions.includes(ext || '') || !ext || fileName.indexOf('.') === -1
  }

  const isExecutableFile = (fileName: string, isDir: boolean) => {
    if (isDir) return false
    const ext = fileName.toLowerCase().split('.').pop()
    // Исключаем текстовые файлы и exe
    const excludedExts = ['exe', 'txt', 'md', 'json', 'yml', 'yaml', 'xml', 'csv', 'log', 'conf', 'config', 'ini']
    return !excludedExts.includes(ext || '')
  }

  const getRunCommand = (fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop()
    
    // Для Python файлов используем python3
    if (ext === 'py') {
      return `cd ${currentPath === '~' ? '~' : currentPath} && source venv/bin/activate && nohup python3 "${fileName}" > "${fileName}.log" 2>&1 & echo $!`
    }
    
    // Для других файлов делаем исполняемым и запускаем
    return `cd ${currentPath === '~' ? '~' : currentPath} && chmod +x "${fileName}" && nohup ./"${fileName}" > "${fileName}.log" 2>&1 & echo $!`
  }

  const handleRunFile = async (fileName: string) => {
    try {
      // Получаем команду запуска в зависимости от типа файла
      const command = getRunCommand(fileName)
      
      const result = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, command)
        : await serversApi.exec(serverId, command)
      
      if (result.success) {
        const pid = parseInt(result.stdout.trim())
        if (!isNaN(pid)) {
          setRunningProcesses(prev => new Map(prev).set(fileName, pid))
          setAlertDialog({
            isOpen: true,
            title: 'Успех',
            message: `Файл ${fileName} запущен в фоне (PID: ${pid})`,
            type: 'success'
          })
        }
      } else {
        setAlertDialog({
          isOpen: true,
          title: 'Ошибка',
          message: result.stderr || 'Не удалось запустить файл',
          type: 'error'
        })
      }
    } catch (error: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.message || 'Ошибка при запуске файла',
        type: 'error'
      })
    }
  }

  const handleStopFile = async (fileName: string, pid: number) => {
    try {
      const command = `kill ${pid}`
      const result = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, command)
        : await serversApi.exec(serverId, command)
      
      if (result.success) {
        setRunningProcesses(prev => {
          const newMap = new Map(prev)
          newMap.delete(fileName)
          return newMap
        })
        setAlertDialog({
          isOpen: true,
          title: 'Успех',
          message: `Процесс ${fileName} остановлен`,
          type: 'success'
        })
      } else {
        setAlertDialog({
          isOpen: true,
          title: 'Ошибка',
          message: result.stderr || 'Не удалось остановить процесс',
          type: 'error'
        })
      }
    } catch (error: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Ошибка',
        message: error.message || 'Ошибка при остановке процесса',
        type: 'error'
      })
    }
  }

  const files = data?.stdout ? parseLsOutput(data.stdout) : []

  return (
    <div className="file-manager">
      <div className="file-manager-toolbar">
        <div className="navigation-controls">
          <button
            className="btn-nav"
            onClick={handleBack}
            disabled={historyIndex === 0}
            title="Назад"
          >
            ←
          </button>
          <button
            className="btn-nav"
            onClick={handleForward}
            disabled={historyIndex >= history.length - 1}
            title="Вперед"
          >
            →
          </button>
        </div>
        <form onSubmit={handlePathChange} className="path-input-form">
          <label>Текущая директория:</label>
          <div className="path-input-group">
            <input
              type="text"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              className="path-input"
              placeholder="/home/user"
            />
            <button type="submit" className="btn-primary">
              Перейти
            </button>
          </div>
        </form>
        <div className="file-manager-actions">
          <button
            className="btn-upload"
            onClick={() => {
              setUploadPath(currentPath)
              setShowUploadDialog(true)
            }}
          >
            📤 Загрузить файл
          </button>
          <button
            className="btn-create-file"
            onClick={() => {
              setNewFileName('')
              setShowCreateFileDialog(true)
            }}
          >
            📄 Создать файл
          </button>
          <button
            className="btn-create-dir"
            onClick={() => {
              setNewDirName('')
              setShowCreateDirDialog(true)
            }}
          >
            📁 Создать папку
          </button>
          <button
            className="btn-refresh"
            onClick={() => refetch()}
          >
            🔄 Обновить
          </button>
          <button
            className="btn-search"
            onClick={() => {
              setSearchPath(currentPath)
              setSearchPattern('')
              setSearchResults([])
              setIncludeVenv(false)
              setShowSearchDialog(true)
            }}
          >
            🔍 Поиск файлов
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Загрузка...</div>
      ) : data?.stderr && !data.stdout ? (
        <div className="error">{data.stderr}</div>
      ) : (
        <div className="files-table">
          <table>
            <thead>
              <tr>
                <th>Тип / Имя</th>
                <th>Размер</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">
                    Директория пуста
                  </td>
                </tr>
              ) : (
                files.map((file, index) => (
                  <tr key={index} className={highlightedFile === file.name ? 'file-highlighted' : ''}>
                    <td>
                      <div className="file-name-cell" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span className={`file-type ${file.isDir ? 'dir' : 'file'}`}>
                          {file.isDir ? '📁' : '📄'}
                        </span>
                        <span
                          className={file.isDir ? 'dir-name' : 'file-name'}
                          onClick={() => {
                            if (file.isDir) {
                              // Для выданных серверов всегда используем относительные пути от ~
                              if (serverType === 'allocated') {
                                const newPath =
                                  currentPath === '~'
                                    ? `~/${file.name}`
                                    : `${currentPath}/${file.name}`
                                // Проверяем, что не пытаемся выйти выше
                                if (!newPath.includes('../') && !newPath.startsWith('/')) {
                                  navigateToPath(newPath)
                                }
                              } else {
                                // Для SSH серверов используем абсолютные пути или относительные
                                let newPath: string
                                if (currentPath === '~') {
                                  newPath = `~/${file.name}`
                                } else if (currentPath.startsWith('/')) {
                                  // Абсолютный путь
                                  newPath = `${currentPath}/${file.name}`
                                } else {
                                  // Относительный путь
                                  newPath = `${currentPath}/${file.name}`
                                }
                                navigateToPath(newPath)
                              }
                            }
                          }}
                        >
                          {file.name}
                        </span>
                        <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
                          {!file.isDir && (
                            <>
                              {isTextFile(file.name) && (
                                <button
                                  className="btn-edit-file"
                                  onClick={() => {
                                    const fullPath = currentPath === '~'
                                      ? `~/${file.name}`
                                      : `${currentPath}/${file.name}`
                                    handleEdit(fullPath)
                                  }}
                                  title="Редактировать файл"
                                >
                                  ✏️
                                </button>
                              )}
                              {isExecutableFile(file.name, file.isDir) && (
                                runningProcesses.has(file.name) ? (
                                  <button
                                    className="btn-stop-file"
                                    onClick={() => handleStopFile(file.name, runningProcesses.get(file.name)!)}
                                    title="Остановить процесс"
                                  >
                                    ⏹️
                                  </button>
                                ) : (
                                  <button
                                    className="btn-run-file"
                                    onClick={() => handleRunFile(file.name)}
                                    title="Запустить в фоне"
                                  >
                                    ▶️
                                  </button>
                                )
                              )}
                            </>
                          )}
                          <button
                            className="btn-rename-file"
                            onClick={() => {
                              const fullPath = currentPath === '~'
                                ? `~/${file.name}`
                                : `${currentPath}/${file.name}`
                              handleRename(fullPath, file.name)
                            }}
                            title={file.isDir ? "Переименовать директорию" : "Переименовать файл"}
                          >
                            📝
                          </button>
                          <button
                            className="btn-delete-file"
                            onClick={() => {
                              const fullPath = currentPath === '~'
                                ? `~/${file.name}`
                                : `${currentPath}/${file.name}`
                              handleDelete(fullPath, file.name, file.isDir)
                            }}
                            title={file.isDir ? "Удалить директорию" : "Удалить файл"}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>{file.size}</td>
                    <td>{file.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showUploadDialog && (
        <div className="upload-dialog-overlay" onClick={() => setShowUploadDialog(false)}>
          <div className="upload-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="upload-dialog-header">
              <h3>Загрузить файл</h3>
              <button className="close-btn" onClick={() => setShowUploadDialog(false)}>×</button>
            </div>
            <div className="upload-dialog-content">
              <div className="form-group">
                <label>Путь назначения:</label>
                <input
                  type="text"
                  value={uploadPath}
                  onChange={(e) => setUploadPath(e.target.value)}
                  className="path-input"
                  placeholder="~"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button
                className="btn-select-file"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? 'Загрузка...' : 'Выбрать файл'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateFileDialog && (
        <div className="upload-dialog-overlay" onClick={() => setShowCreateFileDialog(false)}>
          <div className="upload-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="upload-dialog-header">
              <h3>Создать файл</h3>
              <button className="close-btn" onClick={() => setShowCreateFileDialog(false)}>×</button>
            </div>
            <div className="upload-dialog-content">
              <div className="form-group">
                <label>Имя файла:</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="path-input"
                  placeholder="example.txt"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFileName.trim()) {
                      const filePath = currentPath === '~'
                        ? `~/${newFileName.trim()}`
                        : `${currentPath}/${newFileName.trim()}`
                      createFileMutation.mutate(filePath)
                    }
                  }}
                />
              </div>
              <button
                className="btn-select-file"
                onClick={() => {
                  if (newFileName.trim()) {
                    const filePath = currentPath === '~'
                      ? `~/${newFileName.trim()}`
                      : `${currentPath}/${newFileName.trim()}`
                    createFileMutation.mutate(filePath)
                  }
                }}
                disabled={createFileMutation.isPending || !newFileName.trim()}
              >
                {createFileMutation.isPending ? 'Создание...' : 'Создать файл'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateDirDialog && (
        <div className="upload-dialog-overlay" onClick={() => setShowCreateDirDialog(false)}>
          <div className="upload-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="upload-dialog-header">
              <h3>Создать папку</h3>
              <button className="close-btn" onClick={() => setShowCreateDirDialog(false)}>×</button>
            </div>
            <div className="upload-dialog-content">
              <div className="form-group">
                <label>Имя папки:</label>
                <input
                  type="text"
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                  className="path-input"
                  placeholder="my_folder"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newDirName.trim()) {
                      const dirPath = currentPath === '~'
                        ? `~/${newDirName.trim()}`
                        : `${currentPath}/${newDirName.trim()}`
                      createDirectoryMutation.mutate(dirPath)
                    }
                  }}
                />
              </div>
              <button
                className="btn-select-file"
                onClick={() => {
                  if (newDirName.trim()) {
                    const dirPath = currentPath === '~'
                      ? `~/${newDirName.trim()}`
                      : `${currentPath}/${newDirName.trim()}`
                    createDirectoryMutation.mutate(dirPath)
                  }
                }}
                disabled={createDirectoryMutation.isPending || !newDirName.trim()}
              >
                {createDirectoryMutation.isPending ? 'Создание...' : 'Создать папку'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameDialog && (
        <div className="upload-dialog-overlay" onClick={() => setShowRenameDialog(false)}>
          <div className="upload-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="upload-dialog-header">
              <h3>Переименовать</h3>
              <button className="close-btn" onClick={() => setShowRenameDialog(false)}>×</button>
            </div>
            <div className="upload-dialog-content">
              <div className="form-group">
                <label>Новое имя:</label>
                <input
                  type="text"
                  value={renameFileName}
                  onChange={(e) => setRenameFileName(e.target.value)}
                  className="path-input"
                  placeholder={renameFileName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameFileName.trim()) {
                      const dirPath = renameFilePath.substring(0, renameFilePath.lastIndexOf('/')) || currentPath
                      const newPath = dirPath === '~' || dirPath === currentPath
                        ? `${currentPath === '~' ? '~' : currentPath}/${renameFileName.trim()}`
                        : `${dirPath}/${renameFileName.trim()}`
                      renameMutation.mutate({ oldPath: renameFilePath, newPath })
                    }
                  }}
                />
              </div>
              <button
                className="btn-select-file"
                onClick={() => {
                  if (renameFileName.trim()) {
                    const dirPath = renameFilePath.substring(0, renameFilePath.lastIndexOf('/')) || currentPath
                    const newPath = dirPath === '~' || dirPath === currentPath
                      ? `${currentPath === '~' ? '~' : currentPath}/${renameFileName.trim()}`
                      : `${dirPath}/${renameFileName.trim()}`
                    renameMutation.mutate({ oldPath: renameFilePath, newPath })
                  }
                }}
                disabled={renameMutation.isPending || !renameFileName.trim()}
              >
                {renameMutation.isPending ? 'Переименование...' : 'Переименовать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && (
        <div className="upload-dialog-overlay" onClick={() => setShowEditDialog(false)}>
          <div className="upload-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', width: '800px' }}>
            <div className="upload-dialog-header">
              <h3>Редактировать файл: {editFilePath.split('/').pop()}</h3>
              <button className="close-btn" onClick={() => setShowEditDialog(false)}>×</button>
            </div>
            <div className="upload-dialog-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label>Содержимое:</label>
                <CodeEditor
                  value={editFileContent}
                  onChange={setEditFileContent}
                  language={detectLanguage(editFilePath)}
                  placeholder="Введите содержимое файла..."
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  className="btn-select-file"
                  onClick={() => setShowEditDialog(false)}
                  disabled={writeFileMutation.isPending}
                >
                  Отмена
                </button>
                <button
                  className="btn-select-file"
                  onClick={() => {
                    if (editFilePath) {
                      writeFileMutation.mutate({ filePath: editFilePath, content: editFileContent })
                    }
                  }}
                  disabled={writeFileMutation.isPending}
                  style={{ background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)' }}
                >
                  {writeFileMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title={deleteDialog.isDir ? "Удаление директории" : "Удаление файла"}
        message={
          deleteDialog.fileName === 'venv' && deleteDialog.isDir
            ? `⚠️ ВНИМАНИЕ: Вы собираетесь удалить виртуальное окружение Python (venv)!\n\nЭто удалит все установленные библиотеки. После удаления вам нужно будет:\n1. Создать новое виртуальное окружение\n2. Переустановить все необходимые библиотеки\n\nВы уверены, что хотите продолжить?`
            : deleteDialog.isDir
            ? `Вы уверены, что хотите удалить директорию "${deleteDialog.fileName}"?\n\nЭто действие удалит директорию и все её содержимое. Это действие нельзя отменить.`
            : `Вы уверены, что хотите удалить файл "${deleteDialog.fileName}"?\n\nЭто действие нельзя отменить.`
        }
        type="danger"
        confirmText="Удалить"
        onConfirm={() => {
          deleteMutation.mutate(deleteDialog.filePath)
        }}
        onCancel={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
      />

      {showSearchDialog && (
        <div className="upload-dialog-overlay" onClick={() => setShowSearchDialog(false)}>
          <div className="upload-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', width: '600px' }}>
            <div className="upload-dialog-header">
              <h3>Поиск файлов</h3>
              <button className="close-btn" onClick={() => setShowSearchDialog(false)}>×</button>
            </div>
            <div className="upload-dialog-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>Путь для поиска:</label>
                <input
                  type="text"
                  value={searchPath}
                  onChange={(e) => setSearchPath(e.target.value)}
                  placeholder="~"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div className="form-group">
                <label>Паттерн поиска (имя файла или часть):</label>
                <input
                  type="text"
                  value={searchPattern}
                  onChange={(e) => setSearchPattern(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch()
                    }
                  }}
                  placeholder="например: *.py или config"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                <input
                  type="checkbox"
                  id="include-venv"
                  checked={includeVenv}
                  onChange={(e) => setIncludeVenv(e.target.checked)}
                  style={{ cursor: 'pointer', margin: 0, flexShrink: 0 }}
                />
                <label htmlFor="include-venv" style={{ cursor: 'pointer', userSelect: 'none', margin: 0 }}>
                  Показать файлы из папки venv
                </label>
              </div>
              <button
                className="btn-primary"
                onClick={handleSearch}
                disabled={isSearching || !searchPattern.trim()}
                style={{ width: '100%' }}
              >
                {isSearching ? 'Поиск...' : 'Найти'}
              </button>
              
              {searchResults.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ marginBottom: '0.5rem' }}>Найдено файлов: {searchResults.length}</h4>
                  <div style={{
                    maxHeight: '400px',
                    overflowY: 'auto',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '0.5rem'
                  }}>
                    {searchResults.map((filePath, index) => (
                      <div
                        key={index}
                        onClick={() => handleSearchResultClick(filePath)}
                        style={{
                          padding: '0.5rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid #eee',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f5f5f5'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                      >
                        {filePath}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        type={alertDialog.type}
        onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
      />
    </div>
  )
}

