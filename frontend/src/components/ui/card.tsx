import * as React from 'react'
import { cn } from '@/lib/utils'

type NativeDivProps = React.ComponentPropsWithoutRef<"div">

interface CardProps extends NativeDivProps {
  variant?: 'default' | 'stats' | 'action' | 'content' | 'grid-tile' | 'grid-tile-disabled';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className, onClick, onKeyDown, children, ...props }, ref) => {
    const baseClasses = 'rounded-lg border bg-card text-card-foreground shadow-sm'

    const variantClasses = {
      default: 'p-6',
      stats: 'p-6 text-center',
      action: 'p-4 hover:bg-accent/50 cursor-pointer transition-colors',
      content: 'p-4',
      'grid-tile': 'p-4 overflow-hidden transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98] cursor-pointer',
      'grid-tile-disabled': 'p-4 overflow-hidden pointer-events-none'
    }

    const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
      onClick?.(e)
    }

    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
      // If there's a custom onKeyDown handler, call it first
      onKeyDown?.(e)

      // If onClick is provided and the key is Enter or Space, trigger the click
      if (onClick && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onClick(e as unknown as React.MouseEvent<HTMLDivElement>)
      }
    }

    return (
      <div
        ref={ref}
        {...props}
        className={cn(baseClasses, variantClasses[variant], className)}
        onClick={handleClick}
        onKeyDown={onClick ? handleKeyDown : onKeyDown}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

type CardHeaderProps = NativeDivProps

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        {...props}
        className={cn('flex flex-col space-y-1.5 pb-4', className)}
      >
        {children}
      </div>
    )
  }
)

CardHeader.displayName = 'CardHeader'

type NativeH3Props = React.ComponentPropsWithoutRef<"h3">

type CardTitleProps = NativeH3Props

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <h3
        ref={ref}
        {...props}
        className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      >
        {children}
      </h3>
    )
  }
)

CardTitle.displayName = 'CardTitle'

type CardContentProps = NativeDivProps

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        {...props}
        className={cn('', className)}
      >
        {children}
      </div>
    )
  }
)

CardContent.displayName = 'CardContent'

type CardFooterProps = NativeDivProps

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        {...props}
        className={cn('flex items-center pt-4', className)}
      >
        {children}
      </div>
    )
  }
)

CardFooter.displayName = 'CardFooter'

type NativePProps = React.ComponentPropsWithoutRef<"p">

type CardDescriptionProps = NativePProps

export const CardDescription = React.forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        {...props}
        className={cn('text-sm text-muted-foreground', className)}
      >
        {children}
      </p>
    )
  }
)

CardDescription.displayName = 'CardDescription'