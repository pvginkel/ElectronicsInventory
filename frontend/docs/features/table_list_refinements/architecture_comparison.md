# Architecture Comparison: Callback vs. Direct Navigation

This document compares the callback-based approach (recommended in plan review) vs. the direct-navigation approach (proposed in original plan) for the `DebouncedSearchInput` component.

---

## Approach 1: Callback Pattern (Review Recommendation)

### Component API

```typescript
interface DebouncedSearchInputProps {
  searchTerm: string;
  placeholder?: string;
  testIdPrefix: string;
  onSearchChange: (search: string) => void;
}
```

### Parts List - Route Component

**File: `src/routes/parts/index.tsx`**

```typescript
// CURRENT (no debounce - updates URL on every keystroke)
function PartsRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  return (
    <PartList
      searchTerm={typeof search.search === 'string' ? search.search : ''}
      onSelectPart={handleSelectPart}
      onCreatePart={handleCreatePart}
    />
  );
}

// WITH CALLBACK PATTERN (route owns navigation)
function PartsRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  // Add this handler (4 lines)
  const handleSearchChange = useCallback((nextSearch: string) => {
    navigate({
      to: '/parts',
      search: nextSearch ? { search: nextSearch } : {},
      replace: true,
    });
  }, [navigate]);

  return (
    <PartList
      searchTerm={typeof search.search === 'string' ? search.search : ''}
      onSearchChange={handleSearchChange}  // Add this prop
      onSelectPart={handleSelectPart}
      onCreatePart={handleCreatePart}
    />
  );
}
```

**Lines of code added to route: ~6 lines** (handler + prop)

### Parts List - List Component

**File: `src/components/parts/part-list.tsx`**

```typescript
// CURRENT (no debounce)
interface PartListProps {
  searchTerm?: string;
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
}

export function PartList({ searchTerm = '', onSelectPart, onCreatePart }: PartListProps) {
  const navigate = useNavigate();

  const handleSearchChange = (value: string) => {
    if (value) {
      navigate({ to: '/parts', search: { search: value }, replace: true });
    } else {
      navigate({ to: '/parts', replace: true });
    }
  };

  const handleClearSearch = () => {
    handleSearchChange('');
  };

  // ... filtering logic uses searchTerm
  const filteredParts = useMemo(() => {
    if (!searchTerm.trim()) return parts;
    // ... filter by searchTerm
  }, [parts, searchTerm, typeMap]);

  const searchNode = (
    <div className="relative" data-testid="parts.list.search-container">
      <Input
        placeholder="Search..."
        value={searchTerm}
        onChange={(event) => handleSearchChange(event.target.value)}
        className="w-full pr-8"
        data-testid="parts.list.search"
      />
      {searchTerm && (
        <button onClick={handleClearSearch} /* ... */>
          <ClearButtonIcon />
        </button>
      )}
    </div>
  );

  // ... rest of component
}

// WITH CALLBACK PATTERN (minimal changes)
interface PartListProps {
  searchTerm?: string;
  onSearchChange?: (search: string) => void;  // Add this
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
}

export function PartList({
  searchTerm = '',
  onSearchChange,  // Add this
  onSelectPart,
  onCreatePart
}: PartListProps) {
  // REMOVE: const navigate = useNavigate();
  // REMOVE: handleSearchChange implementation (5 lines)
  // REMOVE: handleClearSearch implementation (3 lines)

  // ... filtering logic unchanged (uses searchTerm from URL)
  const filteredParts = useMemo(() => {
    if (!searchTerm.trim()) return parts;
    // ... filter by searchTerm
  }, [parts, searchTerm, typeMap]);

  // Replace search UI with reusable component
  const searchNode = onSearchChange ? (
    <DebouncedSearchInput
      searchTerm={searchTerm}
      placeholder="Search..."
      testIdPrefix="parts.list"
      onSearchChange={onSearchChange}
    />
  ) : null;

  // ... rest of component unchanged
}
```

**Lines of code removed from list component: ~8 lines** (navigate import, handlers)
**Lines of code added: ~7 lines** (prop, component usage)
**Net change: ~0 lines** (slight reduction)

---

## Approach 2: Direct Navigation (Original Plan)

### Component API

```typescript
interface DebouncedSearchInputProps {
  searchTerm: string;
  routePath: string;
  placeholder?: string;
  testIdPrefix: string;
  preserveSearchParams?: (currentSearch: Record<string, unknown>) => Record<string, unknown>;
}
```

### Parts List - Route Component

**File: `src/routes/parts/index.tsx`**

```typescript
// WITH DIRECT NAVIGATION (route unchanged)
function PartsRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  return (
    <PartList
      searchTerm={typeof search.search === 'string' ? search.search : ''}
      onSelectPart={handleSelectPart}
      onCreatePart={handleCreatePart}
    />
  );
}
```

**Lines of code added to route: 0 lines**

### Parts List - List Component

**File: `src/components/parts/part-list.tsx`**

```typescript
// WITH DIRECT NAVIGATION
interface PartListProps {
  searchTerm?: string;
  onSelectPart?: (partId: string) => void;
  onCreatePart?: () => void;
}

export function PartList({ searchTerm = '', onSelectPart, onCreatePart }: PartListProps) {
  // REMOVE: const navigate = useNavigate();
  // REMOVE: handleSearchChange (5 lines)
  // REMOVE: handleClearSearch (3 lines)

  // ... filtering logic unchanged
  const filteredParts = useMemo(() => {
    if (!searchTerm.trim()) return parts;
    // ... filter by searchTerm
  }, [parts, searchTerm, typeMap]);

  const searchNode = (
    <DebouncedSearchInput
      searchTerm={searchTerm}
      routePath="/parts"
      placeholder="Search..."
      testIdPrefix="parts.list"
      // No preserveSearchParams needed for parts (simple case)
    />
  );

  // ... rest of component
}
```

**Lines of code removed from list component: ~8 lines**
**Lines of code added: ~5 lines**
**Net change: -3 lines**

---

## Complex Case: Kits (with status preservation)

### Callback Pattern

**Route: `src/routes/kits/index.tsx`**

```typescript
// CURRENT (already has callback)
function KitsOverviewRoute() {
  const navigate = Route.useNavigate();
  const { status, search } = Route.useSearch();

  const handleSearchChange = useCallback((nextSearch: string) => {
    if (nextSearch) {
      navigate({
        to: '/kits',
        search: (prev) => ({ ...prev, search: nextSearch }),
        replace: true,
      });
      return;
    }
    navigate({
      to: '/kits',
      search: () => ({ status }),
      replace: true,
    });
  }, [navigate, status]);

  return (
    <KitOverviewList
      status={status}
      searchTerm={search}
      onStatusChange={handleStatusChange}
      onSearchChange={handleSearchChange}  // Already exists
      onCreateKit={handleCreateKit}
      onOpenDetail={handleOpenDetail}
    />
  );
}
```

**Lines added: 0** (already has this pattern)

**List component: `src/components/kits/kit-overview-list.tsx`**

```typescript
// CURRENT (with inline debounce)
export function KitOverviewList({
  status,
  searchTerm,
  onStatusChange,
  onSearchChange,
  onCreateKit,
  onOpenDetail,
}: KitOverviewListProps) {
  // All this state + effects move to DebouncedSearchInput
  const [searchInput, setSearchInput] = useState(searchTerm);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (debouncedSearch === searchTerm) return;
    onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange, searchTerm]);

  const { queries, buckets, counts } = useKitsOverview(debouncedSearch);

  const searchActive = debouncedSearch.trim().length > 0;

  useListLoadingInstrumentation({
    scope: 'kits.overview',
    // ... metadata includes debouncedSearch
    searchTerm: searchActive ? debouncedSearch : null,
  });

  const handleSearchInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    onSearchChange('');
  }, [onSearchChange]);

  const searchNode = (
    <div className="relative" data-testid="kits.overview.search">
      <Input
        value={searchInput}
        onChange={handleSearchInputChange}
        placeholder="Search kits..."
        className="w-full pr-9"
        data-testid="kits.overview.search.input"
      />
      {searchInput && (
        <button onClick={handleClearSearch} /* ... */>
          <ClearButtonIcon />
        </button>
      )}
    </div>
  );

  // ... rest
}

// WITH CALLBACK PATTERN + REUSABLE COMPONENT
export function KitOverviewList({
  status,
  searchTerm,
  onStatusChange,
  onSearchChange,
  onCreateKit,
  onOpenDetail,
}: KitOverviewListProps) {
  // REMOVE: All local state (searchInput, debouncedSearch)
  // REMOVE: Both useEffects (11 lines total)
  // REMOVE: handleSearchInputChange (3 lines)
  // REMOVE: handleClearSearch (4 lines)
  // REMOVE: searchNode JSX (20 lines)

  // Keep query using searchTerm from URL (not debouncedSearch)
  const { queries, buckets, counts } = useKitsOverview(searchTerm);

  const searchActive = searchTerm.trim().length > 0;

  useListLoadingInstrumentation({
    scope: 'kits.overview',
    // Use searchTerm from URL (already debounced)
    searchTerm: searchActive ? searchTerm : null,
  });

  const searchNode = (
    <DebouncedSearchInput
      searchTerm={searchTerm}
      placeholder="Search kits..."
      testIdPrefix="kits.overview"
      onSearchChange={onSearchChange}
    />
  );

  // ... rest unchanged
}
```

**Lines removed from list component: ~38 lines**
**Lines added: ~7 lines**
**Net change: -31 lines**

**IMPORTANT CHANGE**: Component now uses `searchTerm` (from URL) instead of `debouncedSearch` for queries and instrumentation. This works because:
1. `DebouncedSearchInput` handles debouncing internally
2. By the time URL updates, debounce has already completed
3. Query refetches when URL `searchTerm` changes (which happens after debounce)

### Direct Navigation Pattern

**Route: `src/routes/kits/index.tsx`**

```typescript
// WITH DIRECT NAVIGATION (remove callback)
function KitsOverviewRoute() {
  const navigate = Route.useNavigate();
  const { status, search } = Route.useSearch();

  // REMOVE: handleSearchChange (entire function, ~18 lines)

  return (
    <KitOverviewList
      status={status}
      searchTerm={search}
      onStatusChange={handleStatusChange}
      // REMOVE: onSearchChange prop
      onCreateKit={handleCreateKit}
      onOpenDetail={handleOpenDetail}
    />
  );
}
```

**Lines removed: ~20 lines** (callback + prop)

**List component: `src/components/kits/kit-overview-list.tsx`**

```typescript
export function KitOverviewList({
  status,
  searchTerm,
  onStatusChange,
  // REMOVE: onSearchChange prop
  onCreateKit,
  onOpenDetail,
}: KitOverviewListProps) {
  // REMOVE: Same as callback pattern (~38 lines)

  const { queries, buckets, counts } = useKitsOverview(searchTerm);
  const searchActive = searchTerm.trim().length > 0;

  useListLoadingInstrumentation({
    scope: 'kits.overview',
    searchTerm: searchActive ? searchTerm : null,
  });

  const searchNode = (
    <DebouncedSearchInput
      searchTerm={searchTerm}
      routePath="/kits"
      placeholder="Search kits..."
      testIdPrefix="kits.overview"
      preserveSearchParams={(current) => ({
        status: current.status as KitStatus
      })}
    />
  );

  // ... rest
}
```

**Lines removed: ~38 lines**
**Lines added: ~9 lines** (component with preserveSearchParams)
**Net change: -29 lines**

---

## Trade-off Summary

| Aspect | Callback Pattern | Direct Navigation |
|--------|------------------|-------------------|
| **Parent component complexity** | Slightly more (needs callback in route) | Slightly less (no route callback) |
| **Route component LOC** | +6 lines (parts), +0 (kits already has it) | -20 lines (kits removes callback) |
| **List component LOC** | -31 lines (kits), ~0 (parts) | -29 lines (kits), -3 (parts) |
| **Component reusability** | High (no router coupling) | Lower (requires TanStack Router) |
| **Type safety** | High (typed callbacks) | Lower (preserveSearchParams uses Record<string, unknown>) |
| **Separation of concerns** | Route owns navigation | Component owns navigation |
| **State accessibility** | Easy (route has full control) | Hard (preserveSearchParams callback needed) |
| **Instrumentation** | Simple (uses URL searchTerm) | Simple (uses URL searchTerm) |
| **Test determinism** | Callback is synchronous | Navigate is async (minor risk) |

---

## Recommendation

For **simple lists** (parts, boxes, sellers): Direct navigation saves **~3-5 lines** total but couples component to router.

For **complex lists** (kits with status tabs): Both approaches save **~30 lines** in list component. Callback adds **6 lines** to route (if not already present), direct navigation removes **~20 lines** from route. Net savings: **~24 lines** (callback) vs. **~50 lines** (direct navigation).

**However**: Direct navigation's complexity is hidden in:
1. The `preserveSearchParams` implementation (requires route-specific logic, no type safety)
2. Component coupling to TanStack Router (reduces portability)
3. Race condition potential (component navigation + React lifecycle timing)

**Suggested middle ground**: Use callback pattern but keep the handler simple:

```typescript
// In route - one-liner callback for simple cases
const handleSearchChange = useCallback((search: string) => {
  navigate({ to: '/parts', search: search ? { search } : {}, replace: true });
}, [navigate]);

// In route - slightly more complex for param preservation (kits)
const handleSearchChange = useCallback((search: string) => {
  navigate({
    to: '/kits',
    search: search ? { status, search } : { status },
    replace: true
  });
}, [navigate, status]);
```

This keeps routes under **10 extra lines** while maintaining separation of concerns and type safety.
