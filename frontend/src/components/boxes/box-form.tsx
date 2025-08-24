import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormLabel, FormError } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormState } from '@/hooks/use-form-state'

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
}

export function BoxForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  initialValues, 
  title, 
  submitText 
}: BoxFormProps) {
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
      await onSubmit({
        description: values.description.trim(),
        capacity: parseInt(values.capacity, 10)
      })
      onOpenChange(false)
      form.reset()
    }
  })

  const handleClose = () => {
    onOpenChange(false)
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <Form onSubmit={form.handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <FormField>
              <FormLabel htmlFor="description" required>
                Description
              </FormLabel>
              <Input
                id="description"
                placeholder="e.g., Small Components Storage"
                maxLength={255}
                {...form.getFieldProps('description')}
              />
              <FormError message={form.errors.description} />
              <div className="text-xs text-muted-foreground">
                {form.values.description.length}/255 characters
              </div>
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
                placeholder="e.g., 60"
                {...form.getFieldProps('capacity')}
              />
              <FormError message={form.errors.capacity} />
              <div className="text-xs text-muted-foreground">
                Number of storage locations (1-50)
              </div>
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" preventValidation onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!form.isValid || form.isSubmitting}
              loading={form.isSubmitting}
            >
              {submitText}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}