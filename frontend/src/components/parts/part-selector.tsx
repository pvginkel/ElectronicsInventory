import { useCallback, useEffect } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { usePartsSelector, type PartSelectorOption, type PartSelectorSummary } from '@/hooks/use-parts-selector';
import { cn } from '@/lib/utils';

interface PartSelectorProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  error?: string;
  className?: string;
  onSelectSummary?: (summary: PartSelectorSummary | undefined) => void;
  onPopoverWheelCapture?: (event: React.WheelEvent<HTMLDivElement>) => void;
}

export function PartSelector({
  value,
  onChange,
  placeholder = 'Search or select part...',
  error,
  className,
  onSelectSummary,
  onPopoverWheelCapture
}: PartSelectorProps) {
  const {
    options,
    searchTerm,
    onSearchChange,
    isLoading,
    isFetching,
    error: loadError,
    getSelectedSummary
  } = usePartsSelector();

  const selectedPart = getSelectedSummary(value);
  const showLoading = isLoading || isFetching;
  const hasLoadError = Boolean(loadError);

  useEffect(() => {
    onSelectSummary?.(selectedPart);
  }, [onSelectSummary, selectedPart]);

  const renderOption = useCallback((option: PartSelectorOption) => {
    const metaItems = [
      option.displayManufacturerCode && `MFR: ${option.displayManufacturerCode}`,
      option.manufacturer,
      option.typeName && `Type: ${option.typeName}`
    ].filter(Boolean);

    return (
      <div className="flex flex-col">
        <span className="font-medium">
          {option.displayDescription} ({option.id})
        </span>
        {metaItems.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {metaItems.join(' • ')}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {option.displayId}
        </span>
      </div>
    );
  }, []);

  return (
    <div className={cn('space-y-2', className)} data-testid="parts.selector">
      <SearchableSelect
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        error={error}
        options={options}
        isLoading={showLoading}
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        renderOption={renderOption}
        loadingText="Searching parts..."
        noResultsText="No parts found"
        onPopoverWheelCapture={onPopoverWheelCapture}
        data-testid="parts.selector.input"
        // Inline create intentionally disabled until part creation flows adopt the selector.
        enableInlineCreate={false}
      />

      {selectedPart && (
        <div className="text-sm text-muted-foreground" data-testid="parts.selector.selected">
          <div className="font-medium">
            {selectedPart.displayDescription} ({selectedPart.id})
          </div>
          <div>{selectedPart.displayId}</div>
          <div className="text-xs">
            {`Key: ${selectedPart.id}`}
            {selectedPart.displayManufacturerCode && ` • MFR: ${selectedPart.displayManufacturerCode}`}
            {selectedPart.typeName && ` • Type: ${selectedPart.typeName}`}
          </div>
        </div>
      )}

      {hasLoadError && (
        <div className="text-sm text-destructive" data-testid="parts.selector.error">
          Failed to load parts. Please try again.
        </div>
      )}
    </div>
  );
}
