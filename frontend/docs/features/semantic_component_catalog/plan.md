# Semantic Component Catalog — Technical Plan

## 0) Research Log & Findings

**Search methodology**
- Reviewed existing UI component patterns in `src/components/ui/`
- Examined card implementations across domains (sellers, types, boxes, kits, parts, shopping-lists)
- Studied dialog patterns and list view structures
- Reviewed docs/ui_component_workflow.md to understand the component extraction philosophy
- Analyzed ActionButtonGroup and other small components to understand granularity concerns

**Pattern discovery**
Found multiple categories of repeated high-level patterns:
- **Card patterns**: 10+ card components with similar header/content/action structures (seller-card, type-card, box-card, kit-card, part-card, overview-card, metrics-card, etc.)
- **Dialog patterns**: Multiple dialogs with similar structure (form dialogs, confirmation dialogs, multi-step dialogs)
- **List row patterns**: Repeated table/list row structures across different domains
- **Detail screen patterns**: Similar layouts for detail views (kit-detail, part-detail, pick-list-detail)
- **Form patterns**: Repeated form field groupings and validation patterns

**Key insight from user feedback**
User expressed concern that low-level components like ActionButtonGroup are too simple and create composition overhead. Preference is for higher-level abstractions that capture complete concepts (e.g., "grid tile card with actions" rather than composing Card + CardHeader + CardContent + ActionButtonGroup). This approach is already used successfully for dialogs and list views.

**Existing high-level abstractions**
- Dialog abstractions (referenced but need to examine)
- List view abstractions (referenced but need to examine)
- Individual card components (but no shared card abstraction)

## 1) Intent & Scope

**User intent**

Create a systematic catalog of high-level, semantic UI component opportunities across the codebase to establish a structured backlog for component extraction work. Focus on complete UI concepts that abstract entire patterns (like "grid tile card with actions") rather than low-level CSS or layout primitives.

**Prompt quotes**

"a higher level abstraction like 'card with buttons' that has a container for the buttons would make more sense"
"If you have such a higher level abstraction that abstracts a whole concept (grid tile with a bunch of options as an example), it saves you from having to create 10 components"
"We've created these for dialogs and list views"

**In scope**

- Systematic search for repeated high-level UI patterns across all domains (cards, dialogs, forms, lists, detail screens)
- Analysis of each pattern: semantic meaning, number of instances, complexity abstracted, API surface
- Prioritization framework based on impact (instances × complexity reduction)
- Creation of a structured backlog document with implementation recommendations
- Focus on semantic abstractions that answer "what is this?" not "how is this laid out?"

**Out of scope**

- Actual implementation of any components (this plan only catalogs opportunities)
- Low-level CSS/layout primitives (flex containers, spacing utilities, etc.)
- Single-use or highly domain-specific components
- Components that don't have clear semantic meaning
- Migration guides or implementation plans for specific components

**Assumptions / constraints**

- Higher-level abstractions are preferred over many small composable pieces
- Good abstractions have clear semantic names that describe what they are, not how they're styled
- Existing dialog and list view abstractions serve as reference patterns
- Target is patterns repeated 3+ times with substantial boilerplate reduction
- Components should encapsulate complete concepts, accepting configuration via props

## 2) Affected Areas & File Map

### Research areas (input for catalog)

- Area: `src/components/sellers/`, `src/components/types/`, `src/components/boxes/`, `src/components/kits/`, `src/components/parts/`, `src/components/shopping-lists/`
- Why: Card pattern analysis - identify repeated grid-tile card structures
- Evidence: Multiple *-card.tsx files exist in each domain directory

- Area: `src/components/*/dialogs/` and dialog-related files
- Why: Dialog pattern analysis - understand existing dialog abstractions and identify gaps
- Evidence: Dialog patterns mentioned as existing high-level abstractions

- Area: `src/routes/*/` files with table/list rendering
- Why: List view pattern analysis - understand existing list abstractions
- Evidence: List view patterns mentioned as existing high-level abstractions

- Area: `src/components/kits/kit-detail.tsx`, `src/components/parts/part-detail.tsx`, `src/components/pick-lists/pick-list-detail.tsx`
- Why: Detail screen pattern analysis - identify repeated layout structures
- Evidence: Multiple *-detail.tsx files across domains

- Area: Form components across all domains
- Why: Form pattern analysis - identify repeated form field groupings
- Evidence: Form screens and dialogs throughout the application

### Output artifact

- Area: `docs/features/semantic_component_catalog/catalog.md`
- Why: Primary deliverable - structured catalog of component opportunities
- Evidence: New file to be created

- Area: `docs/features/semantic_component_catalog/prioritized_backlog.md`
- Why: Prioritized implementation backlog with recommendations
- Evidence: New file to be created

## 3) Data Model / Contracts

### Component Opportunity Entry

- Entity / contract: Component opportunity catalog entry
- Shape:
```typescript
{
  name: string;                    // Semantic component name (e.g., "GridTileCard")
  category: string;                // "Card" | "Dialog" | "Form" | "List" | "Detail Screen"
  semanticMeaning: string;         // What this component represents
  instanceCount: number;           // How many times pattern appears
  files: string[];                 // List of files with instances
  commonPattern: string;           // Description of the repeated pattern
  proposedAPI: object;             // Sketch of props interface
  complexityReduction: "Low" | "Medium" | "High";
  priority: number;                // Calculated from instances × complexity
  implementationNotes: string;     // Key considerations
}
```
- Mapping: N/A - this is a planning document structure, not runtime data
- Evidence: Derived from component extraction workflow requirements

## 4) API / Integration Surface

N/A - This is a research and cataloging effort with no API integration. The catalog itself is a static Markdown document.

## 5) Algorithms & UI Flows

### Pattern Discovery Flow

- Flow: Identify and catalog component opportunities
- Steps:
  1. Search codebase for files matching pattern categories (cards, dialogs, forms, lists, detail screens)
  2. For each category, read and analyze 3-5 representative files
  3. Identify common structural patterns (what repeats across instances)
  4. Extract semantic meaning (what is this UI element conceptually)
  5. Count total instances of the pattern
  6. Sketch proposed component API (props that would encapsulate the pattern)
  7. Assess complexity reduction (how much boilerplate eliminated)
  8. Calculate priority score (instances × complexity weight)
  9. Document in catalog with evidence (file paths, line ranges)
- States / transitions: Sequential research process, no interactive UI
- Hotspots: Manual pattern analysis requires careful reading of each file
- Evidence: Research methodology derived from docs/ui_component_workflow.md

### Prioritization Flow

- Flow: Rank component opportunities by impact
- Steps:
  1. For each catalog entry, calculate impact score: instanceCount × complexityWeight
  2. complexityWeight: Low=1, Medium=3, High=5
  3. Sort entries by impact score descending
  4. Group into phases: Phase 1 (highest impact), Phase 2 (medium impact), Phase 3 (nice-to-have)
  5. For each phase, recommend implementation order based on dependencies
- States / transitions: Static calculation, no state management
- Hotspots: Subjective complexity assessment requires judgment
- Evidence: Prioritization approach aligns with workflow goal of highest ROI first

## 6) Derived State & Invariants

- Derived value: Priority score
  - Source: instanceCount (from file search) and complexityReduction (from manual analysis)
  - Writes / cleanup: None - static calculation for catalog document
  - Guards: complexityReduction must be one of Low/Medium/High
  - Invariant: Priority score = instanceCount × complexityWeight where complexityWeight ∈ {1, 3, 5}
  - Evidence: N/A - new calculation for this effort

- Derived value: Complexity reduction assessment
  - Source: Manual analysis of pattern - lines of boilerplate, number of child components, prop drilling depth
  - Writes / cleanup: None - documented in catalog entry
  - Guards: Assessment validated by comparing before/after component usage examples
  - Invariant: "High" complexity = 50+ lines of boilerplate per instance, "Medium" = 20-50 lines, "Low" = <20 lines
  - Evidence: Derived from existing component patterns (ActionButtonGroup is ~10 lines = Low)

- Derived value: Semantic category
  - Source: Component's role in the UI (Card, Dialog, Form, List, Detail Screen)
  - Writes / cleanup: None - categorical classification
  - Guards: Each component must fit clearly into one category
  - Invariant: Category must describe the semantic role, not the visual appearance or layout
  - Evidence: Categories align with existing component organization in src/components/ui/

## 7) State Consistency & Async Coordination

N/A - This is a research and documentation effort with no runtime state or async operations.

## 8) Errors & Edge Cases

- Failure: Pattern appears semantically similar but has subtle domain-specific differences
- Surface: Catalog entry may incorrectly group non-compatible patterns
- Handling: Document variations in implementationNotes; mark as "needs design decision" if unclear
- Guardrails: Read at least 3 instances of each pattern to verify consistency
- Evidence: Risk identified from ActionButtonGroup example - seemed general but user questioned its value

- Failure: Proposed API is too rigid or too flexible
- Surface: Catalog entry may suggest unimplementable or overly complex API
- Handling: Mark API as "sketch only - needs refinement during implementation"; focus on semantic concept
- Guardrails: Keep proposed APIs simple; defer complexity decisions to actual implementation
- Evidence: Planning documents are implementation-ready but allow for adjustment

- Failure: Miss legitimate opportunities by focusing only on file-name patterns
- Surface: Components with different names but similar semantic patterns might be missed
- Handling: Supplement file-name search with structural code search (e.g., grep for common JSX patterns)
- Guardrails: Use multiple search strategies per category
- Evidence: Initial FlexRow search found patterns by className rather than file structure

## 9) Observability / Instrumentation

N/A - This is a planning and research deliverable with no instrumentation requirements.

## 10) Lifecycle & Background Work

N/A - No runtime lifecycle or background work; this is a one-time research effort producing static documentation.

## 11) Security & Permissions

N/A - No security implications for cataloging component opportunities.

## 12) UX / UI Impact

N/A - This plan produces documentation, not user-facing changes. However, successful implementation of catalog items will improve developer experience and UI consistency.

## 13) Deterministic Test Plan

N/A - No automated tests required for research documentation. Validation occurs during subsequent implementation of catalog items when components are actually built and tested.

## 14) Implementation Slices

### Slice 1: Card pattern analysis

- Goal: Catalog all card-related component opportunities
- Touches:
  - Search for and analyze all *-card.tsx files
  - Identify grid-tile card patterns
  - Identify detail card patterns
  - Identify metrics/dashboard card patterns
  - Document in catalog with proposed GridTileCard API
- Dependencies: None

### Slice 2: Dialog pattern analysis

- Goal: Understand existing dialog abstractions and identify gaps
- Touches:
  - Review existing dialog patterns/components
  - Search for dialog usage across codebase
  - Identify patterns not yet abstracted
  - Document current state and any missing abstractions
- Dependencies: Slice 1 complete (parallel work acceptable)

### Slice 3: List/table pattern analysis

- Goal: Understand existing list abstractions and identify gaps
- Touches:
  - Review existing list view components
  - Search for table/list rendering patterns
  - Identify row component patterns
  - Document current state and any missing abstractions
- Dependencies: Slice 1 complete (parallel work acceptable)

### Slice 4: Form and detail screen analysis

- Goal: Catalog form and detail screen component opportunities
- Touches:
  - Analyze form field grouping patterns
  - Analyze detail screen layout patterns
  - Document opportunities if substantial patterns found
- Dependencies: Slices 1-3 complete (build context first)

### Slice 5: Prioritization and backlog creation

- Goal: Create prioritized implementation backlog
- Touches:
  - Calculate priority scores for all catalog entries
  - Sort and group into implementation phases
  - Write prioritized_backlog.md with recommendations
  - Add implementation sequence suggestions
- Dependencies: Slices 1-4 complete (need full catalog)

## 15) Risks & Open Questions

### Risks

- Risk: Catalog identifies too many low-value opportunities
- Impact: Backlog becomes overwhelming and distracts from high-impact work
- Mitigation: Apply strict filters - minimum 3 instances, minimum "Medium" complexity, clear semantic meaning; ruthlessly cut marginal cases

- Risk: Semantic meaning is ambiguous for some patterns
- Impact: Unclear whether to create abstraction or leave as domain-specific
- Mitigation: Document ambiguity in catalog; mark as "needs design decision"; focus on clear-cut cases for initial backlog

- Risk: Proposed APIs may not match actual implementation needs
- Impact: Catalog becomes outdated quickly if APIs are wrong
- Mitigation: Keep APIs at sketch level; emphasize semantic concept over exact prop structure; expect refinement during implementation

- Risk: Analysis is too shallow and misses important pattern variations
- Impact: Components get built that don't actually fit all instances
- Mitigation: Analyze at least 3-5 instances per pattern; document variations in implementationNotes; flag edge cases

### Open Questions

- Question: Should the catalog include metrics on current code duplication (total LOC that could be eliminated)?
- Why it matters: Quantitative metrics strengthen prioritization and ROI justification
- Owner / follow-up: Implementation decision - add if time permits and calculation is straightforward

- Question: Should we examine existing dialog/list abstractions in detail or just reference them as examples?
- Why it matters: Understanding working abstractions helps validate approach for new ones
- Owner / follow-up: Include in Slice 2/3 - understanding existing abstractions provides pattern template

- Question: What's the minimum instance count threshold - 3 or 5 or higher?
- Why it matters: Lower threshold = more catalog entries but potentially lower ROI items
- Owner / follow-up: Start with 3 instances minimum; flag 3-instance items as "borderline" in backlog

## 16) Confidence

Confidence: High — The research methodology is straightforward (search, analyze, document). The user has clearly articulated what they want (high-level semantic abstractions, not CSS primitives). Existing dialog/list abstractions provide reference patterns. Main uncertainty is completeness of the search, but multi-strategy approach (file patterns + structural search) mitigates that risk. Output is a planning document, so implementation risk is deferred to future work.
