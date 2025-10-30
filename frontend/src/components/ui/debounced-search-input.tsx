import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Input } from '@/components/ui/input';
import { ClearButtonIcon } from '@/components/icons/clear-button-icon';
import { useDebouncedValue } from '@/lib/utils/debounce';

interface DebouncedSearchInputProps {
  // Current search term from URL (controlled by route)
  searchTerm: string;

  // Route path for navigation (e.g., '/parts', '/kits')
  routePath: string;

  // Placeholder text for the input
  placeholder?: string;

  // Test ID prefix for instrumentation
  testIdPrefix: string;

  // Optional: additional search params to preserve during navigation
  // Example: kits needs to preserve 'status' param
  preserveSearchParams?: (currentSearch: Record<string, unknown>) => Record<string, unknown>;
}

export function DebouncedSearchInput({
  searchTerm,
  routePath,
  placeholder = 'Search...',
  testIdPrefix,
  preserveSearchParams,
}: DebouncedSearchInputProps) {
  // Local state for immediate UI feedback
  const [searchInput, setSearchInput] = useState(searchTerm);

  // Debounced value that triggers URL navigation (300ms fixed delay)
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const navigate = useNavigate();
  const currentSearch = useSearch({ strict: false });

  // Sync URL searchTerm → local searchInput (for browser back/forward)
  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  // Sync debouncedSearch → URL navigation
  useEffect(() => {
    // Guard against redundant navigation
    if (debouncedSearch === searchTerm) {
      return;
    }

    const baseSearch = preserveSearchParams
      ? preserveSearchParams(currentSearch as Record<string, unknown>)
      : {};

    navigate({
      to: routePath,
      search: debouncedSearch
        ? { ...baseSearch, search: debouncedSearch }
        : baseSearch,
      replace: true,
    });
  }, [debouncedSearch, searchTerm, routePath, navigate, preserveSearchParams, currentSearch]);

  const handleSearchInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value);
  }, []);

  const handleClear = useCallback(() => {
    // Update local state immediately
    setSearchInput('');

    const baseSearch = preserveSearchParams
      ? preserveSearchParams(currentSearch as Record<string, unknown>)
      : {};

    // Navigate immediately (bypass debounce)
    navigate({
      to: routePath,
      search: baseSearch, // No search param
      replace: true,
    });
  }, [navigate, routePath, preserveSearchParams, currentSearch]);

  return (
    <div className="relative" data-testid={`${testIdPrefix}.search`}>
      <Input
        value={searchInput}
        onChange={handleSearchInputChange}
        placeholder={placeholder}
        className="w-full pr-9"
        data-testid={`${testIdPrefix}.search.input`}
        aria-label={placeholder}
      />
      {searchInput && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-muted"
          aria-label="Clear search"
          data-testid={`${testIdPrefix}.search.clear`}
        >
          <ClearButtonIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
