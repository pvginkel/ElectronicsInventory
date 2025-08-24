import { useState } from 'react'

type ValidationRules<T> = {
  [K in keyof T]?: (value: T[K]) => string | undefined
}

type FormErrors<T> = {
  [K in keyof T]?: string
}

export interface FormState<T> {
  values: T
  errors: FormErrors<T>
  touched: { [K in keyof T]?: boolean }
  isSubmitting: boolean
  isValid: boolean
}

interface UseFormStateOptions<T> {
  initialValues: T
  validationRules?: ValidationRules<T>
  onSubmit?: (values: T) => Promise<void> | void
}

export function useFormState<T extends Record<string, unknown>>({
  initialValues,
  validationRules = {},
  onSubmit
}: UseFormStateOptions<T>) {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<FormErrors<T>>({})
  const [touched, setTouched] = useState<{ [K in keyof T]?: boolean }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validateField = (name: keyof T, value: T[keyof T]): string | undefined => {
    const rule = validationRules[name]
    return rule ? rule(value) : undefined
  }

  const validateAll = (): FormErrors<T> => {
    const newErrors: FormErrors<T> = {}
    
    for (const name in validationRules) {
      const error = validateField(name, values[name])
      if (error) {
        newErrors[name] = error
      }
    }
    
    return newErrors
  }

  const setValue = (name: keyof T, value: T[keyof T]) => {
    setValues(prev => ({ ...prev, [name]: value }))
    
    // Validate field if it has been touched
    if (touched[name]) {
      const error = validateField(name, value)
      setErrors(prev => ({ ...prev, [name]: error }))
    }
  }

  const setFieldTouched = (name: keyof T, isTouched: boolean = true) => {
    setTouched(prev => ({ ...prev, [name]: isTouched }))
    
    if (isTouched) {
      const error = validateField(name, values[name])
      setErrors(prev => ({ ...prev, [name]: error }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Mark all fields as touched
    const allTouched = Object.keys(values).reduce((acc, key) => {
      acc[key as keyof T] = true
      return acc
    }, {} as { [K in keyof T]: boolean })
    
    setTouched(allTouched)
    
    // Validate all fields
    const newErrors = validateAll()
    setErrors(newErrors)
    
    // Check if form is valid
    const hasErrors = Object.values(newErrors).some(error => !!error)
    
    if (!hasErrors && onSubmit) {
      setIsSubmitting(true)
      try {
        await onSubmit(values)
      } catch (error) {
        // Handle submission errors if needed
        console.error('Form submission error:', error)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const reset = () => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
    setIsSubmitting(false)
  }

  const isValid = Object.values(errors).every(error => !error)

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    setValue,
    setFieldTouched,
    handleSubmit,
    reset,
    getFieldProps: (name: keyof T) => ({
      value: values[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setValue(name, e.target.value as T[keyof T])
      },
      onBlur: () => setFieldTouched(name),
      error: touched[name] ? errors[name] : undefined
    })
  }
}