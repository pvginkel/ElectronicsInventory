import { useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, type DialogContentProps } from '@/components/ui/dialog'
import { Form, FormField, FormLabel } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormState } from '@/hooks/use-form-state'
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation'
import { generateFormId } from '@/lib/test/form-instrumentation'

interface BoxFormData extends Record<string, string> {
  description: string
  capacity: string
}

interface BoxFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { description: string; capacity: number }) => Promise<void>
  initialValues?: {
    description: string
    capacity: number
  }
  title: string
  submitText: string
  formId?: string
}

export function BoxForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  initialValues, 
  title, 
  submitText,
  formId
}: BoxFormProps) {
  const instrumentationRef = useRef<UseFormInstrumentationResult<{ description: string; capacity: string }> | null>(null)
  const form = useFormState<BoxFormData>({
    initialValues: {
      description: initialValues?.description || '',
      capacity: initialValues?.capacity?.toString() || ''
    },
    validationRules: {
      description: (value: string) => {
        if (!value.trim()) return 'Description is required'
        if (value.length > 255) return 'Description must be 255 characters or less'
        return undefined
      },
      capacity: (value: string) => {
        if (!value.trim()) return 'Capacity is required'
        const num = parseInt(value, 10)
        if (isNaN(num)) return 'Capacity must be a valid number'
        if (num < 1) return 'Capacity must be at least 1'
        if (num > 50) return 'Capacity cannot exceed 50 locations'
        return undefined
      }
    },
    onSubmit: async (values) => {
      const payload = {
        description: values.description.trim(),
        capacity: parseInt(values.capacity, 10)
      }
      const instrumentationFields = {
        description: payload.description,
        capacity: values.capacity
      }

      try {
        instrumentationRef.current?.trackSubmit(instrumentationFields)
        await onSubmit(payload)
        instrumentationRef.current?.trackSuccess(instrumentationFields)
        onOpenChange(false)
        form.reset()
      } catch {
        instrumentationRef.current?.trackError(instrumentationFields)
      }
    }
  })

  const resolvedFormId = formId ?? generateFormId('BoxForm', initialValues ? 'edit' : 'create')

  const instrumentation = useFormInstrumentation({
    formId: resolvedFormId,
    isOpen: open,
    snapshotFields: () => ({
      description: form.values.description,
      capacity: form.values.capacity
    })
  })

  // Update ref when instrumentation changes
  useEffect(() => {
    instrumentationRef.current = instrumentation
  }, [instrumentation])

  const handleClose = () => {
    onOpenChange(false)
    form.reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      contentProps={{ 'data-testid': `${resolvedFormId}.dialog` } as DialogContentProps}
    >
      <DialogContent>
        <Form onSubmit={form.handleSubmit} data-testid={`${resolvedFormId}.form`}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField>
                <FormLabel htmlFor="description" required>
                  Description
                </FormLabel>
                <Input
                  id="description"
                  maxLength={255}
                  {...form.getFieldProps('description')}
                  data-testid={`${resolvedFormId}.field.description`}
                />
              </FormField>

              <FormField>
                <FormLabel htmlFor="capacity" required>
                  Capacity
                </FormLabel>
                <Input
                  id="capacity"
                  type="number"
                  min="1"
                  max="50"
                  {...form.getFieldProps('capacity')}
                  data-testid={`${resolvedFormId}.field.capacity`}
                />
              </FormField>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" preventValidation onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!form.isValid || form.isSubmitting}
              loading={form.isSubmitting}
              data-testid={`${resolvedFormId}.submit`}
            >
              {submitText}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
