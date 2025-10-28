# UI Component Refactoring Workflow

## Overview

This document describes an automated, iterative workflow for reducing CSS class soup by extracting reusable UI components into `src/components/ui/`. The goal is to centralize all styling in generic UI components, leaving domain-specific components free of styling classes.

## Principles

1. **Encapsulation**: All styling lives in `components/ui`. Reusable components do NOT expose `className` props.
2. **Generic Design**: UI components must be domain-agnostic. No kit-specific or shopping-list-specific logic in `components/ui`.
3. **Pragmatic Standardization**: Minor visual differences (padding, spacing) across similar components are acceptable casualties. Standardize using common sense.
4. **Single Component per Iteration**: Each workflow run targets exactly one well-defined component type.
5. **Unattended Execution**: The workflow should complete without user intervention for typical refactoring work.

## Workflow Steps

### 1. Identify a Component

Pick a single, clearly specified component to extract. Examples:
- Link chips (e.g., kit links, shopping list links)
- Status badges
- Action buttons with icons
- Form input wrappers
- Card containers

**Selection Criteria**:
- Does NOT require multiple existing usages (can be a single usage if it's a clear pattern)
- MUST be designed generically enough to avoid domain coupling
- Should have clear visual/behavioral boundaries

### 2. Create a Plan

Use the `feature-planner` agent to create a detailed implementation plan:

```
Use the Task tool with the feature-planner agent to create a plan for extracting [COMPONENT_NAME] into a reusable UI component in src/components/ui/.

The plan should:
- Identify all current usages of this pattern in the codebase
- Specify the component API (props, variants, etc.)
- Detail the styling that will be encapsulated
- Outline the refactoring steps for each usage
- Include Playwright test updates if the component has test coverage
- Address any visual standardization decisions

Since this is technical debt work, resolve all questions autonomously. Accept minor visual differences as acceptable losses for consistency.
```

The plan will be saved to `plan.md`.

### 3. Review the Plan

Use the `plan-reviewer` agent to validate the plan:

```
Use the Task tool with the plan-reviewer agent to review the plan at plan.md.

Apply the output to improve the plan. If significant changes are needed, run the plan-reviewer again to validate the updated plan.
```

**Iteration Rule**: If the review suggests substantial changes, update the plan and re-review. Repeat until the plan passes review without major concerns.

### 4. Execute the Plan

Implement the plan step by step:
- Create the new UI component in `src/components/ui/`
- Refactor existing usages to use the new component
- Remove old styling classes from domain components
- Update tests if applicable
- Ensure TypeScript strict mode passes

Follow the existing patterns in `components/ui/` for component structure and naming.

### 5. Perform Code Review

Use the `commit-code-reviewer` agent to review the changes after committing:

```
Use the Task tool with the commit-code-reviewer agent to review the changes in the most recent commit(s) against the plan at plan.md.

The agent should verify:
- Styling is properly encapsulated in the UI component
- No className props are exposed on the new component
- Domain components no longer contain styling classes
- The component is generic and domain-agnostic
- Tests are updated appropriately

Apply any suggested improvements. If substantial issues are found, run the code-reviewer again after fixes.
```

**Important**: Commit your work BEFORE running the code reviewer. The agent reviews committed changes.

### 6. Verify Quality

Run the full verification suite:

```bash
# Type checking, linting, and build
pnpm check

# Playwright test suite (headless by default)
pnpm playwright test
```

Fix any failures:
- **Type errors**: Ensure all props are correctly typed
- **Lint errors**: Follow the project's style guidelines
- **Test failures**: Update selectors or assertions if the refactoring changed DOM structure

## Completion Criteria

The workflow is complete when:
- [ ] New UI component exists in `src/components/ui/`
- [ ] All identified usages are refactored
- [ ] No styling classes remain in domain components (for this pattern)
- [ ] The UI component does NOT expose `className` prop
- [ ] `pnpm check` passes
- [ ] All Playwright tests pass
- [ ] Code has been committed and reviewed

## Abort Conditions

Abort and request user intervention if:
- The component requires domain-specific logic that cannot be generalized
- Visual differences are too significant to standardize without design input
- Test failures indicate functional regressions beyond styling changes
- The component's API becomes too complex or unclear

## Example Invocation

To execute one iteration of this workflow:

```
Follow docs/ui_component_workflow.md to extract a reusable UI component. Pick a component, plan it, review the plan, execute it, review the code, and verify everything passes. Complete the entire workflow unattended unless intervention is required.
```

## Notes

- **Incremental Progress**: Each run handles one component type. Repeat this workflow until all styling is centralized.
- **Loss of Customization**: Minor visual standardization is expected and acceptable.
- **Test-Driven**: Update Playwright tests alongside UI changes to maintain coverage.
- **Documentation**: The generated `plan.md` and `code_review.md` serve as audit trails for each iteration.

## Related Documentation

- `CLAUDE.md` — Project instructions and verification requirements
- `docs/contribute/architecture/application_overview.md` — Architecture patterns
- `docs/commands/plan_feature.md` — Feature planning template
- `docs/commands/review_plan.md` — Plan review criteria
- `docs/commands/code_review.md` — Code review standards
