import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

type NativeButtonProps = React.ComponentPropsWithoutRef<"button">

interface ButtonProps extends NativeButtonProps {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'ai_assisted' | 'filter'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
  preventValidation?: boolean
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = 'default',
    size = 'md',
    loading = false,
    icon,
    className,
    onClick,
    onMouseUp,
    disabled,
    type = 'button',
    preventValidation = false,
    asChild = false,
    children,
    ...props
  }, ref) => {
    const Comp = asChild ? Slot : 'button'

    const baseClasses = variant === 'filter'
      ? 'inline-flex items-center justify-center rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
      : 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

    const variantClasses = {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      ai_assisted: 'bg-gradient-to-r from-[#0afecf] to-[#16bbd4] ai-glare',
      filter: 'border border-input bg-background text-foreground hover:opacity-80 aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary'
    }

    const sizeClasses = variant === 'filter' ? {
      sm: 'px-2.5 py-0.5 text-xs',
      md: 'px-3 py-1 text-sm',
      lg: 'px-4 py-1.5 text-base'
    } : {
      sm: 'h-8 px-2 text-sm',
      md: 'h-10 px-4',
      lg: 'h-11 px-8'
    }

    if (preventValidation && !onClick) {
      throw new Error('onClick must be provided when preventValidation is set')
    }

    const handleMouseUp: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      if (preventValidation && onClick && e.button === 0) {
        e.preventDefault()
        e.stopPropagation()
        onClick(e)
      }
      onMouseUp?.(e)
    }

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      if (preventValidation) {
        return
      }
      onClick?.(e)
    }

    const prefix = loading ? (
      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    ) : icon ? (
      <span className="mr-2">{icon}</span>
    ) : null

    return (
      <Comp
        ref={ref}
        {...props}
        type={type}
        onClick={handleClick}
        onMouseUp={handleMouseUp}
        disabled={disabled || loading}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
      >
        {!asChild ? prefix : null}
        {variant === 'ai_assisted' ? (
          <span className="bg-gradient-to-r from-[#1982a4] to-[#bd3cb9] bg-clip-text text-transparent relative z-10">
            {children}
          </span>
        ) : (
          children
        )}
      </Comp>
    )
  }
)

Button.displayName = 'Button'
