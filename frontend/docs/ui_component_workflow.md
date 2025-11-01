# UI Component Refactoring Workflow

## Overview

This document describes an automated, iterative workflow for reducing CSS class soup by extracting reusable UI components into `src/components/ui/`. The goal is to centralize all styling in generic UI components, leaving domain-specific components free of styling classes.

## Principles

1. **Encapsulation**: All styling lives in `components/ui`. Reusable components do NOT expose `className` props.
2. **Generic Design**: UI components must be domain-agnostic. No kit-specific or shopping-list-specific logic in `components/ui`.
3. **Pragmatic Standardization**: Minor visual differences (padding, spacing) across similar components are acceptable casualties. Standardize using common sense.
4. **Single Component per Iteration**: Each workflow run targets exactly one well-defined component type.
5. **Unattended Execution**: The workflow should complete without user intervention for typical refactoring work.
6. **Aggressive Cleanup**: This is technical debt elimination. Make breaking changes. Remove `className` props completely—do NOT keep them as deprecated or no-op parameters. Let TypeScript and tests catch all affected call sites. Fix breaking changes as they arise.

## Workflow Steps

### 0. Establish Feature Directory

**Before invoking any agents**, determine the feature directory path where all planning documents will be stored:

```
docs/features/<FEATURE_NAME>/
```

Where `<FEATURE_NAME>` is a snake_case identifier for the component being extracted (e.g., `link_chip_extraction`, `status_badge_refactor`).

Create this directory using `mkdir -p docs/features/<FEATURE_NAME>/` before proceeding.

**Document Paths**:
- Plan: `docs/features/<FEATURE_NAME>/plan.md`
- Plan Review: `docs/features/<FEATURE_NAME>/plan_review.md`
- Code Review: `docs/features/<FEATURE_NAME>/code_review.md`

You will provide these **explicit full paths** to every agent invocation in the following steps.

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

Use the `plan-writer` agent to create a detailed implementation plan:

```
Use the Task tool with the plan-writer agent to create a plan for extracting [COMPONENT_NAME] into a reusable UI component in src/components/ui/.

The plan should:
- Identify all current usages of this pattern in the codebase
- Specify the component API (props, variants, etc.) WITHOUT a className prop
- Detail the styling that will be encapsulated
- Outline the refactoring steps for each usage
- Include Playwright test updates if the component has test coverage
- Address any visual standardization decisions
- Plan to REMOVE className props from domain-specific wrappers completely (not deprecate, REMOVE)

Since this is technical debt work, resolve all questions autonomously. Accept minor visual differences as acceptable losses for consistency. Make breaking changes—do not attempt backward compatibility.

Write the plan to: docs/features/<FEATURE_NAME>/plan.md
```

**Important**: Provide the explicit full path to the plan file in your agent prompt (e.g., `docs/features/link_chip_extraction/plan.md`).

### 3. Review the Plan

Use the `plan-reviewer` agent to validate the plan:

```
Use the Task tool with the plan-reviewer agent to review the plan at docs/features/<FEATURE_NAME>/plan.md.

The review output will be written to: docs/features/<FEATURE_NAME>/plan_review.md

Apply the output to improve the plan. If significant changes are needed, run the plan-reviewer again to validate the updated plan.
```

**Important**: Provide explicit full paths to both the plan and plan review files in your agent prompt (e.g., `docs/features/link_chip_extraction/plan.md` and `docs/features/link_chip_extraction/plan_review.md`).

**Iteration Rule**: If the review suggests substantial changes, update the plan and re-review. Repeat until the plan passes review without major concerns.

### 4. Execute the Plan

The workflow to execute a plan and review the results is written up in `docs/plan_execution_workflow.md`. Use the workflow in that document to execute the plan you created.

## Completion Criteria

The workflow is complete when:
- [ ] Feature directory created at `docs/features/<FEATURE_NAME>/`
- [ ] New UI component exists in `src/components/ui/`
- [ ] All identified usages are refactored
- [ ] No styling classes remain in domain components (for this pattern)
- [ ] The UI component does NOT expose `className` prop
- [ ] Domain-specific wrappers do NOT have `className` props in their interfaces
- [ ] No call sites pass `className` props to the refactored components
- [ ] `pnpm check` passes with zero errors
- [ ] All Playwright tests pass
- [ ] Planning documents created in feature directory (`plan.md`, `plan_review.md`, `code_review.md`, `plan_execution_report.md`)
- [ ] Changes are ready for manual commit outside the sandbox

## Abort Conditions

Abort and request user intervention if:
- The component requires domain-specific logic that cannot be generalized
- Visual differences are too significant to standardize without design input
- Test failures indicate functional regressions beyond styling changes
- The component's API becomes too complex or unclear

## Example Invocation

To execute one iteration of this workflow:

```
Follow docs/ui_component_workflow.md to extract a reusable UI component.

First, establish the feature directory (e.g., docs/features/link_chip_extraction/).

Then, pick a component, create a plan with explicit paths, review the plan, execute it, review the code, and verify everything passes.

Provide explicit full paths to all planning documents (plan.md, plan_review.md, code_review.md, plan_execution_report.md) when working through the workflow.

Complete the entire workflow unattended unless intervention is required.
```

## Notes

- **Incremental Progress**: Each run handles one component type. Repeat this workflow until all styling is centralized.
- **Loss of Customization**: This is intentional. We are removing the ability to pass `className` props and other styling customizations. Visual standardization is a feature, not a bug. Components will look consistent across the application.
- **Breaking Changes Are Good**: Type errors from removed props are the mechanism for discovering all usages. Embrace them as a verification tool.
- **Test-Driven**: Update Playwright tests alongside UI changes to maintain coverage.
- **Documentation**: The generated `plan.md`, `code_review.md`, and `plan_execution_report.md` serve as audit trails for each iteration.
- **No Backward Compatibility**: Do not attempt to maintain backward compatibility by keeping deprecated props. Remove them completely and fix all breaking changes.

## Related Documentation

- `CLAUDE.md` — Project instructions and verification requirements
- `docs/plan_execution_workflow.md` — Plan execution and code review workflow
- `docs/contribute/architecture/application_overview.md` — Architecture patterns
- `docs/commands/plan_feature.md` — Feature planning template
- `docs/commands/review_plan.md` — Plan review criteria
- `docs/commands/code_review.md` — Code review standards
