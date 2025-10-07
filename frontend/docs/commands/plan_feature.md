We're going to implement a new feature. The user has provided a description of the feature. Your job is to plan this out.

**Deliverable:** Always create a new plan document under `docs/features/<FEATURE>/plan.md`. Replace `<FEATURE>` with a concise snake_case name (max five words). Do not modify briefs, epics, or phase guides you use for context; the plan must live in its own file.

Follow these steps:

1. Create a technical plan that describes the feature the user wants to build.
2. Research the files and functions that need to be changed to implement the feature.
3. Avoid any product manager style sections like success criteria, timelines, migration steps, etc.
4. Avoid writing any code in the plan.
5. Include specific and verbatim details from the user's prompt to ensure the plan is accurate.
6. Call out the Playwright coverage that will exercise every new piece of functionality. Enumerate the end-to-end scenarios, reference required instrumentation, and note any backend coordination needed. Every new behavior must ship with deterministic Playwright tests—no functionality is considered complete without it.
7. When the feature touches existing UI surfaces, cite the relevant guidance in `docs/contribute/ui/` and describe only the deltas from those patterns.

The result is strictly a technical requirements document that contains the following information:

- Brief description to give context at the top.
- List of all relevant files and functions that need to be created or modified.
- Step-by-step explanation of any algorithms that are used.
- Enumerated Playwright scenarios covering the new functionality, including instrumentation or backend hooks required to keep tests backend-driven (see `docs/contribute/testing/playwright_developer_guide.md`).
- If the feature is especially large, identify phases in which the feature can be implemented.
- Plans that touch Playwright coverage must state how tests remain backend-driven (no `page.route`/`mockSSE`) and call out required backend/test instrumentation under a **Blocking Issues** section.

If the user's requirements are unclear, especially after researching the relevant files, ask clarifying questions before writing the plan. Incorporate the user's answers into the plan.

Be concise and precise first. Make the plan as tight as possible without losing any critical details from the user's requirements.

When you are ready to write the plan, create the file at `docs/features/<FEATURE>/plan.md` (same `<FEATURE>` rules as above) and write the full plan there—never in the source brief.
