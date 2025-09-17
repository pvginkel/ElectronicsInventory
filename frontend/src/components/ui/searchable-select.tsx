import { useState, useRef, useEffect, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchableSelectOption {
  id: number;
  name: string;
  [key: string]: unknown; // Allow additional properties
}

interface SearchableSelectProps<T extends SearchableSelectOption> {
  value?: number;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  error?: string;
  className?: string;

  // Data fetching
  options: T[];
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;

  // Custom rendering
  renderOption?: (option: T) => ReactNode;

  // Inline creation
  enableInlineCreate?: boolean;
  onCreateNew?: (searchTerm: string) => void;
  createNewLabel?: (searchTerm: string) => string;

  // Loading states
  loadingText?: string;
  noResultsText?: string;
}

export function SearchableSelect<T extends SearchableSelectOption>({
  value,
  onChange,
  placeholder = "Search or select...",
  error,
  className,
  options = [],
  isLoading,
  searchTerm,
  onSearchChange,
  renderOption,
  enableInlineCreate = false,
  onCreateNew,
  createNewLabel = (term) => `Create "${term}"`,
  loadingText = "Searching...",
  noResultsText = "No results found"
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [isUserEditing, setIsUserEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find the selected option
  const selectedOption = value ? options.find(option => option.id === value) : null;

  // Handle input focus
  const handleInputFocus = () => {
    setIsUserEditing(true);
    setOpen(true);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = e.target.value;
    onSearchChange(newSearchTerm);
    setOpen(true);

    // If the input is cleared, clear the selection
    if (!newSearchTerm) {
      onChange(undefined);
    }
  };

  // Handle option selection
  const handleSelectOption = (option: T) => {
    onChange(option.id);
    onSearchChange(option.name);
    setIsUserEditing(false);
    setOpen(false);
  };

  // Handle create new
  const handleCreateNew = () => {
    if (onCreateNew && searchTerm.trim()) {
      onCreateNew(searchTerm.trim());
    }
  };

  // Handle open change
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);

    if (!newOpen) {
      setIsUserEditing(false);
      // If user was editing but didn't select anything, restore to original value
      if (selectedOption && searchTerm !== selectedOption.name) {
        onSearchChange(selectedOption.name);
      } else if (!selectedOption && searchTerm) {
        // No option selected but there's text, clear it
        onSearchChange('');
      }
    }
  };

  // Update search term when selection changes from outside
  useEffect(() => {
    if (selectedOption && !isUserEditing && searchTerm !== selectedOption.name) {
      onSearchChange(selectedOption.name);
    } else if (!selectedOption && !isUserEditing && searchTerm) {
      onSearchChange('');
    }
  }, [value, selectedOption, isUserEditing, searchTerm, onSearchChange]);

  // Check for exact match and create option
  const exactMatch = options.find(option =>
    option.name.toLowerCase() === searchTerm.toLowerCase()
  );
  const showCreateOption = enableInlineCreate &&
    searchTerm.trim() &&
    !exactMatch &&
    !isLoading &&
    onCreateNew;

  return (
    <div className={cn("relative", className)}>
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger asChild>
          <div className="relative">
            <Input
              ref={inputRef}
              value={searchTerm}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              placeholder={placeholder}
              error={error}
              className="w-full pr-8"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  open && "rotate-180"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 w-[var(--radix-popover-trigger-width)] bg-card border border-input rounded-md shadow-md max-h-60 overflow-y-auto"
            sideOffset={4}
            align="start"
          >
            {isLoading ? (
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm text-muted-foreground">{loadingText}</span>
                </div>
              </div>
            ) : (
              <>
                {options.map((option) => (
                  <SearchableSelectOption
                    key={option.id}
                    onClick={() => handleSelectOption(option)}
                    isSelected={value === option.id}
                  >
                    {renderOption ? renderOption(option) : option.name}
                  </SearchableSelectOption>
                ))}

                {showCreateOption && (
                  <SearchableSelectCreateOption
                    onClick={handleCreateNew}
                    label={createNewLabel(searchTerm)}
                  />
                )}

                {options.length === 0 && !showCreateOption && searchTerm && (
                  <div className="p-3 text-sm text-muted-foreground">{noResultsText}</div>
                )}
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

interface SearchableSelectOptionProps {
  onClick: () => void;
  isSelected: boolean;
  children: ReactNode;
}

const SearchableSelectOption = ({
  onClick,
  isSelected,
  children
}: SearchableSelectOptionProps) => {
  return (
    <button
      type="button"
      className={cn(
        "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none flex justify-between items-center",
        isSelected && "bg-accent text-accent-foreground"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

interface SearchableSelectCreateOptionProps {
  onClick: () => void;
  label: string;
}

const SearchableSelectCreateOption = ({
  onClick,
  label
}: SearchableSelectCreateOptionProps) => {
  return (
    <button
      type="button"
      className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none border-t"
      onClick={onClick}
    >
      {label}
    </button>
  );
};