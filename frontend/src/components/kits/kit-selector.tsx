import { useCallback, useMemo, useState } from 'react';
import { SearchableSelect } from '@/components/primitives/searchable-select';
import { useGetKits, type KitSummarySchemaList_a9993e3_KitSummarySchema } from '@/lib/api/generated/hooks';

interface KitOption extends Record<string, unknown> {
  id: string;
  name: string;
}

interface KitSelectorProps {
  value?: number;
  onChange: (value: number | undefined) => void;
  onTouched?: () => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * KitSelector — searchable dropdown for active kits.
 *
 * Loads all active kits from the API and filters client-side by name/id.
 * No inline-create: kit creation has a dedicated flow.
 */
export function KitSelector({
  value,
  onChange,
  onTouched,
  error,
  disabled,
  placeholder = 'Search kits...',
}: KitSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isFetching } = useGetKits({ query: { status: 'active' } });

  const options: KitOption[] = useMemo(() => {
    const kits = (data as KitSummarySchemaList_a9993e3_KitSummarySchema[] | undefined) ?? [];
    const lower = searchTerm.toLowerCase();
    return kits
      .filter(
        (kit) =>
          !lower ||
          kit.name.toLowerCase().includes(lower) ||
          String(kit.id).includes(lower),
      )
      .map((kit) => ({ id: String(kit.id), name: kit.name }));
  }, [data, searchTerm]);

  const handleChange = useCallback(
    (nextValue: string | undefined) => {
      if (!nextValue) {
        onChange(undefined);
        return;
      }
      const parsed = Number.parseInt(nextValue, 10);
      onChange(Number.isFinite(parsed) ? parsed : undefined);
    },
    [onChange],
  );

  return (
    <SearchableSelect
      value={value != null ? String(value) : undefined}
      onChange={handleChange}
      options={options}
      isLoading={isLoading || isFetching}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      placeholder={placeholder}
      error={error}
      loadingText="Loading kits..."
      noResultsText="No active kits found"
      disabled={disabled}
      onBlur={onTouched}
      enableInlineCreate={false}
    />
  );
}
