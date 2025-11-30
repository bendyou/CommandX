import { useState, useRef, useEffect } from 'react'
import './AvatarCropper.css'

interface AvatarCropperProps {
  image: File
  onCrop: (croppedFile: File) => void
  onCancel: () => void
}

export default function AvatarCropper({ image, onCrop, onCancel }: AvatarCropperProps) {
  const [preview, setPreview] = useState<string>('')
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const CONTAINER_SIZE = 300

  useEffect(() => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        imageRef.current = img
        const dataUrl = e.target?.result as string
        setPreview(dataUrl)
        
        // Вычисляем начальный масштаб, чтобы изображение заполняло контейнер
        const imgAspect = img.width / img.height
        const containerAspect = 1 // квадрат
        
        let initialScale = 1
        if (imgAspect > containerAspect) {
          // Изображение шире - масштабируем по высоте, чтобы заполнить контейнер
          initialScale = CONTAINER_SIZE / img.height
        } else {
          // Изображение выше - масштабируем по ширине
          initialScale = CONTAINER_SIZE / img.width
        }
        
        // Увеличиваем масштаб, чтобы было что обрезать (минимум 1.2x)
        initialScale = Math.max(initialScale * 1.2, 1.2)
        
        setScale(initialScale)
        setImageLoaded(true)
        
        // Центрируем изображение
        const scaledWidth = img.width * initialScale
        const scaledHeight = img.height * initialScale
        setPosition({
          x: (CONTAINER_SIZE - scaledWidth) / 2,
          y: (CONTAINER_SIZE - scaledHeight) / 2
        })
      }
      img.onerror = () => {
        console.error('Ошибка загрузки изображения')
        alert('Ошибка загрузки изображения')
      }
      img.src = e.target?.result as string
    }
    reader.onerror = () => {
      console.error('Ошибка чтения файла')
      alert('Ошибка чтения файла')
    }
    reader.readAsDataURL(image)
  }, [image])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageLoaded) return
    e.preventDefault()
    setIsDragging(true)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setDragStart({
        x: e.clientX - position.x - rect.left,
        y: e.clientY - position.y - rect.top
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageLoaded) return
    
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const img = imageRef.current
    if (!img) return

    const newX = e.clientX - dragStart.x - rect.left
    const newY = e.clientY - dragStart.y - rect.top

    const scaledWidth = img.width * scale
    const scaledHeight = img.height * scale

    // Ограничиваем перемещение, чтобы изображение не выходило за границы
    const maxX = 0
    const minX = CONTAINER_SIZE - scaledWidth
    const maxY = 0
    const minY = CONTAINER_SIZE - scaledHeight

    setPosition({
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY))
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (!imageLoaded) return
    e.preventDefault()
    
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    const newScale = Math.max(0.5, Math.min(3, scale + delta))
    
    const img = imageRef.current
    if (!img) return

    // Масштабируем относительно центра контейнера
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      const centerX = CONTAINER_SIZE / 2
      const centerY = CONTAINER_SIZE / 2
      
      // Вычисляем позицию мыши относительно контейнера
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      // Вычисляем смещение от центра
      const offsetX = mouseX - centerX
      const offsetY = mouseY - centerY
      
      // Вычисляем новую позицию с учетом изменения масштаба
      const scaleRatio = newScale / scale
      const newX = centerX - (centerX - position.x - offsetX) * scaleRatio + offsetX * (1 - scaleRatio)
      const newY = centerY - (centerY - position.y - offsetY) * scaleRatio + offsetY * (1 - scaleRatio)
      
      const scaledWidth = img.width * newScale
      const scaledHeight = img.height * newScale
      
      // Ограничиваем позицию
      const maxX = 0
      const minX = CONTAINER_SIZE - scaledWidth
      const maxY = 0
      const minY = CONTAINER_SIZE - scaledHeight
      
      setScale(newScale)
      setPosition({
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(minY, Math.min(maxY, newY))
      })
    } else {
      setScale(newScale)
    }
  }

  const handleScaleChange = (newScale: number) => {
    if (!imageLoaded) return
    
    const img = imageRef.current
    if (!img) return

    // Масштабируем относительно центра
    const centerX = CONTAINER_SIZE / 2
    const centerY = CONTAINER_SIZE / 2
    
    const scaleRatio = newScale / scale
    const newX = centerX - (centerX - position.x) * scaleRatio
    const newY = centerY - (centerY - position.y) * scaleRatio
    
    const scaledWidth = img.width * newScale
    const scaledHeight = img.height * newScale
    
    // Ограничиваем позицию
    const maxX = 0
    const minX = CONTAINER_SIZE - scaledWidth
    const maxY = 0
    const minY = CONTAINER_SIZE - scaledHeight
    
    setScale(newScale)
    setPosition({
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY))
    })
  }

  const cropImage = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !imageLoaded) return

    const size = CONTAINER_SIZE
    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Создаем круглую маску
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()

    // Вычисляем видимую область в исходном изображении
    const scaledWidth = img.width * scale
    const scaledHeight = img.height * scale
    
    // Вычисляем координаты видимой области в исходном изображении
    const sourceX = -position.x / scale
    const sourceY = -position.y / scale
    const sourceSize = size / scale

    // Рисуем изображение
    ctx.drawImage(
      img,
      Math.max(0, sourceX),
      Math.max(0, sourceY),
      Math.min(sourceSize, img.width - Math.max(0, sourceX)),
      Math.min(sourceSize, img.height - Math.max(0, sourceY)),
      0,
      0,
      size,
      size
    )

    // Конвертируем в blob и создаем File
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], image.name.replace(/\.[^/.]+$/, '.png'), { type: 'image/png' })
        onCrop(file)
      }
    }, 'image/png', 0.95)
  }

  return (
    <div className="avatar-cropper-overlay">
      <div className="avatar-cropper-modal">
        <div className="avatar-cropper-header">
          <h3>Обрезка аватарки</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>
        
        <div className="avatar-cropper-content">
          <div 
            className="avatar-cropper-container"
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {preview && imageLoaded && imageRef.current && (
              <img
                src={preview}
                alt="Crop preview"
                className="avatar-cropper-image"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  width: `${imageRef.current.width}px`,
                  height: `${imageRef.current.height}px`,
                }}
                draggable={false}
              />
            )}
            {!imageLoaded && (
              <div className="avatar-cropper-loading">
                <div className="loading-spinner"></div>
                <p>Загрузка изображения...</p>
              </div>
            )}
            <div className="avatar-cropper-mask" />
          </div>
          
          <div className="avatar-cropper-controls">
            <div className="zoom-control">
              <label>Масштаб:</label>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={scale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                disabled={!imageLoaded}
              />
              <span>{Math.round(scale * 100)}%</span>
            </div>
            <p className="cropper-hint">
              Перетащите изображение для позиционирования • Колесико мыши для масштабирования
            </p>
          </div>
        </div>

        <div className="avatar-cropper-actions">
          <button className="cancel-btn" onClick={onCancel}>
            Отмена
          </button>
          <button 
            className="crop-btn" 
            onClick={cropImage}
            disabled={!imageLoaded}
          >
            Применить
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
