export interface CollectionGridProps {
  children: React.ReactNode;
  breakpoint?: 'lg' | 'xl';
  testId?: string;
}

export function CollectionGrid({ children, breakpoint = 'xl', testId }: CollectionGridProps) {
  const gridClasses = breakpoint === 'lg'
    ? 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

  return (
    <div className={gridClasses} data-testid={testId}>
      {children}
    </div>
  );
}
