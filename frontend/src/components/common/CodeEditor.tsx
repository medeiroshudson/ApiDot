'use client';

import React, { useMemo, useCallback, useRef } from 'react';
import CodeMirror, {
  Extension,
  EditorView,
  Prec,
  keymap,
  oneDark,
  ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import { indentWithTab } from '@codemirror/commands';

export interface CursorCoordinates {
  left: number;
  top: number;
  bottom: number;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onCursorChange?: (
    coords: CursorCoordinates | null,
    pos: number,
    view?: EditorView
  ) => void;
  onSpecialKeyDown?: (key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape') => boolean;
  language?: 'json' | 'text';
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  testId?: string;
}

// Custom theme aligning CodeMirror with ApiDot dark neutral design tokens
const apiDotTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#121212',
      color: '#f5f5f5',
      fontSize: '13px',
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      borderRadius: '0.375rem',
      border: '1px solid #262626',
      height: '100% !important',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    '&.cm-focused': {
      outline: 'none',
      borderColor: '#3b82f6',
      boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.4)',
    },
    '.cm-scroller': {
      overflow: 'auto !important',
      fontFamily: 'inherit',
      flex: '1 1 0%',
      height: '100% !important',
      minHeight: '0 !important',
    },
    '.cm-content': {
      padding: '8px 4px',
      caretColor: '#60a5fa',
    },
    '.cm-line': {
      padding: '0 4px',
      lineHeight: '1.6',
    },
    '.cm-gutters': {
      backgroundColor: '#171717',
      color: '#737373',
      borderRight: '1px solid #262626',
      borderTopLeftRadius: '0.375rem',
      borderBottomLeftRadius: '0.375rem',
      fontSize: '11px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#262626',
      color: '#d4d4d4',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(59, 130, 246, 0.3) !important',
    },
    '.cm-lint-marker': {
      width: '10px',
      height: '10px',
    },
  },
  { dark: true }
);

// Safe JSON linter that skips linting when content is empty or whitespace
const safeJsonLinter = (view: EditorView) => {
  const doc = view.state.doc.toString().trim();
  if (!doc) return [];
  try {
    return jsonParseLinter()(view);
  } catch {
    return [];
  }
};

export function CodeEditor({
  value,
  onChange,
  onCursorChange,
  onSpecialKeyDown,
  language = 'json',
  placeholder = '',
  minHeight = '160px',
  maxHeight = '480px',
  readOnly = false,
  disabled = false,
  className = '',
  ariaLabel = 'Editor de Código',
  testId = 'code-editor',
}: CodeEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const extensions = useMemo<Extension[]>(() => {
    const list: Extension[] = [
      apiDotTheme,
      oneDark,
      keymap.of([indentWithTab]),
    ];

    if (language === 'json') {
      list.push(json());
      list.push(lintGutter());
      list.push(linter(safeJsonLinter));
    }

    if (onSpecialKeyDown) {
      list.push(
        Prec.highest(
          keymap.of([
            {
              key: 'ArrowDown',
              run: () => Boolean(onSpecialKeyDown('ArrowDown')),
            },
            {
              key: 'ArrowUp',
              run: () => Boolean(onSpecialKeyDown('ArrowUp')),
            },
            {
              key: 'Enter',
              run: () => Boolean(onSpecialKeyDown('Enter')),
            },
            {
              key: 'Escape',
              run: () => Boolean(onSpecialKeyDown('Escape')),
            },
          ])
        )
      );
    }

    if (onCursorChange) {
      list.push(
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head;
            try {
              const coords = update.view.coordsAtPos(pos);
              if (coords) {
                onCursorChange(
                  {
                    left: coords.left,
                    top: coords.top,
                    bottom: coords.bottom,
                  },
                  pos,
                  update.view
                );
              } else {
                onCursorChange(null, pos, update.view);
              }
            } catch {
              onCursorChange(null, pos, update.view);
            }
          }
        })
      );
    }

    return list;
  }, [language, onCursorChange, onSpecialKeyDown]);

  const handleChange = useCallback(
    (val: string) => {
      onChange?.(val);
    },
    [onChange]
  );

  return (
    <div
      data-testid={testId}
      className={`relative w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden ${className}`}
      aria-label={ariaLabel}
    >
      <CodeMirror
        ref={editorRef}
        value={value}
        onChange={handleChange}
        theme="none"
        extensions={extensions}
        placeholder={placeholder}
        height="100%"
        style={{ height: '100%', flex: '1 1 0%', minHeight: 0 }}
        minHeight={minHeight}
        maxHeight={maxHeight}
        readOnly={readOnly || disabled}
        editable={!readOnly && !disabled}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false, // We use custom RequestAutocomplete for variables & chaining
          rectangularSelection: false,
          crosshairCursor: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: false,
          lintKeymap: true,
        }}
      />
    </div>
  );
}
