import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ListScreenLayout } from '@/components/layout/list-screen-layout';
import { ListScreenCounts } from '@/components/layout/list-screen-counts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ClearButtonIcon } from '@/components/icons/clear-button-icon';
import { useConfirm } from '@/hooks/use-confirm';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import { SellerCard } from './seller-card';
import { SellerForm } from './seller-form';
import {
  useCreateSeller,
  useUpdateSeller,
  useDeleteSeller,
  useSellers,
} from '@/hooks/use-sellers';

interface SellerListProps {
  searchTerm?: string;
}

interface SellerSummary {
  id: number;
  name: string;
  website: string;
  created_at?: string;
  updated_at?: string;
}

export function SellerList({ searchTerm = '' }: SellerListProps) {
  const navigate = useNavigate();
  const { confirm, confirmProps } = useConfirm();
  const { showSuccess, showException } = useToast();

  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<SellerSummary | null>(null);

  const {
    data: sellers = [],
    isLoading,
    isFetching,
    error,
  } = useSellers();
  const createMutation = useCreateSeller();
  const updateMutation = useUpdateSeller();
  const deleteMutation = useDeleteSeller();

  const [showLoading, setShowLoading] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setShowLoading(true);
      return;
    }

    if (!isFetching) {
      setShowLoading(false);
    }
  }, [isFetching, isLoading]);

  const filteredSellers = useMemo(() => {
    if (!searchTerm.trim()) {
      return sellers;
    }

    const term = searchTerm.toLowerCase();
    return sellers.filter((seller: SellerSummary) => {
      const name = seller.name.toLowerCase();
      const website = seller.website?.toLowerCase() ?? '';
      return name.includes(term) || website.includes(term);
    });
  }, [sellers, searchTerm]);

  const sortedSellers = useMemo(
    () => [...filteredSellers].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
    [filteredSellers],
  );

  const totalCount = sellers.length;
  const visibleCount = filteredSellers.length;
  const filteredCount = filteredSellers.length < sellers.length ? filteredSellers.length : undefined;
  const searchActive = searchTerm.trim().length > 0;

  useListLoadingInstrumentation({
    scope: 'sellers.list',
    isLoading,
    isFetching,
    error,
    getReadyMetadata: () => ({
      status: 'success',
      totals: { all: totalCount },
      visible: visibleCount,
      ...(typeof filteredCount === 'number' ? { filtered: filteredCount } : {}),
      searchTerm: searchActive ? searchTerm : null,
    }),
    getErrorMetadata: (err) => ({
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      totals: { all: totalCount },
      visible: visibleCount,
      ...(typeof filteredCount === 'number' ? { filtered: filteredCount } : {}),
      searchTerm: searchActive ? searchTerm : null,
    }),
    getAbortedMetadata: () => ({
      status: 'aborted',
      totals: { all: totalCount },
      visible: visibleCount,
      ...(typeof filteredCount === 'number' ? { filtered: filteredCount } : {}),
      searchTerm: searchActive ? searchTerm : null,
    }),
  });

  const handleSearchChange = (value: string) => {
    if (value) {
      navigate({
        to: '/sellers',
        search: { search: value },
        replace: true,
      });
      return;
    }

    navigate({
      to: '/sellers',
      replace: true,
    });
  };

  const handleClearSearch = () => {
    handleSearchChange('');
  };

  const handleCreateSeller = async (data: { name: string; website: string }) => {
    try {
      await createMutation.mutateAsync({ body: data });
      showSuccess('Seller created successfully');
      setCreateFormOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create seller';
      showException(message, err);
      throw err;
    }
  };

  const handleEditSeller = (seller: SellerSummary) => {
    setEditingSeller(seller);
    setEditFormOpen(true);
  };

  const handleUpdateSeller = async (data: { name: string; website: string }) => {
    if (!editingSeller) {
      return;
    }

    try {
      await updateMutation.mutateAsync({
        path: { seller_id: editingSeller.id },
        body: data,
      });
      showSuccess('Seller updated successfully');
      setEditingSeller(null);
      setEditFormOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update seller';
      showException(message, err);
      throw err;
    }
  };

  const handleDeleteSeller = async (seller: SellerSummary) => {
    const confirmed = await confirm({
      title: 'Delete Seller',
      description: `Are you sure you want to delete the seller "${seller.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({
        path: { seller_id: seller.id },
      });
      showSuccess(`Seller "${seller.name}" deleted`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete seller';
      showException(message, err);
      throw err;
    }
  };

  const renderAddButton = (disabled = false) => (
    <Button
      onClick={() => setCreateFormOpen(true)}
      disabled={disabled}
      data-testid="sellers.list.add"
    >
      Add Seller
    </Button>
  );

  const renderSearchField = (disabled = false) => (
    <div className="relative" data-testid="sellers.list.search-container">
      <Input
        placeholder="Search..."
        value={searchTerm}
        onChange={(event) => handleSearchChange(event.target.value)}
        className="pr-8"
        data-testid="sellers.list.search"
        disabled={disabled}
      />
      {searchTerm && (
        <button
          type="button"
          onClick={handleClearSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-muted disabled:opacity-50"
          aria-label="Clear search"
          data-testid="sellers.list.search.clear"
          disabled={disabled}
        >
          <ClearButtonIcon />
        </button>
      )}
    </div>
  );

  const breadcrumbNode = (
    <span data-testid="sellers.overview.breadcrumb">
      Sellers
    </span>
  );

  const renderCounts = (content: ReactNode) => (
    <div data-testid="sellers.overview.summary">
      <div data-testid="sellers.list.summary">
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
    <div className="flex h-full min-h-0 flex-col" data-testid="sellers.page">
      <ListScreenLayout
        rootTestId="sellers.overview"
        headerTestId="sellers.overview.header"
        contentTestId="sellers.overview.content"
        breadcrumbs={breadcrumbNode}
        title="Sellers"
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
      <SellerForm
        open={createFormOpen}
        onOpenChange={setCreateFormOpen}
        onSubmit={handleCreateSeller}
        title="Add Seller"
        submitText="Add Seller"
        formId="sellers.create"
      />

      {editingSeller && (
        <SellerForm
          open={editFormOpen}
          onOpenChange={(open) => {
            setEditFormOpen(open);
            if (!open) {
              setEditingSeller(null);
            }
          }}
          onSubmit={handleUpdateSeller}
          initialValues={editingSeller}
          title="Edit Seller"
          submitText="Update Seller"
          formId={`sellers.edit.${editingSeller.id}`}
        />
      )}

      <ConfirmDialog {...confirmProps} />
    </>
  );

  if (isLoading && showLoading) {
    const loadingContent = (
      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        data-testid="sellers.list.loading"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );

    return (
      <>
        {renderLayout({
          content: loadingContent,
          actionsDisabled: true,
          searchDisabled: true,
          counts: renderCounts(
            <span className="inline-flex h-5 w-32 animate-pulse rounded bg-muted" />,
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
            <div className="py-12 text-center" data-testid="sellers.list.error">
              <p className="text-lg text-muted-foreground">Failed to load sellers</p>
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
            <div className="py-12 text-center" data-testid="sellers.list.empty">
              <h3 className="text-lg font-medium text-muted-foreground">No sellers yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Add your first seller to start managing vendor information for your parts.
              </p>
              <Button
                className="mt-4"
                onClick={() => setCreateFormOpen(true)}
                data-testid="sellers.list.empty.cta"
              >
                Add First Seller
              </Button>
            </div>
          ),
          showSearch: false,
          counts: undefined,
        })}
        {dialogs}
      </>
    );
  }

  const hasResults = filteredSellers.length > 0;

  const countsNode = renderCounts(
    <ListScreenCounts
      visible={visibleCount}
      total={totalCount}
      noun={{ singular: 'seller', plural: 'sellers' }}
      filtered={filteredCount}
    />,
  );

  const listContent = hasResults ? (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      data-testid="sellers.list.table"
    >
      {sortedSellers.map((seller) => (
        <SellerCard
          key={seller.id}
          seller={seller}
          onEdit={() => handleEditSeller(seller)}
          onDelete={() => handleDeleteSeller(seller)}
        />
      ))}
    </div>
  ) : (
    <div className="py-12 text-center" data-testid="sellers.list.no-results">
      <h3 className="text-lg font-medium text-muted-foreground">No matching sellers</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Try adjusting your search terms or add a new seller.
      </p>
    </div>
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
