import './AlertDialog.css'

interface AlertDialogProps {
  isOpen: boolean
  title: string
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
  onClose: () => void
  buttonText?: string
}

export default function AlertDialog({
  isOpen,
  title,
  message,
  type = 'info',
  onClose,
  buttonText = 'ОК'
}: AlertDialogProps) {
  if (!isOpen) return null

  return (
    <div className="alert-dialog-overlay" onClick={onClose}>
      <div className="alert-dialog" onClick={(e) => e.stopPropagation()}>
        <div className={`alert-dialog-icon ${type}`}>
          {type === 'success' && '✅'}
          {type === 'error' && '❌'}
          {type === 'warning' && '⚠️'}
          {type === 'info' && 'ℹ️'}
        </div>
        <h3 className="alert-dialog-title">{title}</h3>
        <p className="alert-dialog-message">{message}</p>
        <button
          className={`alert-dialog-btn ${type}`}
          onClick={onClose}
        >
          {buttonText}
        </button>
      </div>
    </div>
  )
}





