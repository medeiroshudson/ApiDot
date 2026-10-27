# Canonical Input with Auto-grow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a canonical, reusable `Input` component supporting dynamic `autoGrow` under focus and integrate it into `RequestEditor` to provide full visibility and editing for long URLs on notebook screens.

**Architecture:** Implement `frontend/src/components/common/Input.tsx` as a polymorphic component using React's `forwardRef` supporting `HTMLInputElement | HTMLTextAreaElement`. In default mode (`autoGrow=false`), it renders a standard styled `<input>`. In `autoGrow=true` mode, it renders a `<textarea rows={1}>` that starts at 36px (`min-h-[36px]`), expands elastically under focus/input up to `maxRows` (default 3 / ~84px) with `break-all`, collapses to 36px on blur, suppresses newline creation on `Enter` (calling parent `onKeyDown`), and sanitizes pasted newlines. Finally, integrate `Input` into `RequestEditor.tsx` for the request URL, maintaining top alignment with Method selector and Send button.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-27-url-autogrow-input-design.md`

## Global Constraints

- Preserve dark mode aesthetic matching ApiDot (`bg-neutral-900/90`, `border-neutral-700/80`, focus ring `blue-500/30`, error border `rose-500`).
- When `autoGrow=true`, `Enter` must trigger parent submission handlers without inserting `\n` into the text value.
- Ref forwarding must seamlessly accept `React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>` for `RequestAutocomplete` compatibility.
- Method selector and Send button in `RequestEditor` must remain anchored at 36px height with top alignment (`items-start`).
- All existing tests in `RequestEditor.test.tsx` and `RequestAutocomplete.test.tsx` must pass without regressions.

## Review Focus

- Default mode (`autoGrow=false` or omitted) renders an `<input>` element with standard height and attributes.
- AutoGrow mode (`autoGrow=true`) renders a `<textarea rows={1}>` with 36px resting height.
- AutoGrow mode expands up to 3 lines (max-height ~84px) upon receiving focus and collapses to 36px upon blur.
- Pressing `Enter` in the autoGrow input triggers the `onKeyDown` callback (e.g. `handleSend`) while preventing `\n` insertion.
- Pasting multi-line content into the autoGrow input sanitizes `\r\n` and `\n` into continuous text.

---

### Task 1: Canonical Input Component with Auto-grow

**Files:**
- Create: `frontend/src/components/common/Input.tsx`
- Test: `frontend/src/components/common/Input.test.tsx`

**Interfaces:**
- Consumes: React standard input/textarea attributes, Tailwind utility classes.
- Produces: `Input` component with `InputProps`:
  ```typescript
  export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
    autoGrow?: boolean;
    maxRows?: number;
    error?: boolean;
    textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
  }
  ```

- [ ] **Step 1: Write the failing tests in `frontend/src/components/common/Input.test.tsx`**

```tsx
import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders standard <input> when autoGrow is false or omitted', () => {
    render(<Input placeholder="Enter URL" />);
    const input = screen.getByPlaceholderText('Enter URL');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveClass('h-9');
  });

  it('renders <textarea rows={1}> when autoGrow is true', () => {
    render(<Input autoGrow placeholder="Enter long URL" />);
    const textarea = screen.getByPlaceholderText('Enter long URL');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('rows', '1');
  });

  it('applies expanded styling on focus and collapses on blur when autoGrow is true', () => {
    render(<Input autoGrow placeholder="Auto grow input" />);
    const textarea = screen.getByPlaceholderText('Auto grow input');

    expect(textarea).not.toHaveClass('max-h-[84px]');
    fireEvent.focus(textarea);
    expect(textarea).toHaveClass('max-h-[84px]');
    fireEvent.blur(textarea);
    expect(textarea).not.toHaveClass('max-h-[84px]');
  });

  it('prevents default newline insertion when Enter is pressed in autoGrow mode', () => {
    const onKeyDown = vi.fn();
    render(<Input autoGrow onKeyDown={onKeyDown} placeholder="Press enter" />);
    const textarea = screen.getByPlaceholderText('Press enter');

    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown.mock.calls[0][0].defaultPrevented).toBe(true);
  });

  it('sanitizes line breaks from pasted content in autoGrow mode', () => {
    const onChange = vi.fn();
    render(<Input autoGrow onChange={onChange} placeholder="Paste test" />);
    const textarea = screen.getByPlaceholderText('Paste test');

    fireEvent.change(textarea, { target: { value: 'https://api.com\n/endpoint\r\n?v=1' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe('https://api.com/endpoint?v=1');
  });

  it('forwards ref correctly to the rendered element in both modes', () => {
    const inputRef = createRef<HTMLInputElement>();
    const { unmount } = render(<Input ref={inputRef} placeholder="Ref standard" />);
    expect(inputRef.current?.tagName).toBe('INPUT');
    unmount();

    const textareaRef = createRef<HTMLTextAreaElement>();
    render(<Input autoGrow ref={textareaRef} placeholder="Ref autoGrow" />);
    expect(textareaRef.current?.tagName).toBe('TEXTAREA');
  });

  it('applies error ring styling when error prop is true', () => {
    render(<Input error placeholder="Error state" />);
    const input = screen.getByPlaceholderText('Error state');
    expect(input).toHaveClass('border-rose-500');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/components/common/Input.test.tsx`
Expected: FAIL with "Cannot find module './Input'"

- [ ] **Step 3: Implement `frontend/src/components/common/Input.tsx`**

Implement `Input` with `forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>`:
- When `!autoGrow`: render `<input ref={ref as React.Ref<HTMLInputElement>} className={...} {...rest} />`.
- When `autoGrow`: render `<textarea ref={ref as React.Ref<HTMLTextAreaElement>} rows={1} ... />`.
  - State: `isFocused` via `onFocus` and `onBlur`.
  - In `onKeyDown`: if `e.key === 'Enter'`, call `e.preventDefault()`, then forward to `props.onKeyDown?.(e)`.
  - In `onChange`: if value contains `[\r\n]`, sanitize via `.replace(/[\r\n]+/g, '')` before triggering `props.onChange`.
  - Base classes: `min-h-[36px] py-2 pl-3 pr-8 text-xs sm:text-sm bg-neutral-900/90 border rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed break-all resize-none leading-snug`.
  - Expanded classes when `isFocused`: `max-h-[84px] overflow-y-auto border-blue-500 ring-1 ring-blue-500/30`.
  - Resting classes when `!isFocused`: `max-h-[36px] overflow-hidden truncate border-neutral-700/80 hover:border-neutral-600`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test -- src/components/common/Input.test.tsx`
Expected: PASS (all 7 tests passing)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/Input.tsx frontend/src/components/common/Input.test.tsx
git commit -m "feat(frontend): create canonical Input component with autoGrow support"
```

---

### Task 2: Integrate Canonical Input into RequestEditor

**Files:**
- Modify: `frontend/src/components/request/RequestEditor.tsx:480-545`
- Modify: `frontend/src/components/request/RequestEditor.test.tsx`

**Interfaces:**
- Consumes: `Input` from `../common/Input`, `RequestAutocomplete`
- Produces: Enhanced URL bar with top-aligned controls and autoGrow textarea input

- [ ] **Step 1: Write the failing tests in `RequestEditor.test.tsx`**

Add tests verifying:
1. URL field renders with `autoGrow` behavior (renders textarea with `rows="1"` and `break-all`).
2. Method selector and Send button remain aligned to top (`items-start`).
3. Pressing Enter in the URL field triggers request dispatch without appending newlines.
4. Clear button (X) properly clears the URL in the autoGrow input.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/components/request/RequestEditor.test.tsx`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Integrate `Input` with `autoGrow` into `RequestEditor.tsx`**

1. Import `Input` from `../common/Input`.
2. Update `urlInputRef`:
   ```typescript
   const urlInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
   ```
3. Update top bar container in `RequestEditor.tsx`:
   - Change `flex items-center gap-2 flex-1 min-w-0` to `flex items-start gap-2 flex-1 min-w-0`.
4. Replace `<input ref={urlInputRef} ... />` with:
   ```tsx
   <Input
     ref={urlInputRef}
     autoGrow
     aria-label="URL da requisição"
     placeholder="https://api.exemplo.com/v1/recurso"
     value={url}
     disabled={isLoading}
     error={!!urlError}
     onFocus={() => {
       setActiveArea('url');
       setCursorCoords(null);
     }}
     onChange={(e) => handleUrlChange(e.target.value)}
     onKeyDown={(e) => {
       if (e.key === 'Enter' && !e.defaultPrevented) {
         e.preventDefault();
         handleSend();
       }
     }}
     aria-invalid={!!urlError}
     aria-describedby={urlError ? 'url-error' : undefined}
     className="w-full"
   />
   ```
5. Ensure the clear button (`X`) remains positioned at `top-2.5` or `top-4` (aligned with the first line of the input).

- [ ] **Step 4: Run tests to verify all pass**

Run:
```bash
npm --prefix frontend test -- src/components/request/RequestEditor.test.tsx src/components/request/RequestAutocomplete.test.tsx
```
Expected: PASS (all tests passing)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/request/RequestEditor.tsx frontend/src/components/request/RequestEditor.test.tsx
git commit -m "feat(frontend): integrate autoGrow Input for URL editing in RequestEditor"
```

---

### Task 3: Full Frontend Test Suite and Build Verification

**Files:**
- Entire frontend test suite and build output

- [ ] **Step 1: Run the full Vitest suite**

Run: `npm --prefix frontend test`
Expected: All test suites pass cleanly.

- [ ] **Step 2: Run Next.js build validation**

Run: `npm --prefix frontend run build`
Expected: Production build compiles with zero TypeScript or lint errors.

- [ ] **Step 3: Commit documentation & final clean-up**

```bash
git add docs/plans/2026-10-27-url-autogrow-input.md docs/plans/2026-10-27-url-autogrow-input-design.md
git commit -m "docs: add design and implementation plan for autoGrow URL input"
```
