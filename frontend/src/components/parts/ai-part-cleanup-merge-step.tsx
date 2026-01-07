import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { TypeCreateDialog } from '@/components/types/type-create-dialog';
import { SellerCreateDialog } from '@/components/sellers/seller-create-dialog';
import { useCreateType } from '@/hooks/use-types';
import { useCreateSeller } from '@/hooks/use-sellers';
import type { CleanedPartData, CleanupFieldChange } from '@/types/ai-parts';
import type { components } from '@/lib/api/generated/types';
import { normalizeFieldValue, transformToUpdatePayload } from '@/lib/utils/ai-parts';
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

  const applyEnabled = checkedFields.size > 0 && !createTypeMutation.isPending && !createSellerMutation.isPending;

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

      // Build update payload from checked fields
      const updateData: Record<string, string | number | null | string[]> = {};

      for (const change of fieldChanges) {
        if (!checkedFields.has(change.fieldName)) {
          continue;
        }

        // Map field names to update payload
        switch (change.fieldName) {
          case 'description':
            updateData.description = cleanedPart.description;
            break;
          case 'manufacturerCode':
            updateData.manufacturerCode = cleanedPart.manufacturerCode;
            break;
          case 'manufacturer':
            updateData.manufacturer = cleanedPart.manufacturer;
            break;
          case 'dimensions':
            updateData.dimensions = cleanedPart.dimensions;
            break;
          case 'package':
            updateData.package = cleanedPart.package;
            break;
          case 'pinCount':
            updateData.pinCount = cleanedPart.pinCount;
            break;
          case 'pinPitch':
            updateData.pinPitch = cleanedPart.pinPitch;
            break;
          case 'mountingType':
            updateData.mountingType = cleanedPart.mountingType;
            break;
          case 'series':
            updateData.series = cleanedPart.series;
            break;
          case 'voltageRating':
            updateData.voltageRating = cleanedPart.voltageRating;
            break;
          case 'inputVoltage':
            updateData.inputVoltage = cleanedPart.inputVoltage;
            break;
          case 'outputVoltage':
            updateData.outputVoltage = cleanedPart.outputVoltage;
            break;
          case 'productPage':
            updateData.productPage = cleanedPart.productPage;
            break;
          case 'sellerLink':
            updateData.sellerLink = cleanedPart.sellerLink;
            break;
          case 'tags':
            updateData.tags = cleanedPart.tags;
            break;
          case 'type':
            // Use created type ID if available, otherwise use existing type ID
            if (createdTypeId) {
              updateData.typeId = createdTypeId;
            } else if (cleanedPart.typeIsExisting && cleanedPart.existingTypeId) {
              updateData.typeId = cleanedPart.existingTypeId;
            }
            break;
          case 'seller':
            // Use created seller ID if available, otherwise use existing seller ID
            if (createdSellerId) {
              updateData.sellerId = createdSellerId;
            } else if (cleanedPart.sellerIsExisting && cleanedPart.existingSellerId) {
              updateData.sellerId = cleanedPart.existingSellerId;
            }
            break;
        }
      }

      // Transform to snake_case PATCH payload
      const payload = transformToUpdatePayload(updateData);

      // PATCH to backend
      const response = await fetch(`/api/parts/${currentPart.key}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Update failed: ${errorData}`);
      }

      // Invalidate part query to refresh UI
      await queryClient.invalidateQueries({
        queryKey: ['parts', currentPart.key]
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
  }, [applyEnabled, isApplying, checkedFields, fieldChanges, cleanedPart, currentPart.key, queryClient, onApplySuccess, createdTypeId, createdSellerId]);

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0" data-testid="parts.cleanup.merge">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Review Suggested Changes</h2>
        <p className="text-muted-foreground">
          Select which improvements to apply to your part
        </p>
      </div>

      <Card className="p-6 flex-1 overflow-auto" data-testid="parts.cleanup.merge.card">
        <table className="w-full" data-testid="parts.cleanup.merge.table">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-2 w-12"></th>
              <th className="text-left py-2 px-4 font-medium">Field</th>
              <th className="text-left py-2 px-4 font-medium">Current Value</th>
              <th className="text-center py-2 px-2 w-12"></th>
              <th className="text-left py-2 px-4 font-medium">New Value</th>
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
                    className="border-b last:border-b-0"
                    data-testid="parts.cleanup.merge.row"
                    data-field={change.fieldName}
                  >
                    <td className="py-3 px-2"></td>
                    <td className="py-3 px-4 font-medium">{change.fieldLabel}</td>
                    <td className="py-3 px-4" data-value-type="old">
                      {change.oldValue || <span className="text-muted-foreground italic">empty</span>}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <ArrowRight className="h-4 w-4 inline" />
                    </td>
                    <td className="py-3 px-4" data-value-type="new">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{change.newValue}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowCreateTypeDialog(true)}
                          disabled={createTypeMutation.isPending}
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
                    className="border-b last:border-b-0"
                    data-testid="parts.cleanup.merge.row"
                    data-field={change.fieldName}
                  >
                    <td className="py-3 px-2"></td>
                    <td className="py-3 px-4 font-medium">{change.fieldLabel}</td>
                    <td className="py-3 px-4" data-value-type="old">
                      {change.oldValue || <span className="text-muted-foreground italic">empty</span>}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <ArrowRight className="h-4 w-4 inline" />
                    </td>
                    <td className="py-3 px-4" data-value-type="new">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{change.newValue}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowCreateSellerDialog(true)}
                          disabled={createSellerMutation.isPending}
                        >
                          Create Seller
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={change.fieldName}
                  className="border-b last:border-b-0"
                  data-testid="parts.cleanup.merge.row"
                  data-field={change.fieldName}
                >
                  <td className="py-3 px-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleField(change.fieldName)}
                      data-testid="parts.cleanup.merge.checkbox"
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-4 font-medium">{change.fieldLabel}</td>
                  <td className={cn('py-3 px-4', valueClassName, isChecked && 'text-destructive')} data-value-type="old">
                    {change.oldValue || <span className="text-muted-foreground italic">empty</span>}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <ArrowRight className="h-4 w-4 inline" />
                  </td>
                  <td className={cn('py-3 px-4', valueClassName, isChecked && 'text-green-600 dark:text-green-500')} data-value-type="new">
                    {change.newValue || <span className="text-muted-foreground italic">empty</span>}
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
