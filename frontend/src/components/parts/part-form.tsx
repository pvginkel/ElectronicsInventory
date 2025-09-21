import { useState, useEffect } from 'react';
import { Form, FormField, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TypeSelector } from '@/components/types/type-selector';
import { SellerSelector } from '@/components/sellers/seller-selector';
import { TagsInput } from './tags-input';
import { MountingTypeSelector } from './mounting-type-selector';
import { DuplicateDocumentGrid } from './duplicate-document-grid';
import { useGetPartsByPartKey, usePostParts, usePutPartsByPartKey, usePostPartsCopyAttachment } from '@/lib/api/generated/hooks';
import { useDuplicatePart } from '@/hooks/use-duplicate-part';
import { validatePartData } from '@/lib/utils/parts';
import { useToast } from '@/hooks/use-toast';
import type { ApiDocument } from '@/lib/utils/document-transformers';
import { isTestMode } from '@/lib/config/test-mode';
import { trackFormOpen, trackFormSubmit, trackFormSuccess, generateFormId } from '@/lib/test/form-instrumentation';

interface PartFormData {
  description: string;
  manufacturerCode: string;
  typeId?: number;
  tags: string[];
  manufacturer: string;
  productPage: string;
  sellerId?: number;
  sellerLink: string;
  dimensions: string;
  mountingType: string;
  package: string;
  pinCount: string;
  pinPitch: string;
  series: string;
  voltageRating: string;
  inputVoltage: string;
  outputVoltage: string;
}

interface PartFormProps {
  partId?: string;
  duplicateFromPartId?: string;
  onSuccess: (partId: string) => void;
  onCancel?: () => void;
}

export function PartForm({ partId, duplicateFromPartId, onSuccess, onCancel }: PartFormProps) {
  const formId = generateFormId('PartForm', partId ? 'edit' : duplicateFromPartId ? 'duplicate' : 'create');

  const [formData, setFormData] = useState<PartFormData>({
    description: '',
    manufacturerCode: '',
    tags: [],
    manufacturer: '',
    productPage: '',
    sellerId: undefined,
    sellerLink: '',
    dimensions: '',
    mountingType: '',
    package: '',
    pinCount: '',
    pinPitch: '',
    series: '',
    voltageRating: '',
    inputVoltage: '',
    outputVoltage: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateDocuments, setDuplicateDocuments] = useState<ApiDocument[]>([]);
  const [coverDocumentId, setCoverDocumentId] = useState<number | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [copyProgress, setCopyProgress] = useState({ completed: 0, total: 0 });

  const isEditing = Boolean(partId);
  const isDuplicating = Boolean(duplicateFromPartId);
  const { showError, showSuccess } = useToast();
  
  // Fetch existing part data if editing
  const { data: existingPart, isLoading: isLoadingPart } = useGetPartsByPartKey(
    { path: { part_key: partId! } },
    { enabled: isEditing }
  );

  const createPartMutation = usePostParts();
  const updatePartMutation = usePutPartsByPartKey();
  const copyAttachmentMutation = usePostPartsCopyAttachment();

  // Fetch duplicate part data if duplicating
  const { formData: duplicateFormData, documents: duplicateSourceDocuments, coverDocumentId: duplicateCoverDocumentId, isLoading: isDuplicateLoading } = useDuplicatePart(duplicateFromPartId);

  // Populate form with existing part data
  useEffect(() => {
    if (existingPart && isEditing) {
      setFormData({
        description: existingPart.description,
        manufacturerCode: existingPart.manufacturer_code || '',
        typeId: existingPart.type_id || undefined,
        tags: existingPart.tags || [],
        manufacturer: existingPart.manufacturer || '',
        productPage: existingPart.product_page || '',
        sellerId: existingPart.seller?.id || undefined,
        sellerLink: existingPart.seller_link || '',
        dimensions: existingPart.dimensions || '',
        mountingType: existingPart.mounting_type || '',
        package: existingPart.package || '',
        pinCount: existingPart.pin_count?.toString() || '',
        pinPitch: existingPart.pin_pitch || '',
        series: existingPart.series || '',
        voltageRating: existingPart.voltage_rating || '',
        inputVoltage: existingPart.input_voltage || '',
        outputVoltage: existingPart.output_voltage || '',
      });
    }
  }, [existingPart, isEditing]);

  // Populate form with duplicate part data
  useEffect(() => {
    if (duplicateFormData && isDuplicating) {
      setFormData({
        description: duplicateFormData.description,
        manufacturerCode: duplicateFormData.manufacturerCode,
        typeId: duplicateFormData.typeId,
        tags: duplicateFormData.tags,
        manufacturer: duplicateFormData.manufacturer,
        productPage: duplicateFormData.productPage,
        sellerId: duplicateFormData.sellerId,
        sellerLink: duplicateFormData.sellerLink,
        dimensions: duplicateFormData.dimensions,
        mountingType: duplicateFormData.mountingType,
        package: duplicateFormData.package,
        pinCount: duplicateFormData.pinCount,
        pinPitch: duplicateFormData.pinPitch,
        series: duplicateFormData.series,
        voltageRating: duplicateFormData.voltageRating,
        inputVoltage: duplicateFormData.inputVoltage,
        outputVoltage: duplicateFormData.outputVoltage,
      });

      // Set duplicate documents
      if (duplicateSourceDocuments) {
        setDuplicateDocuments(duplicateSourceDocuments);
      }
      if (duplicateCoverDocumentId) {
        setCoverDocumentId(duplicateCoverDocumentId);
      }
    }
  }, [duplicateFormData, duplicateSourceDocuments, duplicateCoverDocumentId, isDuplicating]);

  // Track form open on mount
  useEffect(() => {
    if (isTestMode()) {
      trackFormOpen(formId, { description: formData.description });
    }
  }, [formId]); // Only run on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    const validation = validatePartData({
      description: formData.description,
      manufacturerCode: formData.manufacturerCode,
      typeId: formData.typeId,
      tags: formData.tags,
      manufacturer: formData.manufacturer,
      productPage: formData.productPage,
      dimensions: formData.dimensions,
      mountingType: formData.mountingType,
      package: formData.package,
      pinCount: formData.pinCount ? parseInt(formData.pinCount, 10) : undefined,
      pinPitch: formData.pinPitch,
      series: formData.series,
      voltageRating: formData.voltageRating,
      inputVoltage: formData.inputVoltage,
      outputVoltage: formData.outputVoltage,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});

    // Track form submit
    if (isTestMode()) {
      trackFormSubmit(formId, { description: formData.description });
    }

    if (isEditing && partId) {
      // Update existing part
      const result = await updatePartMutation.mutateAsync({
        path: { part_key: partId },
        body: {
          description: formData.description,
          manufacturer_code: formData.manufacturerCode || null,
          type_id: formData.typeId || null,
          tags: formData.tags.length > 0 ? formData.tags : null,
          manufacturer: formData.manufacturer || null,
          product_page: formData.productPage || null,
          seller_id: formData.sellerId || null,
          seller_link: formData.sellerLink || null,
          dimensions: formData.dimensions || null,
          mounting_type: formData.mountingType || null,
          package: formData.package || null,
          pin_count: formData.pinCount ? parseInt(formData.pinCount, 10) : null,
          pin_pitch: formData.pinPitch || null,
          series: formData.series || null,
          voltage_rating: formData.voltageRating || null,
          input_voltage: formData.inputVoltage || null,
          output_voltage: formData.outputVoltage || null,
        }
      });

      // Track form success
      if (isTestMode()) {
        trackFormSuccess(formId, { description: formData.description });
      }

      onSuccess(result.key);
    } else {
      // Create new part
      const result = await createPartMutation.mutateAsync({
        body: {
          description: formData.description,
          manufacturer_code: formData.manufacturerCode || null,
          type_id: formData.typeId || null,
          tags: formData.tags.length > 0 ? formData.tags : null,
          manufacturer: formData.manufacturer || null,
          product_page: formData.productPage || null,
          seller_id: formData.sellerId || null,
          seller_link: formData.sellerLink || null,
          dimensions: formData.dimensions || null,
          mounting_type: formData.mountingType || null,
          package: formData.package || null,
          pin_count: formData.pinCount ? parseInt(formData.pinCount, 10) : null,
          pin_pitch: formData.pinPitch || null,
          series: formData.series || null,
          voltage_rating: formData.voltageRating || null,
          input_voltage: formData.inputVoltage || null,
          output_voltage: formData.outputVoltage || null,
        }
      });

      // If duplicating, copy documents
      if (isDuplicating && duplicateDocuments.length > 0) {
        setIsCopying(true);
        setCopyProgress({ completed: 0, total: duplicateDocuments.length });

        const failedDocs: string[] = [];
        
        try {
          for (let i = 0; i < duplicateDocuments.length; i++) {
            const doc = duplicateDocuments[i];
            const isThisCover = coverDocumentId === parseInt(doc.id);

            try {
              await copyAttachmentMutation.mutateAsync({
                body: {
                  attachment_id: parseInt(doc.id),
                  target_part_key: result.key,
                  set_as_cover: isThisCover
                }
              });
            } catch (error) {
              failedDocs.push(doc.name);
              console.error(`Failed to copy document ${doc.name}:`, error);
            }

            setCopyProgress(prev => ({ ...prev, completed: i + 1 }));
          }

          // Show results to user
          if (failedDocs.length > 0) {
            const failedCount = failedDocs.length;
            const successCount = duplicateDocuments.length - failedCount;
            
            if (successCount > 0) {
              showSuccess(`Part duplicated successfully! ${successCount} documents copied, ${failedCount} failed.`);
            }
            showError(`Failed to copy ${failedCount} document${failedCount > 1 ? 's' : ''}: ${failedDocs.join(', ')}`);
          } else {
            showSuccess(`Part and all ${duplicateDocuments.length} documents duplicated successfully!`);
          }
        } finally {
          setIsCopying(false);
        }
      }

      // Track form success
      if (isTestMode()) {
        trackFormSuccess(formId, { description: formData.description });
      }

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

  const handleDocumentsChange = (documents: ApiDocument[], newCoverDocumentId: number | null) => {
    setDuplicateDocuments(documents);
    setCoverDocumentId(newCoverDocumentId);
  };

  if (isEditing && isLoadingPart) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading part details...</div>
      </Card>
    );
  }

  if (isDuplicating && isDuplicateLoading) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading part to duplicate...</div>
      </Card>
    );
  }

  const isLoading = createPartMutation.isPending || updatePartMutation.isPending || isCopying;

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">
          {isEditing ? `Edit Part ${partId}` : isDuplicating ? `Duplicate Part from ${duplicateFromPartId}` : 'Add Part'}
        </h2>
      </div>

      <Form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <div className="pb-2 border-b">
            <h3 className="text-lg font-medium">Basic Information</h3>
            <p className="text-sm text-muted-foreground">Essential part details and classification</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField>
              <FormLabel htmlFor="description" required>
                Description
              </FormLabel>
              <Input
                id="description"
                data-testid="parts.form.description"
                value={formData.description}
                onChange={(e) => updateFormData('description', e.target.value)}
                error={errors.description}
                maxLength={200}
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="manufacturerCode">
                Manufacturer Code
              </FormLabel>
              <Input
                id="manufacturerCode"
                data-testid="parts.form.manufacturer"
                value={formData.manufacturerCode}
                onChange={(e) => updateFormData('manufacturerCode', e.target.value)}
                error={errors.manufacturerCode}
                maxLength={100}
              />
            </FormField>

            <FormField>
              <FormLabel>Type</FormLabel>
              <TypeSelector
                value={formData.typeId}
                onChange={(value) => updateFormData('typeId', value)}
                error={errors.typeId}
              />
            </FormField>

            <FormField>
              <FormLabel>Tags</FormLabel>
              <TagsInput
                value={formData.tags}
                onChange={(tags) => updateFormData('tags', tags)}
              />
            </FormField>
          </div>
        </div>

        {/* Physical Specifications */}
        <div className="space-y-4">
          <div className="pb-2 border-b">
            <h3 className="text-lg font-medium">Physical Specifications</h3>
            <p className="text-sm text-muted-foreground">Physical dimensions, packaging, and mounting details</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField>
              <FormLabel htmlFor="dimensions">
                Dimensions
              </FormLabel>
              <Input
                id="dimensions"
                value={formData.dimensions}
                onChange={(e) => updateFormData('dimensions', e.target.value)}
                error={errors.dimensions}
                maxLength={100}
                placeholder="e.g., 20x15x5mm"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="package">
                Package
              </FormLabel>
              <Input
                id="package"
                value={formData.package}
                onChange={(e) => updateFormData('package', e.target.value)}
                error={errors.package}
                maxLength={100}
                placeholder="e.g., DIP-8, SOIC-16"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="pinCount">
                Pin Count
              </FormLabel>
              <Input
                id="pinCount"
                type="number"
                min="1"
                max="9999"
                value={formData.pinCount}
                onChange={(e) => updateFormData('pinCount', e.target.value)}
                error={errors.pinCount}
                placeholder="Number of pins"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="pinPitch">
                Pin Pitch
              </FormLabel>
              <Input
                id="pinPitch"
                value={formData.pinPitch}
                onChange={(e) => updateFormData('pinPitch', e.target.value)}
                error={errors.pinPitch}
                maxLength={100}
                placeholder="e.g., 0.1mm, 2.54mm"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="mountingType">
                Mounting Type
              </FormLabel>
              <MountingTypeSelector
                value={formData.mountingType}
                onChange={(value) => updateFormData('mountingType', value || '')}
                error={errors.mountingType}
                placeholder="Select mounting type..."
              />
            </FormField>
          </div>
        </div>

        {/* Technical Specifications */}
        <div className="space-y-4">
          <div className="pb-2 border-b">
            <h3 className="text-lg font-medium">Technical Specifications</h3>
            <p className="text-sm text-muted-foreground">Electrical ratings and component series information</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField>
              <FormLabel htmlFor="voltageRating">
                Voltage Rating
              </FormLabel>
              <Input
                id="voltageRating"
                value={formData.voltageRating}
                onChange={(e) => updateFormData('voltageRating', e.target.value)}
                error={errors.voltageRating}
                maxLength={100}
                placeholder="e.g., 3.3V, 5V"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="inputVoltage">
                Input Voltage
              </FormLabel>
              <Input
                id="inputVoltage"
                value={formData.inputVoltage}
                onChange={(e) => updateFormData('inputVoltage', e.target.value)}
                error={errors.inputVoltage}
                maxLength={100}
                placeholder="e.g., 5V, 12-24V"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="outputVoltage">
                Output Voltage
              </FormLabel>
              <Input
                id="outputVoltage"
                value={formData.outputVoltage}
                onChange={(e) => updateFormData('outputVoltage', e.target.value)}
                error={errors.outputVoltage}
                maxLength={100}
                placeholder="e.g., 3.3V, 5V"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="series">
                Series
              </FormLabel>
              <Input
                id="series"
                value={formData.series}
                onChange={(e) => updateFormData('series', e.target.value)}
                error={errors.series}
                maxLength={100}
                placeholder="e.g., 74HC, LM"
              />
            </FormField>
          </div>
        </div>

        {/* Seller Information */}
        <div className="space-y-4">
          <div className="pb-2 border-b">
            <h3 className="text-lg font-medium">Seller Information</h3>
            <p className="text-sm text-muted-foreground">Manufacturer and vendor details</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField>
              <FormLabel htmlFor="manufacturer">
                Manufacturer
              </FormLabel>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => updateFormData('manufacturer', e.target.value)}
                error={errors.manufacturer}
                maxLength={255}
                placeholder="e.g., Texas Instruments, Arduino"
              />
            </FormField>

            <FormField>
              <FormLabel htmlFor="productPage">
                Product Page
              </FormLabel>
              <Input
                id="productPage"
                value={formData.productPage}
                onChange={(e) => updateFormData('productPage', e.target.value)}
                error={errors.productPage}
                maxLength={500}
                placeholder="e.g., https://www.ti.com/product/SN74HC595"
              />
            </FormField>

            <FormField>
              <FormLabel>
                Seller
              </FormLabel>
              <SellerSelector
                value={formData.sellerId}
                onChange={(value) => updateFormData('sellerId', value)}
                error={errors.sellerId}
              />
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
            </FormField>
          </div>
        </div>

        {/* Documents Section - only shown in duplication mode */}
        {isDuplicating && duplicateDocuments.length > 0 && (
          <div className="space-y-4">
            <div className="pb-2 border-b">
              <h3 className="text-lg font-medium">Documents</h3>
              <p className="text-sm text-muted-foreground">Documents from the original part that will be copied</p>
            </div>
            <DuplicateDocumentGrid
              documents={duplicateDocuments}
              coverDocumentId={coverDocumentId}
              partId={duplicateFromPartId!}
              onDocumentsChange={handleDocumentsChange}
            />
          </div>
        )}

        {/* Progress UI during document copying */}
        {isCopying && (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              Copying documents ({copyProgress.completed}/{copyProgress.total})...
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${(copyProgress.completed / copyProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

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
            data-testid="parts.form.submit"
          >
            {isCopying ? 'Copying Documents...' : isEditing ? 'Update Part' : isDuplicating ? 'Create Duplicate' : 'Add Part'}
          </Button>
        </div>
      </Form>
    </Card>
  );
}