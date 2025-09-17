import { useState } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TypeCreateDialog } from './type-create-dialog';
import { useTypesSearch, useCreateType } from '@/hooks/use-types';

interface Type {
  id: number;
  name: string;
  part_count?: number;
}

interface TypeSelectorProps {
  value?: number;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  error?: string;
}

export function TypeSelector({ value, onChange, placeholder = "Search or create type...", error }: TypeSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTypeName, setCreateTypeName] = useState('');

  const { data: types = [], isLoading } = useTypesSearch(searchTerm);
  const createTypeMutation = useCreateType();

  const handleCreateType = (term: string) => {
    setCreateTypeName(term);
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = async (typeName: string) => {
    if (!typeName.trim()) return;

    const result = await createTypeMutation.mutateAsync({
      body: { name: typeName.trim() }
    });

    onChange(result.id);
    setSearchTerm(result.name);
    setShowCreateDialog(false);
    setCreateTypeName('');
  };

  const handleCancelCreate = () => {
    setShowCreateDialog(false);
    setCreateTypeName('');
  };

  const renderOption = (type: Type) => (
    <div className="flex justify-between items-center w-full">
      <span>{type.name}</span>
      {typeof type.part_count === 'number' && (
        <span className="text-xs text-muted-foreground">
          {type.part_count} part{type.part_count !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );

  return (
    <>
      <SearchableSelect
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        error={error}
        options={types}
        isLoading={isLoading}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        renderOption={renderOption}
        enableInlineCreate={true}
        onCreateNew={handleCreateType}
        createNewLabel={(term) => `Create type "${term}"`}
        loadingText="Searching types..."
        noResultsText="No types found"
      />

      {showCreateDialog && (
        <TypeCreateDialog
          initialName={createTypeName}
          onConfirm={handleConfirmCreate}
          onCancel={handleCancelCreate}
          isLoading={createTypeMutation.isPending}
          open={showCreateDialog}
        />
      )}
    </>
  );
}

