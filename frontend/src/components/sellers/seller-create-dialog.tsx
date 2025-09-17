import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormLabel } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormState } from '@/hooks/use-form-state'
import { useEffect } from 'react'

interface SellerCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (data: { name: string; website: string }) => void
  onCancel?: () => void
  initialName?: string
}

export function SellerCreateDialog({
  open,
  onOpenChange,
  onSuccess,
  onCancel,
  initialName = ''
}: SellerCreateDialogProps) {
  const form = useFormState({
    initialValues: {
      name: initialName,
      website: ''
    },
    validationRules: {
      name: (value: string) => {
        if (!value.trim()) return 'Name is required'
        if (value.length > 255) return 'Name must be 255 characters or less'
        return undefined
      },
      website: (value: string) => {
        if (!value.trim()) return 'Website is required'

        // Basic URL validation
        try {
          const url = new URL(value.trim())
          if (!['http:', 'https:'].includes(url.protocol)) {
            return 'Website must be a valid HTTP or HTTPS URL'
          }
        } catch {
          return 'Website must be a valid URL (e.g., https://example.com)'
        }

        return undefined
      }
    },
    onSubmit: async (values) => {
      onSuccess({
        name: values.name.trim(),
        website: values.website.trim()
      })
      handleClose()
    }
  })

  // Update form values when dialog opens with new initialName
  useEffect(() => {
    if (open && initialName) {
      form.setValue('name', initialName)
    }
  }, [open, initialName])

  const handleClose = () => {
    if (onCancel) {
      onCancel()
    } else {
      onOpenChange(false)
    }
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <Form onSubmit={form.handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Seller</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <FormField>
              <FormLabel htmlFor="name" required>
                Name
              </FormLabel>
              <Input
                id="name"
                maxLength={255}
                placeholder="Enter seller name (e.g., DigiKey, Mouser)"
                {...form.getFieldProps('name')}
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="website" required>
                Website
              </FormLabel>
              <Input
                id="website"
                type="url"
                placeholder="https://www.example.com"
                {...form.getFieldProps('website')}
              />
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
              Create Seller
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}