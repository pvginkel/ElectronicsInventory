import { type ReactNode, forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
  error?: string
  action?: ReactNode
  clearable?: boolean
  onClear?: () => void
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, error, action, clearable, onClear, className = '', value, ...props }, ref) => {
    const baseClasses = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
    
    const errorClasses = error ? 'border-destructive' : ''
    const hasRightContent = action || (clearable && value)
    const paddingRightClass = hasRightContent ? 'pr-10' : ''
    const paddingLeftClass = icon ? 'pl-10' : ''
    
    const handleClear = () => {
      if (onClear) {
        onClear()
      }
    }
    
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        
        <input
          ref={ref}
          value={value}
          className={`${baseClasses} ${errorClasses} ${paddingLeftClass} ${paddingRightClass} ${className}`}
          {...props}
        />
        
        {hasRightContent && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {clearable && value && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-muted-foreground hover:text-foreground focus:outline-none"
                aria-label="Clear"
              >
                <svg 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            {action}
          </div>
        )}
        
        {error && (
          <p className="mt-1 text-sm text-destructive">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'