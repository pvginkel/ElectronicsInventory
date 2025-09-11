import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { TypeSelector } from '@/components/types/type-selector';
import { TypeCreateDialog } from '@/components/types/type-create-dialog';
import { TagsInput } from './tags-input';
import { MountingTypeSelector } from './mounting-type-selector';
import { AIDocumentGridWrapper } from './ai-document-grid-wrapper';
import { transformAIPartAnalysisResult, transformToCreateSchema } from '@/lib/utils/ai-parts';
import { useCreateType } from '@/hooks/use-types';
import type { components } from '@/lib/api/generated/types';
import { ExternalLinkIcon } from '@/components/icons/ExternalLinkIcon';
import { ClearButtonIcon } from '@/components/icons/clear-button-icon';

type DocumentSuggestionSchema = components['schemas']['AIPartCreateSchema.63ff6da.DocumentSuggestionSchema'];
type TransformedResult = ReturnType<typeof transformAIPartAnalysisResult>;

interface PartFormData {
  description: string;
  manufacturer: string;
  manufacturerCode: string;
  type: string;
  typeIsExisting: boolean;
  typeId?: number;
  suggestedTypeName?: string;
  tags: string[];
  documents: DocumentSuggestionSchema[];
  // Additional fields
  dimensions: string;
  voltageRating: string;
  mountingType: string;
  package: string;
  pinCount: string;
  pinPitch: string;
  series: string;
  inputVoltage: string;
  outputVoltage: string;
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
    typeId: analysisResult.typeIsExisting ? analysisResult.existingTypeId ?? undefined : undefined,
    suggestedTypeName: !analysisResult.typeIsExisting ? (analysisResult.type || undefined) : undefined,
    tags: analysisResult.tags || [],
    documents: analysisResult.documents || [],
    dimensions: analysisResult.dimensions || '',
    voltageRating: analysisResult.voltageRating || '',
    mountingType: analysisResult.mountingType || '',
    package: analysisResult.package || '',
    pinCount: analysisResult.pinCount?.toString() || '',
    pinPitch: analysisResult.pinPitch || '',
    series: analysisResult.series || '',
    inputVoltage: analysisResult.inputVoltage || '',
    outputVoltage: analysisResult.outputVoltage || '',
    productPageUrl: analysisResult.productPageUrl || '',
    seller: analysisResult.seller || '',
    sellerLink: analysisResult.sellerLink || '',
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  const createTypeMutation = useCreateType();

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
    
    if (formData.suggestedTypeName && !formData.typeId) {
      newErrors.type = 'Please create the suggested type or select an existing one';
    } else if (!formData.suggestedTypeName && !formData.typeId) {
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
      pinPitch: formData.pinPitch,
      series: formData.series,
      inputVoltage: formData.inputVoltage,
      outputVoltage: formData.outputVoltage,
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

  const handleCreateSuggestedType = useCallback(() => {
    if (formData.suggestedTypeName) {
      setShowCreateDialog(true);
    }
  }, [formData.suggestedTypeName]);

  const handleClearSuggestion = useCallback(() => {
    updateField('suggestedTypeName', undefined);
    updateField('typeId', undefined);
    updateField('typeIsExisting', false);
  }, [updateField]);

  const handleConfirmCreateType = useCallback(async (typeName: string) => {
    if (!typeName.trim()) return;
    
    try {
      const result = await createTypeMutation.mutateAsync({
        body: { name: typeName.trim() }
      });
      
      updateField('typeId', result.id);
      updateField('suggestedTypeName', undefined);
      updateField('typeIsExisting', true);
      setShowCreateDialog(false);
    } catch {
      // Error handling is automatic via the global error handling system
    }
  }, [updateField, createTypeMutation]);

  const handleCancelCreateType = useCallback(() => {
    setShowCreateDialog(false);
  }, []);

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
              {formData.suggestedTypeName ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <div className="flex-1">
                      <span className="text-sm text-muted-foreground">Suggested type:</span>
                      <div className="font-medium">{formData.suggestedTypeName}</div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCreateSuggestedType}
                      disabled={createTypeMutation.isPending}
                    >
                      Create
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSuggestion}
                      className="p-2"
                      aria-label="Remove suggestion"
                    >
                      <ClearButtonIcon className="h-4 w-4" />
                    </Button>
                  </div>
                  {errors.type && (
                    <p className="text-sm text-destructive">{errors.type}</p>
                  )}
                </div>
              ) : (
                <TypeSelector
                  value={formData.typeId}
                  onChange={handleTypeChange}
                  error={errors.type}
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
              <Label htmlFor="inputVoltage">Input Voltage</Label>
              <Input
                id="inputVoltage"
                value={formData.inputVoltage}
                onChange={(e) => updateField('inputVoltage', e.target.value)}
                placeholder="e.g., 5V, 12-24V"
                clearable
                onClear={() => updateField('inputVoltage', '')}
              />
            </div>

            <div>
              <Label htmlFor="outputVoltage">Output Voltage</Label>
              <Input
                id="outputVoltage"
                value={formData.outputVoltage}
                onChange={(e) => updateField('outputVoltage', e.target.value)}
                placeholder="e.g., 3.3V, 5V"
                clearable
                onClear={() => updateField('outputVoltage', '')}
              />
            </div>

            <div>
              <Label htmlFor="mountingType">Mounting Type</Label>
              <MountingTypeSelector
                value={formData.mountingType}
                onChange={(value) => updateField('mountingType', value || '')}
                placeholder="Select mounting type..."
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
              <Label htmlFor="pinPitch">Pin Pitch</Label>
              <Input
                id="pinPitch"
                value={formData.pinPitch}
                onChange={(e) => updateField('pinPitch', e.target.value)}
                placeholder="e.g., 0.1mm, 2.54mm"
                clearable
                onClear={() => updateField('pinPitch', '')}
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
                      <ExternalLinkIcon />
                    </button>
                  ) : null
                }
              />
            </div>

            <div>
              <Label htmlFor="seller">Seller</Label>
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
              <Label htmlFor="sellerLink">Seller Link</Label>
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
                      <ExternalLinkIcon />
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
          <AIDocumentGridWrapper
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
            <Button onClick={() => handleCreatePart(false)} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Add Part'}
            </Button>
          </div>
        </div>
      </div>

      {showCreateDialog && formData.suggestedTypeName && (
        <TypeCreateDialog
          initialName={formData.suggestedTypeName}
          onConfirm={handleConfirmCreateType}
          onCancel={handleCancelCreateType}
          isLoading={createTypeMutation.isPending}
          open={showCreateDialog}
        />
      )}
    </div>
  );
}