import { type ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'ai_assisted'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  icon?: ReactNode
  className?: string
  type?: 'button' | 'submit' | 'reset'
  preventValidation?: boolean
}

export function Button({ 
  children, 
  onClick, 
  variant = 'default', 
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  className = '',
  type = 'button',
  preventValidation = false
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
  
  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    ai_assisted: 'bg-gradient-to-r from-[#0afecf] to-[#16bbd4] ai-glare'
  }
  
  const sizeClasses = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4',
    lg: 'h-11 px-8'
  }
  
  const handleMouseUp = preventValidation ? (e: React.MouseEvent) => {
    if (e.button === 0) {
      e.preventDefault()
      onClick?.()
    }
  } : undefined

  return (
    <button
      type={type}
      onClick={preventValidation ? undefined : onClick}
      onMouseUp={handleMouseUp}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading ? (
        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : icon ? (
        <span className="mr-2">{icon}</span>
      ) : null}
      {variant === 'ai_assisted' ? (
        <span className="bg-gradient-to-r from-[#1982a4] to-[#bd3cb9] bg-clip-text text-transparent relative z-10">
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  )
}