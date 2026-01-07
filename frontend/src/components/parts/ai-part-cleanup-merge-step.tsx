import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ExternalLink } from '@/components/ui';
import { ArrowRight } from 'lucide-react';
import { TypeCreateDialog } from '@/components/types/type-create-dialog';
import { SellerCreateDialog } from '@/components/sellers/seller-create-dialog';
import { useCreateType } from '@/hooks/use-types';
import { useCreateSeller } from '@/hooks/use-sellers';
import type { CleanedPartData, CleanupFieldChange } from '@/types/ai-parts';
import type { components } from '@/lib/api/generated/types';
import { usePutPartsByPartKey } from '@/lib/api/generated/hooks';
import { normalizeFieldValue } from '@/lib/utils/ai-parts';
import { isTestMode } from '@/lib/config/test-mode';
import { emitTestEvent } from '@/lib/test/event-emitter';
import { emitComponentError } from '@/lib/test/error-instrumentation';
import { cn } from '@/lib/utils';

type PartResponse = components['schemas']['PartResponseSchema.1a46b79'];

interface AIPartCleanupMergeStepProps {
  currentPart: PartResponse;
  cleanedPart: CleanedPartData;
  onApplySuccess: () => void;
  onCancel: () => void;
}

// Fields that contain URLs
const URL_FIELDS = new Set(['productPage', 'sellerLink']);

// Helper to check if a string is a URL
const isUrl = (value: string | null): boolean => {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

// Field metadata for display
const FIELD_CONFIG: Record<string, { label: string; isArray?: boolean }> = {
  description: { label: 'Description' },
  manufacturerCode: { label: 'Manufacturer Code' },
  manufacturer: { label: 'Manufacturer' },
  dimensions: { label: 'Dimensions' },
  package: { label: 'Package' },
  pinCount: { label: 'Pin Count' },
  pinPitch: { label: 'Pin Pitch' },
  mountingType: { label: 'Mounting Type' },
  series: { label: 'Series' },
  voltageRating: { label: 'Voltage Rating' },
  inputVoltage: { label: 'Input Voltage' },
  outputVoltage: { label: 'Output Voltage' },
  productPage: { label: 'Product Page' },
  sellerLink: { label: 'Seller Link' },
  tags: { label: 'Tags', isArray: true },
  type: { label: 'Type' },
  seller: { label: 'Seller' },
};

export function AIPartCleanupMergeStep({
  currentPart,
  cleanedPart,
  onApplySuccess,
  onCancel
}: AIPartCleanupMergeStepProps) {
  const queryClient = useQueryClient();
  const [isApplying, setIsApplying] = useState(false);
  const [showCreateTypeDialog, setShowCreateTypeDialog] = useState(false);
  const [showCreateSellerDialog, setShowCreateSellerDialog] = useState(false);
  const [createdTypeId, setCreatedTypeId] = useState<number | null>(null);
  const [createdSellerId, setCreatedSellerId] = useState<number | null>(null);

  const createTypeMutation = useCreateType();
  const createSellerMutation = useCreateSeller();
  const updatePartMutation = usePutPartsByPartKey();

  // Guidepost: Compute field changes by comparing current and cleaned part data
  // Use normalizeFieldValue to prevent false positives from null/empty string differences
  const fieldChanges = useMemo(() => {
    const changes: CleanupFieldChange[] = [];

    // Helper to format values for display
    const formatValue = (value: string | number | null | undefined | string[]): string | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      if (Array.isArray(value)) {
        return value.length > 0 ? value.join(', ') : null;
      }
      return String(value);
    };

    // Compare each field
    const checkField = (
      fieldName: keyof typeof FIELD_CONFIG,
      oldVal: string | number | null | undefined | string[],
      newVal: string | number | null | undefined | string[]
    ) => {
      const config = FIELD_CONFIG[fieldName];
      if (!config) return;

      const normalizedOld = normalizeFieldValue(oldVal);
      const normalizedNew = normalizeFieldValue(newVal);

      // For arrays, compare contents
      if (Array.isArray(normalizedOld) && Array.isArray(normalizedNew)) {
        if (JSON.stringify(normalizedOld.sort()) !== JSON.stringify(normalizedNew.sort())) {
          changes.push({
            fieldName,
            fieldLabel: config.label,
            oldValue: formatValue(oldVal),
            newValue: formatValue(newVal),
            isChecked: true,
          });
        }
      } else if (normalizedOld !== normalizedNew) {
        changes.push({
          fieldName,
          fieldLabel: config.label,
          oldValue: formatValue(oldVal),
          newValue: formatValue(newVal),
          isChecked: true,
        });
      }
    };

    // Compare all fields
    checkField('description', currentPart.description, cleanedPart.description);
    checkField('manufacturerCode', currentPart.manufacturer_code, cleanedPart.manufacturerCode);
    checkField('manufacturer', currentPart.manufacturer, cleanedPart.manufacturer);
    checkField('dimensions', currentPart.dimensions, cleanedPart.dimensions);
    checkField('package', currentPart.package, cleanedPart.package);
    checkField('pinCount', currentPart.pin_count, cleanedPart.pinCount);
    checkField('pinPitch', currentPart.pin_pitch, cleanedPart.pinPitch);
    checkField('mountingType', currentPart.mounting_type, cleanedPart.mountingType);
    checkField('series', currentPart.series, cleanedPart.series);
    checkField('voltageRating', currentPart.voltage_rating, cleanedPart.voltageRating);
    checkField('inputVoltage', currentPart.input_voltage, cleanedPart.inputVoltage);
    checkField('outputVoltage', currentPart.output_voltage, cleanedPart.outputVoltage);
    checkField('productPage', currentPart.product_page, cleanedPart.productPage);
    checkField('sellerLink', currentPart.seller_link, cleanedPart.sellerLink);
    checkField('tags', currentPart.tags, cleanedPart.tags);

    // Type field (compare names, but we'll handle ID separately when applying)
    checkField('type', currentPart.type?.name, cleanedPart.type);

    // Seller field (compare names)
    checkField('seller', currentPart.seller?.name, cleanedPart.seller);

    return changes;
  }, [currentPart, cleanedPart]);

  const [checkedFields, setCheckedFields] = useState<Set<string>>(() => {
    return new Set(fieldChanges.map(c => c.fieldName));
  });

  // Guidepost: Sync checkedFields when fieldChanges updates to prevent state desync
  // This handles edge cases where currentPart or cleanedPart changes after mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional sync when fieldChanges updates
    setCheckedFields(new Set(fieldChanges.map(c => c.fieldName)));
  }, [fieldChanges]);

  const toggleField = useCallback((fieldName: string) => {
    setCheckedFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) {
        next.delete(fieldName);
      } else {
        next.add(fieldName);
      }
      return next;
    });
  }, []);

  // Guidepost: Compute header checkbox state based on individual checkboxes
  // Only consider fields that have checkboxes (exclude type/seller that need creation)
  const checkableFields = useMemo(() => {
    return fieldChanges.filter(change => {
      if (change.fieldName === 'type' && !cleanedPart.typeIsExisting && !createdTypeId) {
        return false;
      }
      if (change.fieldName === 'seller' && !cleanedPart.sellerIsExisting && !createdSellerId) {
        return false;
      }
      return true;
    });
  }, [fieldChanges, cleanedPart.typeIsExisting, cleanedPart.sellerIsExisting, createdTypeId, createdSellerId]);

  const headerCheckboxState = useMemo(() => {
    if (checkableFields.length === 0) return 'none';
    const checkedCount = checkableFields.filter(c => checkedFields.has(c.fieldName)).length;
    if (checkedCount === 0) return 'unchecked';
    if (checkedCount === checkableFields.length) return 'checked';
    return 'indeterminate';
  }, [checkableFields, checkedFields]);

  const handleHeaderCheckboxChange = useCallback(() => {
    if (headerCheckboxState === 'checked') {
      // Uncheck all
      setCheckedFields(new Set());
    } else {
      // Check all checkable fields
      setCheckedFields(new Set(checkableFields.map(c => c.fieldName)));
    }
  }, [headerCheckboxState, checkableFields]);

  // Ref for header checkbox to set indeterminate state
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = headerCheckboxState === 'indeterminate';
    }
  }, [headerCheckboxState]);

  // Handler for type creation
  const handleCreateType = useCallback(async (name: string) => {
    try {
      const newType = await createTypeMutation.mutateAsync({
        body: { name }
      });
      setCreatedTypeId(newType.id);
      setShowCreateTypeDialog(false);

      // Invalidate types list query to refresh UI
      await queryClient.invalidateQueries({ queryKey: ['types'] });
    } catch (error) {
      console.error('Failed to create type:', error);
      // Error handling is automatic via global error handler
    }
  }, [createTypeMutation, queryClient]);

  // Handler for seller creation
  const handleCreateSeller = useCallback(async (data: { name: string; website: string }) => {
    try {
      const newSeller = await createSellerMutation.mutateAsync({
        body: data
      });
      setCreatedSellerId(newSeller.id);
      setShowCreateSellerDialog(false);

      // Invalidate sellers list query to refresh UI
      await queryClient.invalidateQueries({ queryKey: ['sellers'] });
    } catch (error) {
      console.error('Failed to create seller:', error);
      // Error handling is automatic via global error handler
    }
  }, [createSellerMutation, queryClient]);

  const applyEnabled = checkedFields.size > 0 && !createTypeMutation.isPending && !createSellerMutation.isPending && !updatePartMutation.isPending;

  // Helper to render a value, making URLs clickable with external link icon
  const renderValue = (value: string | null, fieldName: string, className?: string) => {
    if (!value) {
      return <span className="text-muted-foreground italic">empty</span>;
    }

    // Check if this field should render as a link
    if (URL_FIELDS.has(fieldName) && isUrl(value)) {
      return (
        <ExternalLink
          href={value}
          className={cn('break-all', className)}
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </ExternalLink>
      );
    }

    return value;
  };

  const handleApplyChanges = useCallback(async () => {
    if (!applyEnabled || isApplying) {
      return;
    }

    try {
      setIsApplying(true);

      // Emit test event for form submission
      if (isTestMode()) {
        const event: Omit<import('@/types/test-events').FormTestEvent, 'timestamp'> = {
          kind: 'form',
          phase: 'submit',
          formId: 'ai-part-cleanup-apply',
          fields: { changesCount: checkedFields.size }
        };
        emitTestEvent(event);
      }

      // Guidepost: Build update payload starting with current values, then override with checked changes
      // The PUT endpoint requires all fields, so we preserve unchanged values from currentPart
      const body: components['schemas']['PartUpdateSchema.1a46b79'] = {
        description: currentPart.description,
        manufacturer_code: currentPart.manufacturer_code,
        manufacturer: currentPart.manufacturer,
        dimensions: currentPart.dimensions,
        package: currentPart.package,
        pin_count: currentPart.pin_count,
        pin_pitch: currentPart.pin_pitch,
        mounting_type: currentPart.mounting_type,
        series: currentPart.series,
        voltage_rating: currentPart.voltage_rating,
        input_voltage: currentPart.input_voltage,
        output_voltage: currentPart.output_voltage,
        product_page: currentPart.product_page,
        seller_link: currentPart.seller_link,
        tags: currentPart.tags,
        type_id: currentPart.type?.id ?? null,
        seller_id: currentPart.seller?.id ?? null,
      };

      // Override with checked changes
      for (const change of fieldChanges) {
        if (!checkedFields.has(change.fieldName)) {
          continue;
        }

        switch (change.fieldName) {
          case 'description':
            body.description = cleanedPart.description;
            break;
          case 'manufacturerCode':
            body.manufacturer_code = cleanedPart.manufacturerCode;
            break;
          case 'manufacturer':
            body.manufacturer = cleanedPart.manufacturer;
            break;
          case 'dimensions':
            body.dimensions = cleanedPart.dimensions;
            break;
          case 'package':
            body.package = cleanedPart.package;
            break;
          case 'pinCount':
            body.pin_count = cleanedPart.pinCount;
            break;
          case 'pinPitch':
            body.pin_pitch = cleanedPart.pinPitch;
            break;
          case 'mountingType':
            body.mounting_type = cleanedPart.mountingType;
            break;
          case 'series':
            body.series = cleanedPart.series;
            break;
          case 'voltageRating':
            body.voltage_rating = cleanedPart.voltageRating;
            break;
          case 'inputVoltage':
            body.input_voltage = cleanedPart.inputVoltage;
            break;
          case 'outputVoltage':
            body.output_voltage = cleanedPart.outputVoltage;
            break;
          case 'productPage':
            body.product_page = cleanedPart.productPage;
            break;
          case 'sellerLink':
            body.seller_link = cleanedPart.sellerLink;
            break;
          case 'tags':
            body.tags = cleanedPart.tags.length > 0 ? cleanedPart.tags : null;
            break;
          case 'type':
            // Use created type ID if available, otherwise use existing type ID
            if (createdTypeId) {
              body.type_id = createdTypeId;
            } else if (cleanedPart.typeIsExisting && cleanedPart.existingTypeId) {
              body.type_id = cleanedPart.existingTypeId;
            }
            break;
          case 'seller':
            // Use created seller ID if available, otherwise use existing seller ID
            if (createdSellerId) {
              body.seller_id = createdSellerId;
            } else if (cleanedPart.sellerIsExisting && cleanedPart.existingSellerId) {
              body.seller_id = cleanedPart.existingSellerId;
            }
            break;
        }
      }

      // Use the generated mutation hook to update the part
      await updatePartMutation.mutateAsync({
        path: { part_key: currentPart.key },
        body,
      });

      // Emit success event
      if (isTestMode()) {
        const event: Omit<import('@/types/test-events').FormTestEvent, 'timestamp'> = {
          kind: 'form',
          phase: 'success',
          formId: 'ai-part-cleanup-apply',
          fields: { partKey: currentPart.key }
        };
        emitTestEvent(event);
      }

      // Success - call callback
      onApplySuccess();

    } catch (error) {
      console.error('Failed to apply cleanup changes:', error);

      // Emit error instrumentation for test monitoring
      if (error instanceof Error) {
        emitComponentError(error, 'ai-part-cleanup-apply');
      } else {
        emitComponentError(new Error(String(error)), 'ai-part-cleanup-apply');
      }

      // Error handling is automatic via global error handler
      setIsApplying(false);
    }
  }, [applyEnabled, isApplying, checkedFields, fieldChanges, cleanedPart, currentPart, updatePartMutation, onApplySuccess, createdTypeId, createdSellerId]);

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0" data-testid="parts.cleanup.merge">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Review Suggested Changes</h2>
        <p className="text-muted-foreground">
          Select which improvements to apply to your part
        </p>
      </div>

      <Card className="p-4 flex-1 overflow-auto" data-testid="parts.cleanup.merge.card">
        <table className="w-full" data-testid="parts.cleanup.merge.table">
          <thead>
            <tr>
              <th className="text-left py-1.5 px-2 w-10">
                {checkableFields.length > 0 && (
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={headerCheckboxState === 'checked'}
                    onChange={handleHeaderCheckboxChange}
                    className="h-4 w-4 cursor-pointer"
                    data-testid="parts.cleanup.merge.header-checkbox"
                  />
                )}
              </th>
              <th className="text-left py-1.5 px-3 font-medium">Field</th>
              <th className="text-left py-1.5 px-3 font-medium">Current Value</th>
              <th className="text-center py-1.5 px-1 w-8"></th>
              <th className="text-left py-1.5 px-3 font-medium">New Value</th>
            </tr>
          </thead>
          <tbody>
            {fieldChanges.map((change) => {
              const isChecked = checkedFields.has(change.fieldName);
              const valueClassName = isChecked ? '' : 'text-muted-foreground';

              // Special handling for type field when not existing
              if (change.fieldName === 'type' && !cleanedPart.typeIsExisting && !createdTypeId) {
                return (
                  <tr
                    key={change.fieldName}
                    data-testid="parts.cleanup.merge.row"
                    data-field={change.fieldName}
                  >
                    <td className="py-1.5 px-2"></td>
                    <td className="py-1.5 px-3">{change.fieldLabel}</td>
                    <td className="py-1.5 px-3" data-value-type="old">
                      {renderValue(change.oldValue, change.fieldName)}
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      <ArrowRight className="h-3.5 w-3.5 inline text-muted-foreground" />
                    </td>
                    <td className="py-1.5 px-3" data-value-type="new">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{change.newValue}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowCreateTypeDialog(true)}
                          disabled={createTypeMutation.isPending}
                          className="h-7 text-xs"
                        >
                          Create Type
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              // Special handling for seller field when not existing
              if (change.fieldName === 'seller' && !cleanedPart.sellerIsExisting && !createdSellerId) {
                return (
                  <tr
                    key={change.fieldName}
                    data-testid="parts.cleanup.merge.row"
                    data-field={change.fieldName}
                  >
                    <td className="py-1.5 px-2"></td>
                    <td className="py-1.5 px-3">{change.fieldLabel}</td>
                    <td className="py-1.5 px-3" data-value-type="old">
                      {renderValue(change.oldValue, change.fieldName)}
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      <ArrowRight className="h-3.5 w-3.5 inline text-muted-foreground" />
                    </td>
                    <td className="py-1.5 px-3" data-value-type="new">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{change.newValue}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowCreateSellerDialog(true)}
                          disabled={createSellerMutation.isPending}
                          className="h-7 text-xs"
                        >
                          Create Seller
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const oldColorClass = isChecked ? 'text-destructive' : undefined;
              const newColorClass = isChecked ? 'text-green-700 dark:text-green-400' : undefined;

              return (
                <tr
                  key={change.fieldName}
                  data-testid="parts.cleanup.merge.row"
                  data-field={change.fieldName}
                >
                  <td className="py-1.5 px-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleField(change.fieldName)}
                      data-testid="parts.cleanup.merge.checkbox"
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="py-1.5 px-3">{change.fieldLabel}</td>
                  <td className={cn('py-1.5 px-3', valueClassName, oldColorClass)} data-value-type="old">
                    {renderValue(change.oldValue, change.fieldName, oldColorClass)}
                  </td>
                  <td className="py-1.5 px-1 text-center">
                    <ArrowRight className="h-3.5 w-3.5 inline text-muted-foreground" />
                  </td>
                  <td className={cn('py-1.5 px-3', valueClassName, newColorClass)} data-value-type="new">
                    {renderValue(change.newValue, change.fieldName, newColorClass)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={isApplying}>
          Cancel
        </Button>
        <Button
          onClick={handleApplyChanges}
          disabled={!applyEnabled || isApplying}
          data-testid="parts.cleanup.apply-button"
        >
          {isApplying ? 'Applying...' : `Apply Changes (${checkedFields.size})`}
        </Button>
      </div>

      {/* Type Creation Dialog */}
      {cleanedPart.type && (
        <TypeCreateDialog
          open={showCreateTypeDialog}
          onConfirm={handleCreateType}
          onCancel={() => setShowCreateTypeDialog(false)}
          initialName={cleanedPart.type}
          isLoading={createTypeMutation.isPending}
        />
      )}

      {/* Seller Creation Dialog */}
      {cleanedPart.seller && (
        <SellerCreateDialog
          open={showCreateSellerDialog}
          onOpenChange={(open) => {
            if (!open) setShowCreateSellerDialog(false);
          }}
          onSuccess={handleCreateSeller}
          onCancel={() => setShowCreateSellerDialog(false)}
          initialName={cleanedPart.seller}
        />
      )}
    </div>
  );
}
