import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ListScreenLayout } from '@/components/layout/list-screen-layout';
import { ListScreenCounts } from '@/components/layout/list-screen-counts';
import { Button } from '@/components/ui/button';
import { CollectionGrid, EmptyState } from '@/components/ui';
import { DebouncedSearchInput } from '@/components/ui/debounced-search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useListLoadingInstrumentation } from '@/lib/test/query-instrumentation';
import {
  useGetBoxes,
  usePostBoxes,
  type BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema,
} from '@/lib/api/generated/hooks';
import { BoxCard } from './box-card';
import { BoxForm } from './box-form';

interface BoxListProps {
  searchTerm?: string;
}

export function BoxList({ searchTerm = '' }: BoxListProps) {
  const navigate = useNavigate();
  const { showSuccess, showException } = useToast();
  const [createFormOpen, setCreateFormOpen] = useState(false);

  const {
    data: boxes = [],
    isLoading,
    isFetching,
    error,
  } = useGetBoxes();
  const createMutation = usePostBoxes();

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

  const filteredBoxes = useMemo(() => {
    if (!searchTerm.trim()) {
      return boxes;
    }

    const term = searchTerm.toLowerCase();
    return boxes.filter((box: BoxWithUsageSchemaList_a9993e3_BoxWithUsageSchema) => {
      const boxNumber = String(box.box_no);
      const description = box.description?.toLowerCase() ?? '';
      return boxNumber.includes(term) || description.includes(term);
    });
  }, [boxes, searchTerm]);

  const sortedBoxes = useMemo(
    () => [...filteredBoxes].sort((a, b) => a.box_no - b.box_no),
    [filteredBoxes],
  );

  const totalCount = boxes.length;
  const visibleCount = filteredBoxes.length;
  const filteredCount = filteredBoxes.length < boxes.length ? filteredBoxes.length : undefined;
  const searchActive = searchTerm.trim().length > 0;

  useListLoadingInstrumentation({
    scope: 'boxes.list',
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

  const handleCreateBox = async (data: { description: string; capacity: number }) => {
    try {
      await createMutation.mutateAsync({ body: data });
      showSuccess('Box created successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create box';
      showException(message, err);
      throw err;
    }
  };

  const handleViewBox = (boxNo: number) => {
    navigate({ to: '/boxes/$boxNo', params: { boxNo: boxNo.toString() } });
  };

  const boxForm = (
    <BoxForm
      open={createFormOpen}
      onOpenChange={setCreateFormOpen}
      onSubmit={handleCreateBox}
      title="Add Box"
      submitText="Add Box"
      formId="boxes.create"
    />
  );

  const breadcrumbNode = (
    <span data-testid="boxes.overview.breadcrumb">
      Storage
    </span>
  );

  const renderAddButton = (disabled = false) => (
    <Button
      onClick={() => setCreateFormOpen(true)}
      disabled={disabled}
      data-testid="boxes.list.add"
    >
      Add Box
    </Button>
  );

  const renderSearchField = () => (
    <DebouncedSearchInput
      searchTerm={searchTerm}
      routePath="/boxes"
      placeholder="Search..."
      testIdPrefix="boxes.list"
    />
  );

  const renderCounts = (content: ReactNode) => (
    <div data-testid="boxes.overview.summary">
      <div data-testid="boxes.list.summary">
        {content}
      </div>
    </div>
  );

  const renderLayout = ({
    content,
    actionsDisabled = false,
    showSearch = true,
    counts,
  }: {
    content: ReactNode;
    actionsDisabled?: boolean;
    showSearch?: boolean;
    counts?: ReactNode;
  }) => (
    <div className="flex h-full min-h-0 flex-col" data-testid="boxes.page">
      <ListScreenLayout
        rootTestId="boxes.overview"
        headerTestId="boxes.overview.header"
        contentTestId="boxes.overview.content"
        breadcrumbs={breadcrumbNode}
        title="Storage Boxes"
        actions={(
          <div className="flex flex-wrap gap-2">
            {renderAddButton(actionsDisabled)}
          </div>
        )}
        search={showSearch ? renderSearchField() : undefined}
        counts={counts}
      >
        {content}
      </ListScreenLayout>
    </div>
  );

  if (isLoading && showLoading) {
    const loadingContent = (
      <CollectionGrid testId="boxes.list.loading">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} height="h-48" />
        ))}
      </CollectionGrid>
    );

    return (
      <>
        {renderLayout({
          content: loadingContent,
          actionsDisabled: true,
          counts: renderCounts(
            <span className="inline-flex">
              <Skeleton width="w-32" height="h-5" />
            </span>,
          ),
        })}
        {boxForm}
      </>
    );
  }

  if (error) {
    return (
      <>
        {renderLayout({
          content: (
            <div className="py-12 text-center" data-testid="boxes.list.error">
              <p className="text-lg text-muted-foreground">Failed to load boxes</p>
              <p className="mt-2 text-sm text-muted-foreground">{String(error)}</p>
            </div>
          ),
          counts: undefined,
        })}
        {boxForm}
      </>
    );
  }

  if (totalCount === 0) {
    return (
      <>
        {renderLayout({
          content: (
            <EmptyState
              testId="boxes.list.empty"
              title="No storage boxes yet"
              description="Add your first storage box to start organizing your electronics parts."
              action={{
                label: 'Create your first box',
                onClick: () => setCreateFormOpen(true),
                testId: 'boxes.list.empty.cta',
              }}
            />
          ),
          showSearch: false,
          counts: undefined,
        })}
        {boxForm}
      </>
    );
  }

  const hasResults = filteredBoxes.length > 0;

  const countsNode = renderCounts(
    <ListScreenCounts
      visible={visibleCount}
      total={totalCount}
      noun={{ singular: 'box', plural: 'boxes' }}
      filtered={filteredCount}
    />,
  );

  const listContent = hasResults ? (
    <CollectionGrid testId="boxes.list.table">
      {sortedBoxes.map((box) => (
        <BoxCard
          key={box.box_no}
          box={box}
          onOpen={() => handleViewBox(box.box_no)}
        />
      ))}
    </CollectionGrid>
  ) : (
    <EmptyState
      testId="boxes.list.no-results"
      title="No boxes found"
      description="Try adjusting your search terms or add a new box."
    />
  );

  return (
    <>
      {renderLayout({
        content: listContent,
        counts: countsNode,
      })}

      {boxForm}
    </>
  );
}
