import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTypesSearch, useCreateType } from '@/hooks/use-types';

interface Type {
  id: number;
  name: string;
}

interface TypeSelectorProps {
  value?: number;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  error?: string;
}

export function TypeSelector({ value, onChange, placeholder = "Search or create type...", error }: TypeSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTypeName, setCreateTypeName] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { data: types = [], isLoading } = useTypesSearch(searchTerm);
  const createTypeMutation = useCreateType();
  
  // Initialize search term with selected type name if available
  useEffect(() => {
    if (value && types.length > 0) {
      const selectedType = types.find(t => t.id === value);
      if (selectedType && !searchTerm) {
        setSearchTerm(selectedType.name);
      }
    }
  }, [value, types, searchTerm]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputFocus = () => {
    setShowDropdown(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = e.target.value;
    setSearchTerm(newSearchTerm);
    setShowDropdown(true);
    
    // If the input is cleared, clear the selection
    if (!newSearchTerm) {
      onChange(undefined);
    }
  };

  const handleSelectType = (type: Type) => {
    onChange(type.id);
    setSearchTerm(type.name);
    setShowDropdown(false);
  };

  const handleCreateType = () => {
    setCreateTypeName(searchTerm);
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = async () => {
    if (!createTypeName.trim()) return;
    
    try {
      const result = await createTypeMutation.mutateAsync({
        body: { name: createTypeName.trim() }
      });
      
      onChange(result.id);
      setSearchTerm(result.name);
      setShowCreateDialog(false);
      setShowDropdown(false);
      setCreateTypeName('');
    } catch (error) {
      console.error('Failed to create type:', error);
    }
  };

  const handleCancelCreate = () => {
    setShowCreateDialog(false);
    setCreateTypeName('');
  };

  const exactMatch = types.find(t => t.name.toLowerCase() === searchTerm.toLowerCase());
  const showCreateOption = searchTerm.trim() && !exactMatch && !isLoading;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        error={error}
        className="w-full"
      />
      
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border border-input rounded-md shadow-md max-h-60 overflow-y-auto"
        >
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Searching...</div>
          ) : (
            <>
              {types.map((type) => (
                <TypeOption
                  key={type.id}
                  type={type}
                  onClick={() => handleSelectType(type)}
                />
              ))}
              
              {showCreateOption && (
                <CreateTypeOption
                  searchTerm={searchTerm}
                  onClick={handleCreateType}
                />
              )}
              
              {types.length === 0 && !showCreateOption && searchTerm && (
                <div className="p-3 text-sm text-muted-foreground">No types found</div>
              )}
            </>
          )}
        </div>
      )}

      {showCreateDialog && (
        <TypeCreateDialog
          initialName={createTypeName}
          onConfirm={handleConfirmCreate}
          onCancel={handleCancelCreate}
          isLoading={createTypeMutation.isPending}
        />
      )}
    </div>
  );
}

interface TypeOptionProps {
  type: Type;
  onClick: () => void;
}

function TypeOption({ type, onClick }: TypeOptionProps) {
  return (
    <button
      type="button"
      className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
      onClick={onClick}
    >
      {type.name}
    </button>
  );
}

interface CreateTypeOptionProps {
  searchTerm: string;
  onClick: () => void;
}

function CreateTypeOption({ searchTerm, onClick }: CreateTypeOptionProps) {
  return (
    <button
      type="button"
      className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none border-t"
      onClick={onClick}
    >
      Create type "{searchTerm}"
    </button>
  );
}

interface TypeCreateDialogProps {
  initialName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function TypeCreateDialog({ initialName, onConfirm, onCancel, isLoading }: TypeCreateDialogProps) {
  const [name, setName] = useState(initialName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-lg shadow-lg w-full max-w-md">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Create New Type</h3>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type name"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 p-6 pt-0">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || isLoading}
              loading={isLoading}
            >
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}