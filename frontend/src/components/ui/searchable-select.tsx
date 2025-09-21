import * as React from 'react';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchableSelectOption {
  id: number;
  name: string;
  [key: string]: unknown; // Allow additional properties
}

type NativeInputProps = React.ComponentPropsWithoutRef<"input">;

interface SearchableSelectProps<T extends SearchableSelectOption> extends Omit<NativeInputProps, "value" | "onChange" | "role" | "aria-expanded" | "aria-haspopup" | "aria-autocomplete"> {
  value?: number;
  onChange: (value: number | undefined) => void;

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

  // Error state
  error?: string;
}

function SearchableSelectComponent<T extends SearchableSelectOption>({
  value,
  onChange,
  placeholder = "Search or select...",
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
  noResultsText = "No results found",
  error,
  onFocus,
  ...props
}: SearchableSelectProps<T>, ref: React.Ref<HTMLInputElement>) {
  const [open, setOpen] = useState(false);
  const [isUserEditing, setIsUserEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge refs
  React.useImperativeHandle(ref, () => inputRef.current!);

  // Find the selected option
  const selectedOption = value ? options.find(option => option.id === value) : null;

  // Handle input focus
  const handleInputFocus: React.FocusEventHandler<HTMLInputElement> = (e) => {
    setIsUserEditing(true);
    // Use a small delay to avoid conflicts with Radix UI's internal handlers
    setTimeout(() => setOpen(true), 0);
    onFocus?.(e);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = e.target.value;
    onSearchChange(newSearchTerm);
    setIsUserEditing(true);

    // Open the popover when typing
    if (!open) {
      setOpen(true);
    }

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

    // Keep focus on input after selection
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Handle create new
  const handleCreateNew = () => {
    if (onCreateNew && searchTerm.trim()) {
      onCreateNew(searchTerm.trim());
      setOpen(false);
    }
  };

  // Handle dropdown toggle
  const handleDropdownToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (open) {
      setOpen(false);
    } else {
      inputRef.current?.focus();
      setOpen(true);
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

  // Handle popover open state changes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);

    if (!newOpen) {
      setIsUserEditing(false);
      // Restore original value if user didn't select anything
      setTimeout(() => {
        if (selectedOption && searchTerm !== selectedOption.name) {
          onSearchChange(selectedOption.name);
        } else if (!selectedOption && searchTerm) {
          onSearchChange('');
        }
      }, 0);
    }
  };

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
    <Popover.Root open={open} onOpenChange={handleOpenChange} modal={false}>
      <Popover.Anchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            {...props}
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder={placeholder}
            error={error}
            className={cn("w-full pr-8", className)}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            role="combobox"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0 h-4 w-4"
            tabIndex={-1}
            onClick={handleDropdownToggle}
            aria-label="Toggle dropdown"
          >
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
          </button>
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          className="z-50 w-[var(--radix-popover-trigger-width)] bg-card border border-input rounded-md shadow-md max-h-60 overflow-y-auto"
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(e) => {
            // Prevent focus from moving to the popover content
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            // Prevent closing when interacting with the input
            const target = e.target as HTMLElement;
            if (inputRef.current?.contains(target)) {
              e.preventDefault();
            }
          }}
        >
          <div role="listbox">
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
                    option={option}
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
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export const SearchableSelect = React.forwardRef(SearchableSelectComponent) as <T extends SearchableSelectOption>(
  props: SearchableSelectProps<T> & { ref?: React.Ref<HTMLInputElement> }
) => React.ReactElement;

(SearchableSelect as { displayName?: string }).displayName = "SearchableSelect";

interface SearchableSelectOptionProps<T extends SearchableSelectOption> {
  option: T;
  onClick: () => void;
  isSelected: boolean;
  children: ReactNode;
}

function SearchableSelectOption<T extends SearchableSelectOption>({
  option,
  onClick,
  isSelected,
  children
}: SearchableSelectOptionProps<T>) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      className={cn(
        "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none flex justify-between items-center",
        isSelected && "bg-accent text-accent-foreground"
      )}
      onClick={onClick}
      onMouseDown={(e) => {
        // Prevent the input from losing focus when clicking an option
        e.preventDefault();
      }}
      data-value={option.id}
    >
      {children}
    </button>
  );
}

interface SearchableSelectCreateOptionProps {
  onClick: () => void;
  label: string;
}

function SearchableSelectCreateOption({
  onClick,
  label
}: SearchableSelectCreateOptionProps) {
  return (
    <button
      type="button"
      className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none border-t"
      onClick={onClick}
      onMouseDown={(e) => {
        // Prevent the input from losing focus when clicking the create option
        e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}