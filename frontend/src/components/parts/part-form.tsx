import { useState, useEffect } from 'react';
import { Form, FormField, FormLabel, FormError } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TypeSelector } from '@/components/types/type-selector';
import { TagsInput } from './tags-input';
import { useGetPartsByPartKey, usePostParts, usePutPartsByPartKey } from '@/lib/api/generated/hooks';
import { validatePartData } from '@/lib/utils/parts';

interface PartFormData {
  description: string;
  manufacturerCode: string;
  typeId?: number;
  tags: string[];
  seller: string;
  sellerLink: string;
}

interface PartFormProps {
  partId?: string;
  onSuccess: (partId: string) => void;
  onCancel?: () => void;
}

export function PartForm({ partId, onSuccess, onCancel }: PartFormProps) {
  const [formData, setFormData] = useState<PartFormData>({
    description: '',
    manufacturerCode: '',
    tags: [],
    seller: '',
    sellerLink: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = Boolean(partId);
  
  // Fetch existing part data if editing
  const { data: existingPart, isLoading: isLoadingPart } = useGetPartsByPartKey(
    { path: { part_key: partId! } },
    { enabled: isEditing }
  );

  const createPartMutation = usePostParts();
  const updatePartMutation = usePutPartsByPartKey();

  // Populate form with existing part data
  useEffect(() => {
    if (existingPart && isEditing) {
      setFormData({
        description: existingPart.description,
        manufacturerCode: existingPart.manufacturer_code || '',
        typeId: existingPart.type_id || undefined,
        tags: existingPart.tags || [],
        seller: existingPart.seller || '',
        sellerLink: existingPart.seller_link || '',
      });
    }
  }, [existingPart, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    const validation = validatePartData({
      description: formData.description,
      manufacturerCode: formData.manufacturerCode,
      typeId: formData.typeId,
      tags: formData.tags,
    });

    if (!validation.isValid) {
      const newErrors: Record<string, string> = {};
      validation.errors.forEach((error) => {
        if (error.includes('Description')) newErrors.description = error;
        if (error.includes('Manufacturer')) newErrors.manufacturerCode = error;
      });
      setErrors(newErrors);
      return;
    }

    setErrors({});

    if (isEditing && partId) {
      // Update existing part
      const result = await updatePartMutation.mutateAsync({
        path: { part_key: partId },
        body: {
          description: formData.description,
          manufacturer_code: formData.manufacturerCode || null,
          type_id: formData.typeId || null,
          tags: formData.tags.length > 0 ? formData.tags : null,
          seller: formData.seller || null,
          seller_link: formData.sellerLink || null,
        }
      });
      onSuccess(result.key);
    } else {
      // Create new part
      const result = await createPartMutation.mutateAsync({
        body: {
          description: formData.description,
          manufacturer_code: formData.manufacturerCode || null,
          type_id: formData.typeId || null,
          tags: formData.tags.length > 0 ? formData.tags : null,
          seller: formData.seller || null,
          seller_link: formData.sellerLink || null,
        }
      });
      onSuccess(result.key);
    }
  };

  const updateFormData = (field: keyof PartFormData, value: string | number | string[] | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  if (isEditing && isLoadingPart) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading part details...</div>
      </Card>
    );
  }

  const isLoading = createPartMutation.isPending || updatePartMutation.isPending;

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">
          {isEditing ? `Edit Part ${partId}` : 'Add Part'}
        </h2>
      </div>

      <Form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField>
            <FormLabel htmlFor="description" required>
              Description
            </FormLabel>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => updateFormData('description', e.target.value)}
              error={errors.description}
              maxLength={200}
            />
            <FormError message={errors.description} />
          </FormField>

          <FormField>
            <FormLabel htmlFor="manufacturerCode">
              Manufacturer Code
            </FormLabel>
            <Input
              id="manufacturerCode"
              value={formData.manufacturerCode}
              onChange={(e) => updateFormData('manufacturerCode', e.target.value)}
              error={errors.manufacturerCode}
              maxLength={100}
            />
            <FormError message={errors.manufacturerCode} />
          </FormField>

          <FormField>
            <FormLabel>Type</FormLabel>
            <TypeSelector
              value={formData.typeId}
              onChange={(value) => updateFormData('typeId', value)}
              error={errors.typeId}
            />
            <FormError message={errors.typeId} />
          </FormField>

          <FormField>
            <FormLabel>Tags</FormLabel>
            <TagsInput
              value={formData.tags}
              onChange={(tags) => updateFormData('tags', tags)}
            />
          </FormField>

          <FormField>
            <FormLabel htmlFor="seller">
              Seller
            </FormLabel>
            <Input
              id="seller"
              value={formData.seller}
              onChange={(e) => updateFormData('seller', e.target.value)}
              error={errors.seller}
            />
            <FormError message={errors.seller} />
          </FormField>

          <FormField>
            <FormLabel htmlFor="sellerLink">
              Seller Link
            </FormLabel>
            <Input
              id="sellerLink"
              value={formData.sellerLink}
              onChange={(e) => updateFormData('sellerLink', e.target.value)}
              error={errors.sellerLink}
            />
            <FormError message={errors.sellerLink} />
          </FormField>
        </div>


        <div className="flex justify-end gap-3 pt-4">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={isLoading}
            loading={isLoading}
          >
            {isEditing ? 'Update Part' : 'Add Part'}
          </Button>
        </div>
      </Form>
    </Card>
  );
}