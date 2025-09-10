import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'stats' | 'action' | 'content'
  onClick?: () => void
}

export function Card({ children, className = '', variant = 'default', onClick }: CardProps) {
  const baseClasses = 'rounded-lg border bg-card text-card-foreground shadow-sm'
  
  const variantClasses = {
    default: 'p-6',
    stats: 'p-6 text-center',
    action: 'p-4 hover:bg-accent/50 cursor-pointer transition-colors',
    content: 'p-4'
  }
  
  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: ReactNode
  className?: string
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex flex-col space-y-1.5 pb-4 ${className}`}>
      {children}
    </div>
  )
}

interface CardTitleProps {
  children: ReactNode
  className?: string
}

export function CardTitle({ children, className = '' }: CardTitleProps) {
  return (
    <h3 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h3>
  )
}

interface CardContentProps {
  children: ReactNode
  className?: string
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}