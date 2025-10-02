# Code Review – Phase 6

## Findings

1. **Major – Active nav styling regresses** (`src/components/layout/sidebar.tsx:79`) ✅
   - Supplying custom `activeProps` removes TanStack Router's default `className: 'active'`. As a result the `[&.active]` selectors never match, so the currently active link is no longer highlighted. **Resolution:** re-introduced the `active` class via `activeProps` while keeping the `data-active` and `aria-current` attributes.

2. **Minor – Invalid Tailwind width utility** (`src/components/layout/sidebar.tsx:36`) ✅
   - The collapsed branch applies `w-19`, which Tailwind doesn't generate out of the box. That leaves the sidebar width unstated when collapsed, causing inconsistent layout. **Resolution:** replaced the invalid token with Tailwind's `w-20` utility to restore the intended collapsed width.

## Notes
- The rest of the Phase 6 additions (mobile menu hooks, deployment CTA test, cross-domain workflow coverage, instrumentation docs) look aligned with the plan once the above fixes land.
