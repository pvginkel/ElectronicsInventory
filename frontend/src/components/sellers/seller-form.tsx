import { useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, type DialogContentProps } from '@/components/ui/dialog'
import { Form, FormField, FormLabel } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormState } from '@/hooks/use-form-state'
import { useFormInstrumentation, type UseFormInstrumentationResult } from '@/hooks/use-form-instrumentation'
import { generateFormId } from '@/lib/test/form-instrumentation'

interface SellerFormData extends Record<string, string> {
  name: string
  website: string
}

interface SellerFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { name: string; website: string }) => Promise<void>
  initialValues?: {
    name: string
    website: string
  }
  title: string
  submitText: string
  formId?: string
}

export function SellerForm({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  title,
  submitText,
  formId
}: SellerFormProps) {
  const instrumentationRef = useRef<UseFormInstrumentationResult<{ name: string; website: string }> | null>(null)
  const form = useFormState<SellerFormData>({
    initialValues: {
      name: initialValues?.name || '',
      website: initialValues?.website || ''
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
        await onSubmit(payload)
        instrumentationRef.current?.trackSuccess(instrumentationFields)
        onOpenChange(false)
        form.reset()
      } catch {
        instrumentationRef.current?.trackError(instrumentationFields)
      }
    }
  })

  const resolvedFormId = formId ?? generateFormId('SellerForm', initialValues ? 'edit' : 'create')

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
