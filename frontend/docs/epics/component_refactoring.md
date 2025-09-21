# React Component Review & Upgrade Guide

**Goal:** make every reusable component accept `data-*` (and all native) attributes, forward refs, and meet basic a11y—without breaking existing usage.

Applies to: React + TypeScript codebases (incl. shadcn/Radix-style components).

---

## 1) Principles (what “good” looks like)

1. **Forward all native props** of the rendered DOM element.

   * Prefer `React.ComponentPropsWithoutRef<'div'>` (or the actual tag) over hand-rolled prop lists.
2. **Forward a ref** to the underlying DOM element when it renders a single “root” node.
3. **A11y first**: render semantic elements; add `role`/`aria-*` only when truly needed.
4. **Prop precedence is explicit**: user props shouldn’t accidentally clobber critical internal behavior.
5. **Event handlers are composed**, not replaced (call user handler after internal logic).
6. **Class names are merged**, not overwritten (`cn`).
7. **Testing hooks**: prefer queries by role/name; when you must, standardize on `data-testid`.

---

## 2) The base pattern (apply to most components)

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

// 1) Choose the correct intrinsic element
type NativeDivProps = React.ComponentPropsWithoutRef<"div">;

// 2) Extend, don’t replace, and keep your own props in front
interface MyComponentProps extends NativeDivProps {
  // your custom props here, e.g. variant?: "default" | "success";
}

export const MyComponent = React.forwardRef<HTMLDivElement, MyComponentProps>(
  ({ className, onClick, style, children, ...props }, ref) => {
    // 3) Compose handlers when you add internal ones
    const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
      // internal logic...
      onClick?.(e);
    };

    // 4) Merge class and style (user style wins by default)
    const mergedStyle = { ...style /* user last, so it wins */ };

    return (
      <div
        ref={ref}
        {...props}                    // user-supplied attributes first…
        // (Critical a11y or enforced props go after spread, so *ours* win)
        className={cn("base-classes", className)}
        style={mergedStyle}
        onClick={handleClick}
      >
        {children}
      </div>
    );
  }
);
MyComponent.displayName = "MyComponent";
```

**Why this order?**

* `{...props}` first → we can **enforce** important props after (e.g., `role`, `aria-*`, `type="button"`).
* We **pluck** `className`, `style`, `onClick` to merge/compose safely.

---

## 3) A11y checklist per component

* Prefer the **semantic element**:

  * Button → `<button type="button">` (never a `<div>` with `role="button"` unless truly needed).
  * Link → `<a href>`, not `<div onClick>`.
  * Lists → `<ul><li>…</li></ul>`.
* **Progress-like** widgets: add `role="progressbar"` with `aria-valuemin/max/now` (omit when indeterminate).
* Inputs:

  * Connect **label** with `htmlFor` / `id` or wrap the input.
  * Announce errors with `aria-invalid` and `aria-describedby`.
* Dialogs:

  * Focus management typically lives in the overlay/focus-trap layer; label with `aria-labelledby`/`aria-describedby`.

> Rule of thumb: only reach for `role`/`aria-*` when the native element can’t express the semantics you need.

---

## 4) Prop precedence policy

* **Critical props (a11y/behavior)** must win:

  * Put `{...props}` **before** your enforced props:
    `return <div {...props} role="progressbar" aria-valuenow={value} />`
* **Class merging**: always merge with `cn("defaults", className)`.
* **Style merging**: prefer user style to win (they’re calling you):

  * `style={{ ...internal, ...style }}`
* **Handlers**: compose rather than overwrite:

  ```ts
  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    // internal behavior first or last depending on need
    props.onKeyDown?.(e);
  };
  ```

---

## 5) Polymorphic & “as” components (optional, for libraries)

When your component can render as different elements (e.g., `<Button as="a" href="…">`):

```tsx
type AsProp<E extends React.ElementType> = { as?: E };
type PolymorphicProps<E extends React.ElementType, P> =
  AsProp<E> &
  Omit<React.ComponentPropsWithoutRef<E>, keyof P | "as"> &
  P;

type ButtonOwnProps = { variant?: "solid" | "ghost" };

export const Button = React.forwardRef(
  <E extends React.ElementType = "button">(
    { as, className, children, ...props }: PolymorphicProps<E, ButtonOwnProps>,
    ref: React.Ref<React.ElementRef<E>>
  ) => {
    const Comp = as ?? "button";
    return (
      <Comp
        ref={ref}
        {...props}
        className={cn("btn-base", className)}
        {...(Comp === "button" ? { type: "button" as const } : null)}
      >
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";
```

* Still passes through `data-*`, ARIA, etc.
* Ensures `type="button"` when rendering a `<button>`.

---

## 6) Recipes for common patterns

### A) Simple wrappers (e.g., `DialogContent`)

* Convert to `forwardRef`.
* Use `ComponentPropsWithoutRef<'div'>`.
* Spread `{...props}` first; then enforce a11y if required (often none).
* Merge classes.

### B) Progress bar (includes a11y)

```tsx
type NativeDiv = React.ComponentPropsWithoutRef<"div">;
interface ProgressBarProps extends Omit<NativeDiv, "role" | "aria-valuemin" | "aria-valuemax" | "aria-valuenow"> {
  value: number;
  showLabel?: boolean;
  indeterminate?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "success" | "warning" | "error";
  ariaLabel?: string;
}

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ value, className, showLabel, indeterminate, ariaLabel, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    return (
      <div
        ref={ref}
        {...props}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : 100}
        aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
        aria-busy={indeterminate || undefined}
        className={cn("w-full", className)}
      >
        {/* bars… */}
        {showLabel && <div className="text-sm text-center">{indeterminate ? "…" : `${Math.round(clamped)}%`}</div>}
      </div>
    );
  }
);
```

### C) Inputs

```tsx
type InputProps = React.ComponentPropsWithoutRef<"input"> & {
  invalid?: boolean;
  endIcon?: React.ReactNode;
};

export const TextInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, endIcon, id, "aria-describedby": describedBy, ...props }, ref) => {
    const errorId = invalid ? `${id ?? "input"}-error` : undefined;
    return (
      <div className="relative">
        <input
          ref={ref}
          {...props}
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, errorId].filter(Boolean).join(" ") || undefined}
          className={cn("input-base", invalid && "ring-red-500", className)}
        />
        {endIcon && <span className="icon">{endIcon}</span>}
        {/* render error by id=errorId */}
      </div>
    );
  }
);
```

---

## 7) Test IDs: conventions & config

* Prefer queries by role/name in RTL/Playwright.
* If you need a test hook, standardize on **`data-testid`**.
* Playwright (optional): stick with default (`data-testid`). If your codebase uses `data-test`, set once:

  ```ts
  // playwright.config.ts
  import { defineConfig } from '@playwright/test';
  export default defineConfig({
    use: { testIdAttribute: 'data-test' }
  });
  ```

---

## 8) Audit checklist (repeat per component)

1. **Identify the root DOM element** (or decide polymorphism).
2. **Types**: replace custom `Props` with:

   * `type Native = React.ComponentPropsWithoutRef<'tag'>`
   * `interface Props extends Native { /* custom */ }`
   * `Omit<>` native fields you **must** control (e.g., `role`, `type`).
3. **Ref forwarding** (`React.forwardRef<Element, Props>`).
4. **Spread order**: `{...props}` first, then enforce critical props.
5. **Class/style/handlers**:

   * `className={cn(defaults, className)}`
   * `style={{ ...internal, ...style }}`
   * compose `onClick`, `onKeyDown`, etc.
6. **A11y**:

   * Use semantic HTML; add `role`/`aria-*` only as needed.
   * Ensure name/description (e.g., `aria-label`, `aria-labelledby`).
7. **Data attributes**:

   * Ensure the **rendered DOM** gets the spread (not a Fragment).
8. **Story/use examples** updated to show:

   * `data-testid` usage
   * Ref usage (focus/measure)
   * A11y examples

---

## 9) Code search to find candidates

### Unix (ripgrep)

```bash
# Components missing forwardRef
rg --glob 'src/**/*.{ts,tsx}' 'export function [A-Z]\w+\('

# Components that don’t extend intrinsic props
rg --glob 'src/**/*.{ts,tsx}' 'interface .*Props\s*{\n(?!.*extends .*ComponentPropsWithoutRef)'

# Places spreading is missing
rg --glob 'src/**/*.{ts,tsx}' '<[a-zA-Z]+\s[^>]*{\.{3}props}' -n --invert-match
```

### PowerShell

```powershell
# Rough equivalent searches
Select-String -Path "src\**\*.{ts,tsx}" -Pattern 'export function [A-Z]\w+\(' -AllMatches
```

---

## 10) Linting & tooling

* **ESLint**:

  * In a component library, disable `react/jsx-props-no-spreading` for `src/components/**`.
  * Enable a11y rules: `eslint-plugin-jsx-a11y`.
* **TypeScript strictness**:

  * `"strict": true`, `"noImplicitAny": true`, `"noUncheckedIndexedAccess": true`.
* **Optional**: add an ESLint rule or custom lint to block exporting components **without** `forwardRef` in `src/components/**` unless annotated with an escape hatch comment.

Example `.eslintrc.js` snippet:

```js
overrides: [
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "react/jsx-props-no-spreading": "off",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
    },
  },
]
```

---

## 11) Change management (do this at scale)

1. **Create a branch**: `refactor/forward-props-refs-a11y`.
2. **Batch by component families** (inputs, buttons, layout, feedback).
3. **Run typecheck and tests** after each batch.
4. **Visual QA** (spot-check stories/pages).
5. **Add or update stories/examples** demonstrating:

   * passing `data-testid`
   * forwarding `ref`
   * a11y (keyboard/focus/roles)
6. **Migration notes** in the PR:

   * Any `Omit<>` you enforced (breaking changes)
   * New ref API (if previously absent)

---

## 12) Quick “before → after” examples

### DialogContent (before)

```tsx
interface DialogContentProps { children: React.ReactNode; className?: string; }
export function DialogContent({ children, className = "" }: DialogContentProps) {
  return <div className={cn("p-6", className)}>{children}</div>;
}
```

**After**

```tsx
type NativeDiv = React.ComponentPropsWithoutRef<"div">;
interface DialogContentProps extends NativeDiv {}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} {...props} className={cn("p-6", className)}>
      {children}
    </div>
  )
);
DialogContent.displayName = "DialogContent";
```

### Button (semantic + enforced type)

```tsx
type NativeButton = React.ComponentPropsWithoutRef<"button">;
interface ButtonProps extends Omit<NativeButton, "type"> { variant?: "solid" | "ghost"; }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, ...props }, ref) => (
    <button ref={ref} {...props} type="button" className={cn("btn", className)}>
      {children}
    </button>
  )
);
```

---

## 13) Definition of Done (per component)

* [ ] Accepts all relevant native props + **`data-*`**; no TypeScript errors.
* [ ] Forwards **ref** to the root DOM element.
* [ ] Uses semantic HTML; a11y attributes/roles verified.
* [ ] Props are merged with correct precedence; handlers composed.
* [ ] Unit/story demonstrates `data-testid` working.
* [ ] No regression in visuals/interactions.

---

## 14) Notes on edge cases

* **Multiple root nodes**: if your component renders more than one DOM node, decide which one is the “ref/prop target”. If ambiguous, consider **named refs** (e.g., `inputRef`) instead of a single forwarded ref.
* **Conditional roots** (e.g., sometimes `<a>`, sometimes `<button>`): consider the **polymorphic** pattern (section 5).
* **Third-party wrappers** (Radix/HeadlessUI): most already forward refs—ensure you pass `{...props}` down to the actual DOM node (not the wrapper component) and don’t drop `data-*`.
