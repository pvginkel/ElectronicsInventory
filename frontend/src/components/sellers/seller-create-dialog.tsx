import { useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, type DialogContentProps } from '@/components/ui/dialog'
import { Form, FormField, FormLabel } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormState } from '@/hooks/use-form-state'
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation'
import { generateFormId } from '@/lib/test/form-instrumentation'

interface SellerCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (data: { name: string; website: string }) => void
  onCancel?: () => void
  initialName?: string
  formId?: string
}

export function SellerCreateDialog({
  open,
  onOpenChange,
  onSuccess,
  onCancel,
  initialName = '',
  formId
}: SellerCreateDialogProps) {
  const instrumentationRef = useRef<UseFormInstrumentationResult<{ name: string; website: string }> | null>(null)
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
      const payload = {
        name: values.name.trim(),
        website: values.website.trim()
      }
      const instrumentationFields = {
        name: payload.name,
        website: values.website
      }

      try {
        instrumentationRef.current?.trackSubmit(instrumentationFields)
        await onSuccess(payload)
        instrumentationRef.current?.trackSuccess(instrumentationFields)
        handleDialogOpenChange(false)
      } catch {
        instrumentationRef.current?.trackError(instrumentationFields)
      }
    }
  })

  const { setValue } = form

  // Update form values when dialog opens with new initialName
  useEffect(() => {
    if (open && initialName && form.values.name !== initialName) {
      setValue('name', initialName)
    }
  }, [form.values.name, initialName, open, setValue])

  const resolvedFormId = formId ?? generateFormId('SellerForm', 'inline-create')

  const instrumentation = useFormInstrumentation({
    formId: resolvedFormId,
    isOpen: open,
    snapshotFields: () => ({
      name: form.values.name,
      website: form.values.website
    })
  })

  // Update ref when instrumentation changes
  useEffect(() => {
    instrumentationRef.current = instrumentation
  }, [instrumentation])

  const handleDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      onCancel?.()
      form.reset()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      contentProps={{ 'data-testid': `${resolvedFormId}.dialog` } as DialogContentProps}
    >
      <DialogContent>
        <Form onSubmit={form.handleSubmit} data-testid={`${resolvedFormId}.form`}>
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
                data-testid={`${resolvedFormId}.field.name`}
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
                data-testid={`${resolvedFormId}.field.website`}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              preventValidation
              onClick={() => handleDialogOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!form.isValid || form.isSubmitting}
              loading={form.isSubmitting}
              data-testid={`${resolvedFormId}.submit`}
            >
              Create Seller
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
