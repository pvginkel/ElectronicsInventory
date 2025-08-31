import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { SplitButton } from '@/components/ui/split-button';
import { TypeSelector } from '@/components/types/type-selector';
import { TagsInput } from './tags-input';
import { AIDocumentPreview } from './ai-document-preview';
import { transformAIPartAnalysisResult, transformToCreateSchema } from '@/lib/utils/ai-parts';
import type { components } from '@/lib/api/generated/types';

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];
type TransformedResult = ReturnType<typeof transformAIPartAnalysisResult>;

interface PartFormData {
  description: string;
  manufacturer: string;
  manufacturerCode: string;
  type: string;
  typeIsExisting: boolean;
  typeId?: number;
  tags: string[];
  documents: DocumentSuggestionSchema[];
  // Additional fields
  dimensions: string;
  voltageRating: string;
  mountingType: string;
  package: string;
  pinCount: string;
  series: string;
  productPageUrl: string;
  seller: string;
  sellerLink: string;
}

interface AIPartReviewStepProps {
  analysisResult: TransformedResult;
  onCreatePart: (data: ReturnType<typeof transformToCreateSchema>, createAnother: boolean) => void;
  onBack?: () => void;
  isCreating?: boolean;
}

export function AIPartReviewStep({ 
  analysisResult, 
  onCreatePart, 
  onBack,
  isCreating = false 
}: AIPartReviewStepProps) {
  const [formData, setFormData] = useState<PartFormData>(() => ({
    description: analysisResult.description || '',
    manufacturer: analysisResult.manufacturer || '',
    manufacturerCode: analysisResult.manufacturerCode || '',
    type: analysisResult.type || '',
    typeIsExisting: analysisResult.typeIsExisting || false,
    typeId: undefined,
    tags: analysisResult.tags || [],
    documents: analysisResult.documents || [],
    dimensions: analysisResult.dimensions || '',
    voltageRating: analysisResult.voltageRating || '',
    mountingType: analysisResult.mountingType || '',
    package: analysisResult.package || '',
    pinCount: analysisResult.pinCount?.toString() || '',
    series: analysisResult.series || '',
    productPageUrl: analysisResult.productPageUrl || '',
    seller: analysisResult.seller || '',
    sellerLink: analysisResult.sellerLink || '',
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = useCallback(<K extends keyof PartFormData>(
    field: K,
    value: PartFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  const removeDocument = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index)
    }));
  }, []);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (!formData.type.trim()) {
      newErrors.type = 'Type is required';
    }

    // Seller and seller link must be provided by user
    if (!formData.seller.trim()) {
      newErrors.seller = 'Seller must be provided';
    }

    if (!formData.sellerLink.trim()) {
      newErrors.sellerLink = 'Seller link must be provided';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleCreatePart = useCallback((createAnother: boolean) => {
    if (!validateForm() || isCreating) return;

    const createData = transformToCreateSchema({
      description: formData.description,
      manufacturer: formData.manufacturer,
      manufacturerCode: formData.manufacturerCode,
      typeId: formData.typeId,
      tags: formData.tags,
      documents: formData.documents,
      dimensions: formData.dimensions,
      voltageRating: formData.voltageRating,
      mountingType: formData.mountingType,
      package: formData.package,
      pinCount: formData.pinCount ? parseInt(formData.pinCount) : null,
      series: formData.series,
      productPageUrl: formData.productPageUrl,
      seller: formData.seller,
      sellerLink: formData.sellerLink,
    });

    onCreatePart(createData, createAnother);
  }, [formData, validateForm, isCreating, onCreatePart]);

  const handleTypeChange = useCallback((typeId: number | undefined) => {
    updateField('typeId', typeId);
    updateField('typeIsExisting', !!typeId);
  }, [updateField]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Review & Edit Part Details</h2>
        <p className="text-muted-foreground">
          Review the AI suggestions and make any necessary edits
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Part Information */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Part Information</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Enter part description"
                error={errors.description}
              />
              {errors.description && (
                <p className="text-sm text-destructive mt-1">{errors.description}</p>
              )}
            </div>

            <div>
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => updateField('manufacturer', e.target.value)}
                placeholder="Enter manufacturer name"
              />
            </div>

            <div>
              <Label htmlFor="manufacturerCode">Manufacturer Code</Label>
              <Input
                id="manufacturerCode"
                value={formData.manufacturerCode}
                onChange={(e) => updateField('manufacturerCode', e.target.value)}
                placeholder="Enter manufacturer part number"
              />
            </div>

            <div>
              <Label>Type *</Label>
              {formData.typeIsExisting ? (
                <TypeSelector
                  value={formData.typeId}
                  onChange={handleTypeChange}
                  error={errors.type}
                />
              ) : (
                <Input
                  value={formData.type}
                  onChange={(e) => updateField('type', e.target.value)}
                  placeholder="Enter part type"
                  error={errors.type}
                />
              )}
              {errors.type && (
                <p className="text-sm text-destructive mt-1">{errors.type}</p>
              )}
            </div>

            <div>
              <Label>Tags</Label>
              <TagsInput
                value={formData.tags}
                onChange={(tags) => updateField('tags', tags)}
                placeholder="Add tags (press Enter or comma)"
              />
            </div>
          </div>
        </Card>

        {/* Additional Specifications */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Specifications</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="dimensions">Dimensions</Label>
              <Input
                id="dimensions"
                value={formData.dimensions}
                onChange={(e) => updateField('dimensions', e.target.value)}
                placeholder="e.g., 10mm x 5mm x 3mm"
              />
            </div>

            <div>
              <Label htmlFor="voltageRating">Voltage Rating</Label>
              <Input
                id="voltageRating"
                value={formData.voltageRating}
                onChange={(e) => updateField('voltageRating', e.target.value)}
                placeholder="e.g., 5V, 3.3V-12V"
              />
            </div>

            <div>
              <Label htmlFor="mountingType">Mounting Type</Label>
              <Input
                id="mountingType"
                value={formData.mountingType}
                onChange={(e) => updateField('mountingType', e.target.value)}
                placeholder="e.g., SMD, THT, Panel Mount"
              />
            </div>

            <div>
              <Label htmlFor="package">Package</Label>
              <Input
                id="package"
                value={formData.package}
                onChange={(e) => updateField('package', e.target.value)}
                placeholder="e.g., SOIC-8, DIP-14, 0603"
              />
            </div>

            <div>
              <Label htmlFor="pinCount">Pin Count</Label>
              <Input
                id="pinCount"
                type="number"
                value={formData.pinCount}
                onChange={(e) => updateField('pinCount', e.target.value)}
                placeholder="Number of pins"
              />
            </div>

            <div>
              <Label htmlFor="series">Series</Label>
              <Input
                id="series"
                value={formData.series}
                onChange={(e) => updateField('series', e.target.value)}
                placeholder="Product series or family"
              />
            </div>
          </div>
        </Card>

        {/* Seller Information */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Seller Information</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="productPageUrl">Product Page URL</Label>
              <Input
                id="productPageUrl"
                type="url"
                value={formData.productPageUrl}
                onChange={(e) => updateField('productPageUrl', e.target.value)}
                placeholder="https://manufacturer.com/product"
              />
            </div>

            <div>
              <Label htmlFor="seller">Seller *</Label>
              <Input
                id="seller"
                value={formData.seller}
                onChange={(e) => updateField('seller', e.target.value)}
                placeholder="e.g., Mouser, DigiKey, Amazon"
                error={errors.seller}
              />
              {errors.seller && (
                <p className="text-sm text-destructive mt-1">{errors.seller}</p>
              )}
            </div>

            <div>
              <Label htmlFor="sellerLink">Seller Link *</Label>
              <Input
                id="sellerLink"
                type="url"
                value={formData.sellerLink}
                onChange={(e) => updateField('sellerLink', e.target.value)}
                placeholder="https://seller.com/product-page"
                error={errors.sellerLink}
              />
              {errors.sellerLink && (
                <p className="text-sm text-destructive mt-1">{errors.sellerLink}</p>
              )}
            </div>
          </div>
        </Card>

        {/* Documents */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            Documents ({formData.documents.length})
          </h3>
          {formData.documents.length > 0 ? (
            <div className="space-y-3">
              {formData.documents.map((document, index) => (
                <AIDocumentPreview
                  key={`${document.url}-${index}`}
                  document={document}
                  onDelete={() => removeDocument(index)}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No documents were found or suggested by AI analysis.
            </p>
          )}
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        {onBack && (
          <Button variant="outline" onClick={onBack} disabled={isCreating}>
            Back
          </Button>
        )}
        
        <div className="flex gap-3">
          <SplitButton
            primaryLabel={isCreating ? 'Creating...' : 'Add Part'}
            onPrimaryClick={() => handleCreatePart(false)}
            actions={[
              {
                label: 'Add & Create Another',
                onClick: () => handleCreatePart(true)
              }
            ]}
            disabled={isCreating}
          />
        </div>
      </div>
    </div>
  );
}