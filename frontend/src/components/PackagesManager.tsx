import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { serversApi } from '../api/servers'
import { paymentApi } from '../api/payment'
import ConfirmDialog from './ConfirmDialog'
import { sanitizeError } from '../utils/sanitizeError'
import './PackagesManager.css'

interface PackagesManagerProps {
  serverId: number
  serverType?: 'ssh' | 'allocated'
}

interface PackagePreset {
  id: string
  name: string
  description: string
  packages: string[]
  icon: string
}

const PACKAGE_PRESETS: PackagePreset[] = [
  {
    id: 'web',
    name: 'Веб-разработка',
    description: 'Flask, Django, FastAPI, requests, aiohttp',
    packages: ['flask', 'django', 'fastapi', 'requests', 'aiohttp', 'uvicorn', 'gunicorn'],
    icon: '🌐'
  },
  {
    id: 'data',
    name: 'Data Science',
    description: 'Pandas, NumPy, Matplotlib, Jupyter',
    packages: ['pandas', 'numpy', 'matplotlib', 'seaborn', 'jupyter', 'scipy', 'scikit-learn'],
    icon: '📊'
  },
  {
    id: 'ml',
    name: 'Machine Learning',
    description: 'TensorFlow, PyTorch, scikit-learn',
    packages: ['tensorflow', 'torch', 'scikit-learn', 'keras', 'xgboost', 'lightgbm'],
    icon: '🤖'
  },
  {
    id: 'devops',
    name: 'DevOps',
    description: 'Docker, Kubernetes, Ansible, Terraform',
    packages: ['docker', 'kubernetes', 'ansible', 'boto3', 'paramiko', 'fabric'],
    icon: '🔧'
  },
  {
    id: 'api',
    name: 'API & REST',
    description: 'REST клиенты и серверы',
    packages: ['requests', 'httpx', 'flask-restful', 'django-rest-framework', 'fastapi'],
    icon: '🔌'
  },
  {
    id: 'database',
    name: 'Базы данных',
    description: 'SQLAlchemy, psycopg2, pymongo',
    packages: ['sqlalchemy', 'psycopg2-binary', 'pymongo', 'redis', 'sqlite3'],
    icon: '💾'
  }
]

export default function PackagesManager({ serverId, serverType = 'ssh' }: PackagesManagerProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [customPackages, setCustomPackages] = useState('')
  const [installedPackages, setInstalledPackages] = useState<string[]>([])
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(false)
  const [requirementsStatus, setRequirementsStatus] = useState<{
    exists: boolean
    installing: boolean
    error: string | null
    installed: string[]
    failed: string[]
    allAlreadyInstalled: boolean
  }>({
    exists: false,
    installing: false,
    error: null,
    installed: [],
    failed: [],
    allAlreadyInstalled: false
  })
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    packageName: string | null
  }>({
    isOpen: false,
    packageName: null
  })

  const [venvPath, setVenvPath] = useState<string>('')

  // Функция для поиска venv в разных местах
  const findVenv = async (): Promise<string | null> => {
    if (serverType === 'allocated') {
      // Для allocated серверов ищем только в корне
      const checkCmd = paymentApi.allocatedServerExec(serverId, 'cd ~ && [ -d "venv" ] && echo "~" || echo "not_found"')
      try {
        const result = await checkCmd
        if (result.stdout.includes('~')) {
          return '~'
        }
      } catch (error) {
        console.error('Ошибка поиска venv:', error)
      }
      return null
    } else {
      // Для SSH серверов начинаем поиск с корневой директории /
      try {
        // Ищем venv начиная с корневой директории, но ограничиваем глубину поиска для производительности
        // Ищем в системных директориях и домашних директориях пользователей
        const findCmd = "find / -maxdepth 6 -type d -name 'venv' 2>/dev/null | grep -E '/(home|opt|usr/local|root|var)' | head -1"
        const result = await serversApi.exec(serverId, findCmd)
        
        if (result.stdout && result.stdout.trim()) {
          const foundPath = result.stdout.trim().split('\n')[0]
          if (foundPath) {
            // Возвращаем родительскую директорию venv
            const parentPath = foundPath.replace('/venv', '')
            if (parentPath) {
              return parentPath
            }
          }
        }
      } catch (error) {
        console.error('Ошибка поиска venv с корневой директории:', error)
        // Продолжаем поиск в других местах
      }
      
      // Если не нашли с корня, ищем в конкретных местах
      const searchPaths = [
        '~',                    // Домашняя директория
        '/opt',                 // Опциональная системная
        '/usr/local',           // Еще один вариант
        '/home',                // Другие домашние директории
      ]
      
      // Сначала проверяем домашнюю директорию
      try {
        const homeCheck = await serversApi.exec(serverId, 'cd ~ && [ -d "venv" ] && echo "~" || echo "not_found"')
        if (homeCheck.stdout && homeCheck.stdout.includes('~') && !homeCheck.stdout.includes('not_found')) {
          return '~'
        }
      } catch (error) {
        // Продолжаем поиск
      }
      
      // Ищем в других местах
      for (const basePath of searchPaths) {
        try {
          // Ищем venv в этой директории и поддиректориях
          const findCmd = `find ${basePath} -maxdepth 4 -type d -name "venv" 2>/dev/null | head -1`
          const result = await serversApi.exec(serverId, findCmd)
          
          if (result.stdout && result.stdout.trim()) {
            const foundPath = result.stdout.trim().split('\n')[0]
            if (foundPath) {
              // Возвращаем родительскую директорию venv
              const parentPath = foundPath.replace('/venv', '')
              return parentPath || '~'
            }
          }
        } catch (error) {
          // Продолжаем поиск
          continue
        }
      }
      
      // Если не нашли, возвращаем домашнюю директорию для создания
      return '~'
    }
  }

  const ensureVenv = async () => {
    // Ищем существующий venv
    const foundPath = await findVenv()
    
    if (foundPath) {
      setVenvPath(foundPath)
      // Проверяем, что venv действительно существует
      const checkCmd = serverType === 'allocated'
        ? paymentApi.allocatedServerExec(serverId, `cd ${foundPath} && [ -d "venv" ] && echo "exists" || echo "not_exists"`)
        : serversApi.exec(serverId, `cd ${foundPath} && [ -d "venv" ] && echo "exists" || echo "not_exists"`)
      
      try {
        const checkResult = await checkCmd
        if (checkResult.stdout.includes('exists')) {
          return // venv существует, ничего не делаем
        }
      } catch (error) {
        console.error('Ошибка проверки venv:', error)
      }
    }
    
    // Если не нашли или не существует, создаем в домашней директории
    const createPath = foundPath || '~'
    const createCmd = serverType === 'allocated'
      ? paymentApi.allocatedServerExec(serverId, `cd ${createPath} && python3 -m venv venv`)
      : serversApi.exec(serverId, `cd ${createPath} && python3 -m venv venv`)
    
    try {
      await createCmd
      setVenvPath(createPath)
    } catch (error) {
      console.error('Ошибка создания venv:', error)
      throw new Error('Не удалось создать виртуальное окружение')
    }
  }

  const ensurePipUpdated = async () => {
    // Используем найденный путь к venv или домашнюю директорию
    const venvBasePath = venvPath || '~'
    const venvPip = serverType === 'allocated' 
      ? './venv/bin/pip' 
      : venvBasePath === '~' 
        ? '~/venv/bin/pip' 
        : `${venvBasePath}/venv/bin/pip`
    const cdCommand = serverType === 'allocated' 
      ? '' 
      : venvBasePath === '~' 
        ? 'cd ~ && ' 
        : `cd ${venvBasePath} && `
    
    try {
      // Получаем текущую версию pip
      const versionCmd = `${cdCommand}${venvPip} --version`
      const versionResult = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, versionCmd)
        : await serversApi.exec(serverId, versionCmd)
      
      // Парсим версию (формат: pip 24.0 from ...)
      const versionMatch = versionResult.stdout.match(/pip (\d+)\.(\d+)/)
      if (versionMatch) {
        const major = parseInt(versionMatch[1])
        const minor = parseInt(versionMatch[2])
        
        // Обновляем, если версия старше 25.0 (или если есть уведомление о новой версии)
        // Проверяем, есть ли в выводе уведомление о новой версии
        const hasUpdateNotice = versionResult.stdout.includes('[notice] A new release of pip is available')
        
        if (major < 25 || (major === 25 && minor < 2) || hasUpdateNotice) {
          const updateCmd = `${cdCommand}${venvPip} install --upgrade pip --quiet`
          await (serverType === 'allocated'
            ? paymentApi.allocatedServerExec(serverId, updateCmd)
            : serversApi.exec(serverId, updateCmd))
        }
      } else {
        // Если не удалось распарсить версию, пытаемся обновить
        const updateCmd = `${cdCommand}${venvPip} install --upgrade pip --quiet`
        await (serverType === 'allocated'
          ? paymentApi.allocatedServerExec(serverId, updateCmd)
          : serversApi.exec(serverId, updateCmd))
      }
    } catch (error) {
      console.error('Ошибка проверки/обновления pip:', error)
      // Не прерываем установку, если не удалось обновить pip
    }
  }

  const installMutation = useMutation({
    mutationFn: async (packages: string[]) => {
      // Убеждаемся, что venv существует
      await ensureVenv()
      // Проверяем и обновляем pip, если нужно
      await ensurePipUpdated()
      
      const packagesStr = packages.join(' ')
      // Используем найденный путь к venv
      const venvBasePath = venvPath || '~'
      const venvPip = serverType === 'allocated' 
        ? './venv/bin/pip' 
        : venvBasePath === '~' 
          ? '~/venv/bin/pip' 
          : `${venvBasePath}/venv/bin/pip`
      const cdCommand = serverType === 'allocated' 
        ? '' 
        : venvBasePath === '~' 
          ? 'cd ~ && ' 
          : `cd ${venvBasePath} && `
      const command = `${cdCommand}${venvPip} install ${packagesStr}`
      
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerExec(serverId, command)
      }
      return serversApi.exec(serverId, command)
    },
    onSuccess: () => {
      setSelectedPreset(null)
      setCustomPackages('')
      loadInstalledPackages()
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: async (packageName: string) => {
      // Используем найденный путь к venv
      const venvBasePath = venvPath || '~'
      const venvPip = serverType === 'allocated' 
        ? './venv/bin/pip' 
        : venvBasePath === '~' 
          ? '~/venv/bin/pip' 
          : `${venvBasePath}/venv/bin/pip`
      const cdCommand = serverType === 'allocated' 
        ? '' 
        : venvBasePath === '~' 
          ? 'cd ~ && ' 
          : `cd ${venvBasePath} && `
      const command = `${cdCommand}${venvPip} uninstall -y ${packageName}`
      
      if (serverType === 'allocated') {
        return paymentApi.allocatedServerExec(serverId, command)
      }
      return serversApi.exec(serverId, command)
    },
    onSuccess: () => {
      loadInstalledPackages()
    },
  })

  const loadInstalledPackages = async () => {
    setIsLoadingInstalled(true)
    try {
      // Сначала находим venv, если еще не найден
      let venvBasePath = venvPath
      if (!venvBasePath) {
        const foundPath = await findVenv()
        if (foundPath) {
          setVenvPath(foundPath)
          venvBasePath = foundPath
        } else {
          venvBasePath = '~'
        }
      }
      
      const venvPip = serverType === 'allocated' 
        ? './venv/bin/pip' 
        : venvBasePath === '~' 
          ? '~/venv/bin/pip' 
          : `${venvBasePath}/venv/bin/pip`
      const cdCommand = serverType === 'allocated' 
        ? '' 
        : venvBasePath === '~' 
          ? 'cd ~ && ' 
          : `cd ${venvBasePath} && `
      const command = `${cdCommand}${venvPip} list --format=json`
      
      const result = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, command)
        : await serversApi.exec(serverId, command)
      
      if (result.stdout) {
        try {
          // Пытаемся распарсить JSON
          const jsonStr = result.stdout.trim()
          // Убираем возможные лишние строки до/после JSON
          const jsonMatch = jsonStr.match(/\[[\s\S]*\]/)
          const jsonToParse = jsonMatch ? jsonMatch[0] : jsonStr
          
          const packages = JSON.parse(jsonToParse)
          // Извлекаем имена пакетов, сортируем и убираем дубликаты
          const packageNames = packages
            .map((p: any) => (p.name || p.package || '').toLowerCase())
            .filter((name: string) => name && name.length > 0)
            .sort()
          
          // Убираем дубликаты
          const uniquePackages = Array.from(new Set(packageNames))
          setInstalledPackages(uniquePackages)
        } catch (jsonError) {
          // Если не JSON, парсим обычный вывод pip list
          const lines = result.stdout.split('\n').filter((line: string) => line.trim())
          
          // Пропускаем заголовок (первые 2 строки обычно содержат заголовок)
          const dataLines = lines.slice(2)
          const packages = dataLines
            .map((line: string) => {
              const parts = line.trim().split(/\s+/)
              return parts[0]?.toLowerCase()
            })
            .filter((name: string | undefined) => name && name.length > 0 && !name.includes('---'))
            .sort()
          
          // Убираем дубликаты
          const uniquePackages = Array.from(new Set(packages))
          setInstalledPackages(uniquePackages)
        }
      } else {
        setInstalledPackages([])
      }
    } catch (error) {
      console.error('Ошибка загрузки установленных пакетов:', error)
      setInstalledPackages([])
    } finally {
      setIsLoadingInstalled(false)
    }
  }

  const handlePresetInstall = (preset: PackagePreset) => {
    installMutation.mutate(preset.packages)
  }

  const handleCustomInstall = () => {
    const packages = customPackages
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0)
    
    if (packages.length > 0) {
      installMutation.mutate(packages)
    }
  }

  const handleUninstall = (packageName: string) => {
    setConfirmDialog({
      isOpen: true,
      packageName
    })
  }

  const confirmUninstall = () => {
    if (confirmDialog.packageName) {
      uninstallMutation.mutate(confirmDialog.packageName)
      setConfirmDialog({
        isOpen: false,
        packageName: null
      })
    }
  }

  const checkRequirementsFile = async () => {
    // Ищем requirements.txt во всех директориях сервера
    const command = serverType === 'allocated'
      ? 'find ~ -name "requirements.txt" -type f 2>/dev/null | head -1'
      : 'find ~ -name "requirements.txt" -type f 2>/dev/null | head -1'
    
    try {
      const result = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, command)
        : await serversApi.exec(serverId, command)
      
      const found = result.stdout.trim().length > 0 && result.stdout.includes('requirements.txt')
      
      setRequirementsStatus(prev => ({
        ...prev,
        exists: found
      }))
    } catch (error) {
      console.error('Ошибка проверки requirements.txt:', error)
      setRequirementsStatus(prev => ({
        ...prev,
        exists: false
      }))
    }
  }

  // Функция для парсинга пакетов из requirements.txt
  const parseRequirementsFile = (content: string): string[] => {
    const packages: string[] = []
    const lines = content.split('\n')
    
    for (const line of lines) {
      // Убираем пробелы в начале и конце
      const trimmed = line.trim()
      
      // Пропускаем пустые строки и комментарии
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      
      // Пропускаем строки с опциями (-r, -e, -- и т.д.)
      if (trimmed.startsWith('-')) {
        continue
      }
      
      // Пропускаем git репозитории и URL
      if (trimmed.startsWith('git+') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        continue
      }
      
      // Убираем комментарии в конце строки
      const withoutComment = trimmed.split('#')[0].trim()
      if (!withoutComment) {
        continue
      }
      
      // Парсим имя пакета (до ==, >=, <=, >, <, ~=, !=, @)
      // Имя пакета может содержать буквы, цифры, дефисы, подчеркивания и точки
      const packageMatch = withoutComment.match(/^([a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?)/)
      if (packageMatch) {
        const packageName = packageMatch[1].toLowerCase()
        // Нормализуем имя пакета (заменяем подчеркивания на дефисы, как делает pip)
        const normalizedName = packageName.replace(/_/g, '-')
        packages.push(normalizedName)
      }
    }
    
    return packages
  }

  // Функция для проверки, все ли пакеты уже установлены
  const checkAllPackagesInstalled = async (requirementsFilePath: string): Promise<boolean> => {
    try {
      // Читаем содержимое requirements.txt
      const readCommand = serverType === 'allocated'
        ? `cat "${requirementsFilePath}"`
        : `cat "${requirementsFilePath}"`
      
      const cdCommand = serverType === 'allocated' ? '' : 'cd ~ && '
      const fullReadCommand = `${cdCommand}${readCommand}`
      
      const readResult = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, fullReadCommand)
        : await serversApi.exec(serverId, fullReadCommand)
      
      if (!readResult.success || !readResult.stdout) {
        return false
      }
      
      // Парсим пакеты из requirements.txt
      const requiredPackages = parseRequirementsFile(readResult.stdout)
      
      if (requiredPackages.length === 0) {
        return false
      }
      
      // Получаем список установленных пакетов напрямую
      const venvPip = serverType === 'allocated' ? './venv/bin/pip' : '~/venv/bin/pip'
      const pipCommand = `${cdCommand}${venvPip} list --format=json`
      
      const pipResult = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, pipCommand)
        : await serversApi.exec(serverId, pipCommand)
      
      if (!pipResult.success || !pipResult.stdout) {
        return false
      }
      
      // Парсим список установленных пакетов
      let installedPackagesList: string[] = []
      try {
        const packages = JSON.parse(pipResult.stdout)
        installedPackagesList = packages.map((p: any) => {
          // Нормализуем имя пакета (заменяем подчеркивания на дефисы)
          return p.name.toLowerCase().replace(/_/g, '-')
        })
      } catch {
        // Если не JSON, парсим обычный вывод
        const lines = pipResult.stdout.split('\n').filter((line: string) => line.trim())
        installedPackagesList = lines.slice(2).map((line: string) => {
          const parts = line.split(/\s+/)
          const name = parts[0]?.toLowerCase()
          // Нормализуем имя пакета (заменяем подчеркивания на дефисы)
          return name ? name.replace(/_/g, '-') : null
        }).filter(Boolean) as string[]
      }
      
      // Проверяем, все ли требуемые пакеты установлены
      const allInstalled = requiredPackages.every(pkg => 
        installedPackagesList.includes(pkg)
      )
      
      return allInstalled
    } catch (error) {
      console.error('Ошибка при проверке установленных пакетов:', error)
      return false
    }
  }

  const installFromRequirements = async () => {
    setRequirementsStatus(prev => ({
      ...prev,
      installing: true,
      error: null,
      installed: [],
      failed: [],
      allAlreadyInstalled: false
    }))

    try {
      // Сначала находим путь к requirements.txt
      // Для allocated серверов используем find с выводом относительного пути
      const findCommand = serverType === 'allocated'
        ? 'cd ~ && find . -name "requirements.txt" -type f 2>/dev/null | head -1'
        : 'find ~ -name "requirements.txt" -type f 2>/dev/null | head -1'
      
      const findResult = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, findCommand)
        : await serversApi.exec(serverId, findCommand)
      
      let requirementsPath = findResult.stdout.trim()
      
      if (!requirementsPath) {
        setRequirementsStatus(prev => ({
          ...prev,
          installing: false,
          error: 'Файл requirements.txt не найден'
        }))
        return
      }
      
      // Нормализуем путь: убираем ./ в начале если есть
      if (requirementsPath.startsWith('./')) {
        requirementsPath = requirementsPath.substring(2)
      }
      
      // Убеждаемся, что venv существует в корневой директории (~)
      await ensureVenv()
      // Проверяем и обновляем pip, если нужно
      await ensurePipUpdated()
      
      // Получаем директорию с requirements.txt
      const lastSlashIndex = requirementsPath.lastIndexOf('/')
      const requirementsDir = lastSlashIndex > 0 
        ? requirementsPath.substring(0, lastSlashIndex)
        : ''
      const requirementsFileName = lastSlashIndex > 0
        ? requirementsPath.substring(lastSlashIndex + 1)
        : requirementsPath
      
      // Используем прямой путь к pip из venv
      // Для allocated серверов команда выполняется в cwd=server_root
      const venvPip = serverType === 'allocated' 
        ? './venv/bin/pip'
        : '~/venv/bin/pip'
      
      // Формируем путь к requirements.txt
      // Для allocated серверов используем относительный путь от server_root
      let requirementsFilePath = ''
      if (serverType === 'allocated') {
        // Для allocated серверов используем относительный путь
        // Если requirements.txt в корне, путь будет просто "requirements.txt"
        requirementsFilePath = requirementsDir 
          ? `${requirementsDir}/${requirementsFileName}`
          : requirementsFileName
      } else {
        // Для SSH серверов используем путь с ~
        requirementsFilePath = requirementsDir 
          ? `~/${requirementsDir}/${requirementsFileName}`
          : `~/${requirementsFileName}`
      }
      
      // Проверяем, все ли пакеты уже установлены
      const allInstalled = await checkAllPackagesInstalled(requirementsFilePath)
      
      if (allInstalled) {
        setRequirementsStatus(prev => ({
          ...prev,
          installing: false,
          error: null,
          installed: [],
          failed: [],
          allAlreadyInstalled: true
        }))
        return
      }
      
      // Выполняем установку из корневой директории
      // Для allocated серверов команда уже выполняется в server_root
      // Используем прямой путь к pip из venv и относительный путь к requirements.txt
      // Используем такую же простую команду, как для установки отдельных пакетов
      const cdCommand = serverType === 'allocated' ? '' : 'cd ~ && '
      const command = `${cdCommand}${venvPip} install -r "${requirementsFilePath}"`
      
      console.log('Executing command:', command) // Для отладки
      console.log('Requirements path:', requirementsPath) // Для отладки
      console.log('Requirements file path:', requirementsFilePath) // Для отладки
      
      const result = serverType === 'allocated'
        ? await paymentApi.allocatedServerExec(serverId, command, 300) // 5 минут таймаут
        : await serversApi.exec(serverId, command)
      
      console.log('Command result:', result) // Для отладки
      console.log('stdout:', result.stdout) // Для отладки
      console.log('stderr:', result.stderr) // Для отладки
      
      if (result.success) {
        // Парсим вывод для анализа успешных и неудачных установок
        const output = result.stdout + result.stderr
        const installed: string[] = []
        const failed: string[] = []
        
        // Проверяем, что установка действительно произошла
        if (output.includes('Successfully installed') || output.includes('Requirement already satisfied')) {
          // Ищем успешно установленные пакеты
          const successMatches = output.match(/Successfully installed (.+)/g)
          if (successMatches) {
            successMatches.forEach(match => {
              const packages = match.replace('Successfully installed ', '').split(/\s+/)
              installed.push(...packages)
            })
          }
          
          // Ищем ошибки
          const errorMatches = output.match(/ERROR: (.+)/g)
          if (errorMatches) {
            errorMatches.forEach(match => {
              const error = match.replace('ERROR: ', '')
              // Пытаемся извлечь имя пакета из ошибки
              const packageMatch = error.match(/Could not find a version that satisfies the requirement (.+?)[\s,]/)
              if (packageMatch) {
                failed.push(packageMatch[1])
              } else {
                failed.push(error)
              }
            })
          }
          
          setRequirementsStatus(prev => ({
            ...prev,
            installing: false,
            installed,
            failed,
            allAlreadyInstalled: false
          }))
          
          loadInstalledPackages()
        } else {
          // Если нет признаков успешной установки, показываем вывод (санитизированный)
          const sanitizedOutput = sanitizeError(output)
          setRequirementsStatus(prev => ({
            ...prev,
            installing: false,
            error: sanitizedOutput || 'Установка завершилась, но результат неясен.',
            installed,
            failed,
            allAlreadyInstalled: false
          }))
        }
      } else {
        // Анализируем ошибки
        const errorOutput = result.stderr || result.stdout
        const sanitizedError = sanitizeError(errorOutput)
        const failed: string[] = []
        
        // Проверяем, является ли ошибка связанной с pydantic-core и Python 3.14
        if (errorOutput.includes('pydantic-core') && errorOutput.includes('Failed building wheel')) {
          setRequirementsStatus(prev => ({
            ...prev,
            installing: false,
            error: `Ошибка: pydantic-core не может быть собран из исходников на Python 3.14.\n\nРешение:\n1. Обновите pydantic до версии >=2.12.0 в requirements.txt\n2. Или используйте Python 3.13 или ниже`,
            failed: ['pydantic-core']
          }))
          return
        }
        
        // Ищем пакеты, которые не удалось установить
        const packageErrors = errorOutput.match(/ERROR: Could not find a version that satisfies the requirement (.+?)[\s,]/g)
        if (packageErrors) {
          packageErrors.forEach(err => {
            const match = err.match(/requirement (.+?)[\s,]/)
            if (match) {
              failed.push(match[1])
            }
          })
        }
        
        setRequirementsStatus(prev => ({
          ...prev,
          installing: false,
          error: sanitizedError || 'Ошибка при установке пакетов из requirements.txt',
          failed,
          allAlreadyInstalled: false
        }))
      }
    } catch (error: any) {
      setRequirementsStatus(prev => ({
        ...prev,
        installing: false,
        error: error.message || 'Ошибка при установке пакетов',
        allAlreadyInstalled: false
      }))
    }
  }

  // Загружаем установленные пакеты при монтировании
  useEffect(() => {
    // Загружаем библиотеки при монтировании компонента
    const loadData = async () => {
      try {
        // Сначала находим venv
        const foundPath = await findVenv()
        if (foundPath) {
          setVenvPath(foundPath)
        }
        // Затем загружаем библиотеки
        await loadInstalledPackages()
        checkRequirementsFile()
      } catch (error) {
        console.error('Ошибка инициализации PackagesManager:', error)
      }
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, serverType])

  return (
    <div className="packages-manager">
      <div className="packages-header">
        <div>
          <h3>Управление библиотеками Python</h3>
          <p className="venv-info">
            🔒 Библиотеки устанавливаются в изолированное виртуальное окружение (venv).
            Это гарантирует, что ваши библиотеки не влияют на системные настройки сервера.
          </p>
        </div>
        <button 
          onClick={loadInstalledPackages} 
          className="btn-refresh"
          disabled={isLoadingInstalled}
        >
          {isLoadingInstalled ? 'Загрузка...' : '🔄 Обновить список'}
        </button>
      </div>

      <div className="packages-content">
        <div className="packages-section">
          <h4>📄 Установка из requirements.txt</h4>
          <div className="requirements-install">
            <p>
              {requirementsStatus.exists 
                ? 'Обнаружен файл requirements.txt. Вы можете установить все библиотеки из него.'
                : 'Файл requirements.txt не найден на сервере.'}
            </p>
            <button
              onClick={installFromRequirements}
              className="btn-install"
              disabled={requirementsStatus.installing || !requirementsStatus.exists}
            >
              {requirementsStatus.installing ? 'Установка...' : 'Установить из requirements.txt'}
            </button>
            
            {requirementsStatus.installed.length > 0 && (
              <div className="requirements-result success">
                <strong>Успешно установлено:</strong>
                <ul>
                  {requirementsStatus.installed.map((pkg, idx) => (
                    <li key={idx}>{pkg}</li>
                  ))}
                </ul>
                <div style={{ 
                  marginTop: '1rem',
                  padding: '0.75rem', 
                  background: 'rgba(255, 255, 255, 0.1)', 
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  color: 'rgba(255, 255, 255, 0.9)'
                }}>
                  <strong>ℹ️ Почему устанавливается больше библиотек, чем указано в requirements.txt?</strong>
                  <p style={{ margin: '0.5rem 0 0 0' }}>
                    Когда вы устанавливаете библиотеку (например, <code>python-telegram-bot</code>), pip автоматически устанавливает все её зависимости (библиотеки, которые нужны для работы этой библиотеки). 
                    Например, <code>python-telegram-bot</code> требует <code>httpx</code>, <code>certifi</code> и другие библиотеки. 
                    Это нормальное поведение - все зависимости устанавливаются автоматически для корректной работы вашей библиотеки.
                  </p>
                </div>
              </div>
            )}
            
            {requirementsStatus.failed.length > 0 && (
              <div className="requirements-result error">
                <strong>Не удалось установить:</strong>
                <ul>
                  {requirementsStatus.failed.map((pkg, idx) => (
                    <li key={idx}>{pkg}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {requirementsStatus.allAlreadyInstalled && (
              <div className="requirements-result success">
                <strong>✅ Все библиотеки из requirements.txt уже установлены!</strong>
                <p style={{ marginTop: '0.5rem', color: 'rgba(255, 255, 255, 0.9)' }}>
                  Все пакеты, указанные в requirements.txt, уже присутствуют в вашем виртуальном окружении.
                </p>
              </div>
            )}
            
            {requirementsStatus.error && (
              <div className="requirements-result error">
                <strong>Ошибка:</strong>
                <pre>{requirementsStatus.error}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="packages-section">
          <h4>📦 Готовые наборы библиотек</h4>
          <div className="presets-grid">
            {PACKAGE_PRESETS.map((preset) => (
              <div key={preset.id} className="preset-card">
                <div className="preset-icon">{preset.icon}</div>
                <h5>{preset.name}</h5>
                <p className="preset-description">{preset.description}</p>
                <div className="preset-packages">
                  {preset.packages.slice(0, 3).map((pkg, idx) => (
                    <span key={idx} className="package-tag">{pkg}</span>
                  ))}
                  {preset.packages.length > 3 && (
                    <span className="package-tag">+{preset.packages.length - 3}</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedPreset(preset.id)
                    handlePresetInstall(preset)
                  }}
                  className="btn-install"
                  disabled={installMutation.isPending}
                >
                  {installMutation.isPending && selectedPreset === preset.id
                    ? 'Установка...'
                    : 'Установить набор'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="packages-section">
          <h4>➕ Установка отдельных библиотек</h4>
          <div className="custom-install">
            <textarea
              value={customPackages}
              onChange={(e) => setCustomPackages(e.target.value)}
              placeholder="Введите названия библиотек через запятую (например: requests, numpy, pandas)"
              className="custom-packages-input"
              rows={3}
            />
            <button
              onClick={handleCustomInstall}
              className="btn-install"
              disabled={installMutation.isPending || !customPackages.trim()}
            >
              {installMutation.isPending ? 'Установка...' : 'Установить'}
            </button>
          </div>
        </div>

        <div className="packages-section">
          <h4>📋 Установленные библиотеки</h4>
          {isLoadingInstalled ? (
            <div className="loading">Загрузка списка пакетов...</div>
          ) : installedPackages.length === 0 ? (
            <div className="empty-state">Нет установленных пакетов</div>
          ) : (
            <div className="installed-packages">
              {installedPackages.map((pkg, idx) => (
                <div key={idx} className="installed-package-item">
                  <span className="package-name">{pkg}</span>
                  <button
                    onClick={() => handleUninstall(pkg)}
                    className="btn-uninstall"
                    disabled={uninstallMutation.isPending}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {installMutation.isError && (
        <div className="error-message">
          Ошибка установки: {sanitizeError((installMutation.error as any)?.message || 'Неизвестная ошибка')}
        </div>
      )}

      {installMutation.isSuccess && (
        <div className="success-message">
          Библиотеки успешно установлены!
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Удаление библиотеки"
        message={`Вы уверены, что хотите удалить библиотеку "${confirmDialog.packageName}"?`}
        confirmText="Удалить"
        cancelText="Отмена"
        type="danger"
        onConfirm={confirmUninstall}
        onCancel={() => setConfirmDialog({ isOpen: false, packageName: null })}
      />
    </div>
  )
}

