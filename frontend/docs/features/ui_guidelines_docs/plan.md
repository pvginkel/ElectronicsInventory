# UI Guidelines Documentation Plan

## Brief Description
Create a documentation suite under `docs/contribute` that future feature plans can cite for "Consistency in the UX", "Consistency in the implementation", and "Leaner plans". The suite must catalog the primary UI archetypes the app currently uses (e.g., "a simpler one for types" and "a complex one like for parts") and prescribe detailed specifications for building and extending each pattern.

## Relevant Files and Functions
- `docs/contribute/index.md` (ensure new UI documentation is discoverable from the contributor hub).
- `docs/contribute/architecture/application_overview.md` (align the new guidance with the documented React 19 + TanStack Router/Query architecture).
- `docs/contribute/testing` (`index.md`, `playwright_developer_guide.md`) to cross-link any UI instrumentation expectations that plans should reuse.
- `src/components/types/TypeList.tsx`, `src/components/types/TypeForm.tsx`, `src/components/types/type-create-dialog.tsx` as the reference implementation for the simple "types" UI pattern.
- `src/components/parts/part-list.tsx`, `src/components/parts/part-form.tsx`, `src/components/parts/part-details.tsx`, `src/components/parts/stock/*` as the reference implementation for the complex "parts" UI pattern.
- `src/components/ui/*.tsx`, `src/components/layout/*` to document the shared building blocks and layout primitives that both archetypes rely on.
- `src/hooks`, `src/lib/api` (generated TanStack Query hooks) to document data-fetching conventions that should be referenced instead of ad hoc requests.

## Plan
### Phase 1 – Inventory Existing Patterns
1. Audit `src/components/types` and `src/components/parts` to enumerate view states, data dependencies, and shared subcomponents that define the simple versus complex archetypes.
2. Trace the supporting hooks (`src/hooks/**/*`), query keys, and mapping utilities to capture implementation guardrails the docs must reinforce.
3. Map relevant UX behaviors (dialogs, list interactions, bulk actions, AI flows) and note where instrumentation hooks (`isTestMode()`, analytics) already exist so the docs can call them out explicitly.

### Phase 2 – Define Documentation Structure
1. Propose a `docs/contribute/ui/` namespace with an `index.md` landing page that explains how contributors should mix-and-match the pattern docs when planning features.
2. Draft an outline for each pattern-specific document capturing:
   - Purpose and when to choose the pattern.
   - UX expectations (layouts, responsive behavior, empty/loaded/error states).
   - Implementation checklist (required components, hooks, state management, error handling).
   - Testing and instrumentation notes referencing existing Playwright policies.
3. Identify additional supporting docs that keep the suite modular, e.g., `docs/contribute/ui/forms.md` for shared form conventions and `docs/contribute/ui/data_display.md` for list/table standards.

### Phase 3 – Author Documentation
1. Write `docs/contribute/ui/index.md` with navigation, guidance on linking from plans, and explicit instructions to cite the pattern docs for technical details.
2. Write `docs/contribute/ui/patterns/type_catalog.md` documenting the "simpler one for types" archetype with concrete references to `TypeList`, `TypeForm`, and generated API usage.
3. Write `docs/contribute/ui/patterns/part_management.md` capturing the "complex one like for parts" archetype, covering multi-step flows, AI-assisted dialogs, and inventory interactions.
4. Write shared reference docs (e.g., `docs/contribute/ui/forms.md`, `docs/contribute/ui/data_display.md`) that centralize form and list guidelines reused by both archetypes.
5. Cross-link all new docs with the existing contributor materials (`architecture/application_overview.md`, testing guides) and ensure each document highlights which sections feature plans should cite.
6. Update `docs/commands/plan_feature.md` so plan authors are explicitly directed to reuse the new documentation and only describe feature-specific deltas.

### Phase 4 – Validation and Landing
1. Run `pnpm check` (or the relevant lint/docs tooling) if required to ensure no broken links or lint violations after adding docs.
2. Update `docs/contribute/index.md` (and any sidebars if applicable) so the new UI documentation appears alongside existing architecture/testing references.
3. Validate internal links and navigation within the new docs so contributors can traverse the suite from `docs/contribute/index.md` without dead ends.
4. Capture any improvements uncovered while drafting that should become new standards and fold them back into the documentation so it remains authoritative.
5. Circulate TODOs if additional backend instrumentation docs or design assets are needed, making clear they are out of scope so plans stay lean.

## Step-by-Step Guidance / Algorithms
- Documentation outline algorithm: (a) extract current behaviors from reference components, (b) categorize into pattern-specific versus shared guidance, (c) produce markdown with sections for UX, implementation, data, testing, and plan references, (d) validate cross-links.

## Open Questions
- Do we need to include designer-provided visual standards (colors, spacing) or strictly implementation/UX behavior? Await clarification if the existing design system docs must be folded in.
