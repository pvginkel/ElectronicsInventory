import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
  const [isUserEditing, setIsUserEditing] = useState(false);
  const [selectedTypeName, setSelectedTypeName] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { data: types = [], isLoading } = useTypesSearch(searchTerm);
  const createTypeMutation = useCreateType();

  // Get the display name for the current selected type
  const getSelectedTypeName = () => {
    return selectedTypeName;
  };
  
  // Store selected type name when value changes  
  useEffect(() => {
    if (value && types.length > 0) {
      const selectedType = types.find((t: Type) => t.id === value);
      if (selectedType) {
        setSelectedTypeName(selectedType.name);
        if (!isUserEditing && searchTerm !== selectedType.name) {
          setSearchTerm(selectedType.name);
        }
      }
    } else {
      setSelectedTypeName('');
      if (!isUserEditing && !value) {
        setSearchTerm('');
      }
    }
  }, [value, types, isUserEditing, searchTerm]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false);
        setIsUserEditing(false);
        // If user was editing but didn't select anything, restore to original value
        if (value) {
          const selectedTypeName = getSelectedTypeName();
          if (selectedTypeName && searchTerm !== selectedTypeName) {
            setSearchTerm(selectedTypeName);
          }
        } else if (searchTerm) {
          // No type selected but there's text, clear it
          setSearchTerm('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, searchTerm, types]);

  const handleInputFocus = () => {
    setIsUserEditing(true);
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

  const handleInputBlur = () => {
    // Use setTimeout to allow for selection clicks to register first
    setTimeout(() => {
      if (!showDropdown) {
        setIsUserEditing(false);
        // If user was editing but didn't select anything, restore to original value
        if (value) {
          const selectedTypeName = getSelectedTypeName();
          if (selectedTypeName && searchTerm !== selectedTypeName) {
            setSearchTerm(selectedTypeName);
          }
        } else if (searchTerm) {
          // No type selected but there's text, clear it
          setSearchTerm('');
        }
      }
    }, 150);
  };

  const handleSelectType = (type: Type) => {
    onChange(type.id);
    setSearchTerm(type.name);
    setSelectedTypeName(type.name);
    setIsUserEditing(false);
    setShowDropdown(false);
  };

  const handleCreateType = () => {
    setCreateTypeName(searchTerm);
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = async (typeName: string) => {
    if (!typeName.trim()) return;
    
    const result = await createTypeMutation.mutateAsync({
      body: { name: typeName.trim() }
    });
    
    onChange(result.id);
    setSearchTerm(result.name);
    setSelectedTypeName(result.name);
    setIsUserEditing(false);
    setShowCreateDialog(false);
    setShowDropdown(false);
    setCreateTypeName('');
  };

  const handleCancelCreate = () => {
    setShowCreateDialog(false);
    setCreateTypeName('');
  };

  const exactMatch = types.find((t: Type) => t.name.toLowerCase() === searchTerm.toLowerCase());
  const showCreateOption = searchTerm.trim() && !exactMatch && !isLoading;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
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
            <div className="p-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-muted-foreground">Searching types...</span>
              </div>
            </div>
          ) : (
            <>
              {types.map((type: Type) => (
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
  onConfirm: (name: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function TypeCreateDialog({ initialName, onConfirm, onCancel, isLoading }: TypeCreateDialogProps) {
  const [name, setName] = useState(initialName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (name.trim()) {
      onConfirm(name);
    }
  };

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name);
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Type</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!name.trim() || isLoading}
              loading={isLoading}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}