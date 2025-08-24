import { type ReactNode } from 'react'

interface FormProps {
  onSubmit: (e: React.FormEvent) => void
  children: ReactNode
  className?: string
}

export function Form({ onSubmit, children, className = '' }: FormProps) {
  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
    </form>
  )
}

interface FormFieldProps {
  children: ReactNode
  className?: string
}

export function FormField({ children, className = '' }: FormFieldProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {children}
    </div>
  )
}

interface FormLabelProps {
  children: ReactNode
  htmlFor?: string
  required?: boolean
  className?: string
}

export function FormLabel({ children, htmlFor, required, className = '' }: FormLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}
    >
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  )
}

interface FormErrorProps {
  message?: string
  className?: string
}

export function FormError({ message, className = '' }: FormErrorProps) {
  if (!message) return null

  return (
    <p className={`text-sm text-red-500 ${className}`}>
      {message}
    </p>
  )
}

interface FormDescriptionProps {
  children: ReactNode
  className?: string
}

export function FormDescription({ children, className = '' }: FormDescriptionProps) {
  return (
    <p className={`text-sm text-muted-foreground ${className}`}>
      {children}
    </p>
  )
}