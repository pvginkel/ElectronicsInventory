import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { SplitButton } from '@/components/ui/split-button';
import { TypeSelector } from '@/components/types/type-selector';
import { TagsInput } from './tags-input';
import { AIDocumentGrid } from './ai-document-grid';
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

  const setCoverDocument = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.map((doc, i) => ({
        ...doc,
        is_cover_image: i === index
      }))
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
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 text-center mb-6">
        <h2 className="text-2xl font-semibold mb-2">Review & Edit Part Details</h2>
        <p className="text-muted-foreground">
          Review the AI suggestions and make any necessary edits
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-4 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
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
                clearable
                onClear={() => updateField('description', '')}
              />
            </div>

            <div>
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => updateField('manufacturer', e.target.value)}
                placeholder="Enter manufacturer name"
                clearable
                onClear={() => updateField('manufacturer', '')}
              />
            </div>

            <div>
              <Label htmlFor="manufacturerCode">Manufacturer Code</Label>
              <Input
                id="manufacturerCode"
                value={formData.manufacturerCode}
                onChange={(e) => updateField('manufacturerCode', e.target.value)}
                placeholder="Enter manufacturer part number"
                clearable
                onClear={() => updateField('manufacturerCode', '')}
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
                  clearable
                  onClear={() => updateField('type', '')}
                />
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
                clearable
                onClear={() => updateField('dimensions', '')}
              />
            </div>

            <div>
              <Label htmlFor="voltageRating">Voltage Rating</Label>
              <Input
                id="voltageRating"
                value={formData.voltageRating}
                onChange={(e) => updateField('voltageRating', e.target.value)}
                placeholder="e.g., 5V, 3.3V-12V"
                clearable
                onClear={() => updateField('voltageRating', '')}
              />
            </div>

            <div>
              <Label htmlFor="mountingType">Mounting Type</Label>
              <Input
                id="mountingType"
                value={formData.mountingType}
                onChange={(e) => updateField('mountingType', e.target.value)}
                placeholder="e.g., SMD, THT, Panel Mount"
                clearable
                onClear={() => updateField('mountingType', '')}
              />
            </div>

            <div>
              <Label htmlFor="package">Package</Label>
              <Input
                id="package"
                value={formData.package}
                onChange={(e) => updateField('package', e.target.value)}
                placeholder="e.g., SOIC-8, DIP-14, 0603"
                clearable
                onClear={() => updateField('package', '')}
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
                clearable
                onClear={() => updateField('pinCount', '')}
              />
            </div>

            <div>
              <Label htmlFor="series">Series</Label>
              <Input
                id="series"
                value={formData.series}
                onChange={(e) => updateField('series', e.target.value)}
                placeholder="Product series or family"
                clearable
                onClear={() => updateField('series', '')}
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
                clearable
                onClear={() => updateField('productPageUrl', '')}
                action={
                  formData.productPageUrl ? (
                    <button
                      type="button"
                      onClick={() => window.open(formData.productPageUrl, '_blank')}
                      className="p-1 text-muted-foreground hover:text-foreground focus:outline-none"
                      aria-label="Open URL in new tab"
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
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <polyline points="15,3 21,3 21,9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </button>
                  ) : null
                }
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
                clearable
                onClear={() => updateField('seller', '')}
              />
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
                clearable
                onClear={() => updateField('sellerLink', '')}
                action={
                  formData.sellerLink ? (
                    <button
                      type="button"
                      onClick={() => window.open(formData.sellerLink, '_blank')}
                      className="p-1 text-muted-foreground hover:text-foreground focus:outline-none"
                      aria-label="Open URL in new tab"
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
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <polyline points="15,3 21,3 21,9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </button>
                  ) : null
                }
              />
            </div>
          </div>
        </Card>

        {/* Documents */}
        <Card className="p-6 xl:col-span-3">
          <h3 className="text-lg font-semibold mb-4">
            Documents ({formData.documents.length})
          </h3>
          <AIDocumentGrid
            documents={formData.documents}
            onDocumentDelete={removeDocument}
            onCoverChange={setCoverDocument}
            readOnly={false}
          />
        </Card>
        </div>
      </div>

      {/* Actions - Sticky Footer */}
      <div className="flex-shrink-0 mt-8 pt-6 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
    </div>
  );
}