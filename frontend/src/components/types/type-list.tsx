import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ListScreenLayout } from '@/components/layout/list-screen-layout';
import { ListScreenCounts } from '@/components/layout/list-screen-counts';
import { Button } from '@/components/ui/button';
import { CollectionGrid, EmptyState } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ClearButtonIcon } from '@/components/icons/clear-button-icon';
import { useConfirm } from '@/hooks/use-confirm';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import {
  useCreateType,
  useUpdateType,
  useDeleteType,
  useGetTypesWithStats,
} from '@/hooks/use-types';
import { TypeCard } from './type-card';
import { TypeForm } from './type-form';

interface TypeListProps {
  searchTerm?: string;
}

interface TypeSummary {
  id: number;
  name: string;
  part_count?: number;
  created_at?: string;
  updated_at?: string;
}

export function TypeList({ searchTerm = '' }: TypeListProps) {
  const navigate = useNavigate();
  const { confirm, confirmProps } = useConfirm();
  const { showSuccess, showException } = useToast();

  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<TypeSummary | null>(null);

  const {
    data: typesResponse,
    isLoading,
    isFetching,
    error,
  } = useGetTypesWithStats();
  const createMutation = useCreateType();
  const updateMutation = useUpdateType();
  const deleteMutation = useDeleteType();

  const types: TypeSummary[] = useMemo(
    () => (Array.isArray(typesResponse) ? typesResponse : []),
    [typesResponse],
  );

  const [showLoading, setShowLoading] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
// eslint-disable-next-line react-hooks/set-state-in-effect -- Debounced loading visibility state for UX
      setShowLoading(true);
      return;
    }

    if (!isFetching) {
      setShowLoading(false);
    }
  }, [isFetching, isLoading]);

  const filteredTypes = useMemo(() => {
    if (!searchTerm.trim()) {
      return types;
    }

    const term = searchTerm.toLowerCase();
    return types.filter((type) => type.name.toLowerCase().includes(term));
  }, [types, searchTerm]);

  const sortedTypes = useMemo(
    () => [...filteredTypes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
    [filteredTypes],
  );

  const totalCount = types.length;
  const visibleCount = filteredTypes.length;
  const filteredCount = filteredTypes.length < types.length ? filteredTypes.length : undefined;
  const searchActive = searchTerm.trim().length > 0;

  useListLoadingInstrumentation({
    scope: 'types.list',
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      status: 'success',
      queries: {
        types: 'success',
      },
      totals: { all: totalCount },
      visible: visibleCount,
      ...(typeof filteredCount === 'number' ? { filtered: filteredCount } : {}),
      searchTerm: searchActive ? searchTerm : null,
      totalTypes: totalCount,
    }),
    getErrorMetadata: (err) => ({
      status: 'error',
      queries: {
        types: err ? 'error' : 'success',
      },
      message: err instanceof Error ? err.message : String(err),
      totals: { all: totalCount },
      visible: visibleCount,
      ...(typeof filteredCount === 'number' ? { filtered: filteredCount } : {}),
      searchTerm: searchActive ? searchTerm : null,
      totalTypes: totalCount,
    }),
    getAbortedMetadata: () => ({
      status: 'aborted',
      queries: {
        types: 'aborted',
      },
      totals: { all: totalCount },
      visible: visibleCount,
      ...(typeof filteredCount === 'number' ? { filtered: filteredCount } : {}),
      searchTerm: searchActive ? searchTerm : null,
      totalTypes: totalCount,
    }),
  });

  const handleSearchChange = (value: string) => {
    if (value) {
      navigate({
        to: '/types',
        search: { search: value },
        replace: true,
      });
      return;
    }

    navigate({
      to: '/types',
      replace: true,
    });
  };

  const handleClearSearch = () => {
    handleSearchChange('');
  };

  const handleCreateType = async (data: { name: string }) => {
    await createMutation.mutateAsync({ body: data });
    setCreateFormOpen(false);
  };

  const handleEditType = (type: TypeSummary) => {
    setEditingType(type);
    setEditFormOpen(true);
  };

  const handleUpdateType = async (data: { name: string }) => {
    if (!editingType) {
      return;
    }

    await updateMutation.mutateAsync({
      path: { type_id: editingType.id },
      body: data,
    });
    setEditingType(null);
    setEditFormOpen(false);
  };

  const handleDeleteType = async (type: TypeSummary) => {
    const confirmed = await confirm({
      title: 'Delete Type',
      description: `Are you sure you want to delete the type "${type.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({
        path: { type_id: type.id },
      });
      showSuccess(`Type "${type.name}" deleted`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete type';
      showException(message, error);
    }
  };

  const renderAddButton = (disabled = false) => (
    <Button
      onClick={() => setCreateFormOpen(true)}
      disabled={disabled}
      data-testid="types.create.button"
    >
      Add Type
    </Button>
  );

  const renderSearchField = (disabled = false) => (
    <div className="relative" data-testid="types.list.search-container">
      <Input
        placeholder="Search..."
        value={searchTerm}
        onChange={(event) => handleSearchChange(event.target.value)}
        className="pr-8"
        data-testid="types.list.search"
        disabled={disabled}
      />
      {searchTerm && (
        <button
          type="button"
          onClick={handleClearSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-muted disabled:opacity-50"
          aria-label="Clear search"
          data-testid="types.list.search.clear"
          disabled={disabled}
        >
          <ClearButtonIcon />
        </button>
      )}
    </div>
  );

  const breadcrumbNode = (
    <span data-testid="types.overview.breadcrumb">
      Types
    </span>
  );

  const renderCounts = (content: ReactNode) => (
    <div data-testid="types.overview.summary">
      <div data-testid="types.list.summary">
        {content}
      </div>
    </div>
  );

  const renderLayout = ({
    content,
    actionsDisabled = false,
    showSearch = true,
    searchDisabled = false,
    counts,
  }: {
    content: ReactNode;
    actionsDisabled?: boolean;
    showSearch?: boolean;
    searchDisabled?: boolean;
    counts?: ReactNode;
  }) => (
    <div className="flex h-full min-h-0 flex-col" data-testid="types.page">
      <ListScreenLayout
        rootTestId="types.overview"
        headerTestId="types.overview.header"
        contentTestId="types.overview.content"
        breadcrumbs={breadcrumbNode}
        title="Types"
        actions={(
          <div className="flex flex-wrap gap-2">
            {renderAddButton(actionsDisabled)}
          </div>
        )}
        search={showSearch ? renderSearchField(searchDisabled) : undefined}
        counts={counts}
      >
        {content}
      </ListScreenLayout>
    </div>
  );

  const dialogs = (
    <>
      <TypeForm
        open={createFormOpen}
        onOpenChange={setCreateFormOpen}
        onSubmit={handleCreateType}
        title="Add Type"
        submitText="Add Type"
      />

      {editingType && (
        <TypeForm
          open={editFormOpen}
          onOpenChange={(open) => {
            setEditFormOpen(open);
            if (!open) {
              setEditingType(null);
            }
          }}
          onSubmit={handleUpdateType}
          initialValues={editingType}
          title="Edit Type"
          submitText="Update Type"
        />
      )}

      <ConfirmDialog {...confirmProps} />
    </>
  );

  if (isLoading && showLoading) {
    const loadingContent = (
      <CollectionGrid testId="types.list.loading">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton
            key={index}
            height="h-32"
            testId="types.list.loading.skeleton"
          />
        ))}
      </CollectionGrid>
    );

    return (
      <>
        {renderLayout({
          content: loadingContent,
          actionsDisabled: true,
          searchDisabled: true,
          counts: renderCounts(
            <span className="inline-flex">
              <Skeleton width="w-32" height="h-5" />
            </span>,
          ),
        })}
        {dialogs}
      </>
    );
  }

  if (error) {
    return (
      <>
        {renderLayout({
          content: (
            <div className="py-12 text-center" data-testid="types.list.error">
              <p className="text-lg text-muted-foreground">Failed to load types</p>
              <p className="mt-2 text-sm text-muted-foreground">{String(error)}</p>
            </div>
          ),
          counts: undefined,
        })}
        {dialogs}
      </>
    );
  }

  if (totalCount === 0) {
    return (
      <>
        {renderLayout({
          content: (
            <EmptyState
              testId="types.list.empty"
              title="No types yet"
              description="Add your first part type to start organizing your electronics parts."
              action={{
                label: 'Add your first type',
                onClick: () => setCreateFormOpen(true),
                testId: 'types.list.empty.cta',
              }}
            />
          ),
          showSearch: false,
          counts: undefined,
        })}
        {dialogs}
      </>
    );
  }

  const hasResults = filteredTypes.length > 0;

  const countsNode = renderCounts(
    <ListScreenCounts
      visible={visibleCount}
      total={totalCount}
      noun={{ singular: 'type', plural: 'types' }}
      filtered={filteredCount}
    />,
  );

  const listContent = hasResults ? (
    <CollectionGrid testId="types.list.container">
      {sortedTypes.map((type) => (
        <TypeCard
          key={type.id}
          type={type}
          partCount={type.part_count}
          onEdit={() => handleEditType(type)}
          onDelete={() => handleDeleteType(type)}
        />
      ))}
    </CollectionGrid>
  ) : (
    <EmptyState
      testId="types.list.no-results"
      title="No matching types"
      description="Try adjusting your search terms or add a new type."
    />
  );

  return (
    <>
      {renderLayout({
        content: listContent,
        counts: countsNode,
      })}

      {dialogs}
    </>
  );
}
