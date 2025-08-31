import { useState, useEffect } from 'react';
import { Form, FormField, FormLabel } from '@/components/ui/form';
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
  manufacturer: string;
  productPage: string;
  seller: string;
  sellerLink: string;
  dimensions: string;
  mountingType: string;
  package: string;
  pinCount: string;
  series: string;
  voltageRating: string;
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
    manufacturer: '',
    productPage: '',
    seller: '',
    sellerLink: '',
    dimensions: '',
    mountingType: '',
    package: '',
    pinCount: '',
    series: '',
    voltageRating: '',
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
        manufacturer: existingPart.manufacturer || '',
        productPage: existingPart.product_page || '',
        seller: existingPart.seller || '',
        sellerLink: existingPart.seller_link || '',
        dimensions: existingPart.dimensions || '',
        mountingType: existingPart.mounting_type || '',
        package: existingPart.package || '',
        pinCount: existingPart.pin_count?.toString() || '',
        series: existingPart.series || '',
        voltageRating: existingPart.voltage_rating || '',
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
      manufacturer: formData.manufacturer,
      productPage: formData.productPage,
      dimensions: formData.dimensions,
      mountingType: formData.mountingType,
      package: formData.package,
      pinCount: formData.pinCount ? parseInt(formData.pinCount, 10) : undefined,
      series: formData.series,
      voltageRating: formData.voltageRating,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
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
          manufacturer: formData.manufacturer || null,
          product_page: formData.productPage || null,
          seller: formData.seller || null,
          seller_link: formData.sellerLink || null,
          dimensions: formData.dimensions || null,
          mounting_type: formData.mountingType || null,
          package: formData.package || null,
          pin_count: formData.pinCount ? parseInt(formData.pinCount, 10) : null,
          series: formData.series || null,
          voltage_rating: formData.voltageRating || null,
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
          manufacturer: formData.manufacturer || null,
          product_page: formData.productPage || null,
          seller: formData.seller || null,
          seller_link: formData.sellerLink || null,
          dimensions: formData.dimensions || null,
          mounting_type: formData.mountingType || null,
          package: formData.package || null,
          pin_count: formData.pinCount ? parseInt(formData.pinCount, 10) : null,
          series: formData.series || null,
          voltage_rating: formData.voltageRating || null,
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
              <FormLabel htmlFor="mountingType">
                Mounting Type
              </FormLabel>
              <Input
                id="mountingType"
                value={formData.mountingType}
                onChange={(e) => updateFormData('mountingType', e.target.value)}
                error={errors.mountingType}
                maxLength={100}
                placeholder="e.g., Through-hole, Surface Mount"
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
              <FormLabel htmlFor="seller">
                Seller
              </FormLabel>
              <Input
                id="seller"
                value={formData.seller}
                onChange={(e) => updateFormData('seller', e.target.value)}
                error={errors.seller}
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