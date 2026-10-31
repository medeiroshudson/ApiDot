import React, { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { Variable, Shuffle, Clock, Link2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { MethodBadge, HTTP_METHOD_BADGES, METHOD_COLORS } from '@/components/common/MethodBadge';

export interface AutocompleteVariable {
  key: string;
  value: string;
  scope?: string;
}

export interface AutocompleteRequest {
  id: string;
  name: string;
  method: string;
}

export interface SchemaPropertyItem {
  key: string;
  type: string;
  description?: string;
}

export interface CursorCoords {
  left: number;
  top: number;
  bottom: number;
}

export interface AutocompleteNavigationHandle {
  isOpen: boolean;
  onKeyDown: (key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape') => boolean;
}

export interface RequestAutocompleteProps {
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  navigationRef?: React.MutableRefObject<AutocompleteNavigationHandle | null>;
  value?: string;
  cursorCoords?: CursorCoords | null;
  cursorPos?: number;
  onChange?: (val: string, newCursor?: number) => void;
  availableVariables?: AutocompleteVariable[];
  availableRequests?: AutocompleteRequest[];
  schemaProperties?: SchemaPropertyItem[];
  className?: string;
  children?: React.ReactNode;
}

interface SuggestionItem {
  id: string;
  name: string;
  type: 'variable' | 'token' | 'request' | 'property';
  method?: string;
  detail?: string;
  scope?: string;
  propertyType?: string;
  description?: string;
}

export { HTTP_METHOD_BADGES, METHOD_COLORS };

export const SCHEMA_TYPE_BADGES: Record<string, string> = {
  string: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80',
  number: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
  integer: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
  boolean: 'text-purple-400 bg-purple-950/60 border-purple-800/80',
  object: 'text-blue-400 bg-blue-950/60 border-blue-800/80',
  array: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/80',
};

type AutocompleteContext =
  | {
      type: 'request';
      openPos: number;
      filter: string;
    }
  | {
      type: 'variable';
      openPos: number;
      filter: string;
    }
  | {
      type: 'property';
      openPos: number;
      hasQuote: boolean;
      filter: string;
    };

function isAfterColonInSegment(segment: string): boolean {
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if ((ch === '"' || ch === "'") && (i === 0 || segment[i - 1] !== '\\')) {
      if (!inQuote) {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === quoteChar) {
        inQuote = false;
      }
    } else if (ch === ':' && !inQuote) {
      return true;
    }
  }
  return false;
}

function getSegmentAfterLastDelimiter(textBefore: string): string {
  let inQuote = false;
  let quoteChar = '';
  let lastDelim = -1;
  for (let i = 0; i < textBefore.length; i++) {
    const ch = textBefore[i];
    if ((ch === '"' || ch === "'") && (i === 0 || textBefore[i - 1] !== '\\')) {
      if (!inQuote) {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === quoteChar) {
        inQuote = false;
      }
    } else if ((ch === '{' || ch === ',') && !inQuote) {
      lastDelim = i;
    }
  }
  return lastDelim !== -1 ? textBefore.slice(lastDelim + 1) : textBefore;
}

function getAutocompleteContext(
  text: string,
  cursorPos: number,
  hasSchemaProperties = false
): AutocompleteContext | null {
  const textBefore = text.slice(0, cursorPos);

  // 1. Check for variable/request interpolation {{ ...
  const lastOpen = textBefore.lastIndexOf('{{');
  if (lastOpen !== -1) {
    const content = textBefore.slice(lastOpen + 2);
    // If closing braces or newline exists between {{ and cursorPos, do not trigger
    if (!content.includes('}}') && !content.includes('\n')) {
      // Request chaining trigger: {{$request[
      const requestMatch = content.match(/^\$request\[(.*)$/);
      if (requestMatch) {
        const rawFilter = requestMatch[1]
          .replace(/^['"]/, '')
          .replace(/['"]$/, '')
          .toLowerCase()
          .trim();
        return {
          type: 'request' as const,
          openPos: lastOpen,
          filter: rawFilter,
        };
      }

      return {
        type: 'variable' as const,
        openPos: lastOpen,
        filter: content.toLowerCase().trim(),
      };
    }
  }

  // 2. Check for schema property context (inside JSON quotes, after ", or typing property name)
  if (hasSchemaProperties) {
    const currentSegment = getSegmentAfterLastDelimiter(textBefore);
    if (isAfterColonInSegment(currentSegment)) {
      // Cursor is on the value side of a property pair, do not autocomplete property keys
      return null;
    }

    const lastQuoteInSegment = currentSegment.lastIndexOf('"');
    if (lastQuoteInSegment !== -1) {
      const quotes = currentSegment.match(/(?<!\\)"/g) || [];
      if (quotes.length % 2 === 1) {
        const content = currentSegment.slice(lastQuoteInSegment + 1);
        if (!content.includes('\n')) {
          const segmentStart = textBefore.length - currentSegment.length;
          return {
            type: 'property' as const,
            openPos: segmentStart + lastQuoteInSegment + 1,
            hasQuote: true,
            filter: content.toLowerCase().trim(),
          };
        }
      }
    }

    // Bare property name without quotes (e.g. { cat or typing on blank line)
    const wordMatch = textBefore.match(/([a-zA-Z0-9_$-]+)$/);
    if (wordMatch) {
      const word = wordMatch[1];
      const wordStart = cursorPos - word.length;
      return {
        type: 'property' as const,
        openPos: wordStart,
        hasQuote: false,
        filter: word.toLowerCase().trim(),
      };
    }
  }

  return null;
}

export function RequestAutocomplete({
  inputRef,
  navigationRef,
  value = '',
  cursorCoords,
  cursorPos,
  onChange,
  availableVariables = [],
  availableRequests = [],
  schemaProperties = [],
  className = '',
  children,
}: RequestAutocompleteProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const getOptionId = (index: number) => `${baseId}-option-${index}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<number>(value.length);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const effectiveCursorPos = cursorPos !== undefined ? cursorPos : cursorPosition;

  const getTargetElement = useCallback((): HTMLInputElement | HTMLTextAreaElement | null => {
    if (inputRef?.current) return inputRef.current;
    if (containerRef.current) {
      return containerRef.current.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    }
    return null;
  }, [inputRef]);

  // Track cursor position from target element events
  const updateCursorFromElement = useCallback(() => {
    if (cursorPos !== undefined) return;
    const el = getTargetElement();
    if (el && el.selectionStart !== null && el.selectionStart !== undefined) {
      setCursorPosition(el.selectionStart);
    } else {
      setCursorPosition(value.length);
    }
  }, [cursorPos, getTargetElement, value.length]);

  // When value prop changes, re-evaluate cursor and undis-miss
  useEffect(() => {
    setIsDismissed(false);
    updateCursorFromElement();
  }, [value, updateCursorFromElement]);

  const hasSchemaProperties = Boolean(schemaProperties && schemaProperties.length > 0);

  // Parse trigger context
  const context = useMemo(() => {
    return getAutocompleteContext(value, effectiveCursorPos, hasSchemaProperties);
  }, [value, effectiveCursorPos, hasSchemaProperties]);

  // Generate suggestions based on context
  const suggestions = useMemo<SuggestionItem[]>(() => {
    if (!context) return [];

    if (context.type === 'property') {
      const items: SuggestionItem[] = [];
      schemaProperties.forEach((prop) => {
        if (!context.filter || prop.key.toLowerCase().includes(context.filter)) {
          items.push({
            id: prop.key,
            name: prop.key,
            type: 'property',
            propertyType: prop.type,
            detail: prop.description,
            description: prop.description,
          });
        }
      });
      return items;
    }

    if (context.type === 'request') {
      const filtered = availableRequests.filter((req) => {
        if (!context.filter) return true;
        return (
          req.name.toLowerCase().includes(context.filter) ||
          req.id.toLowerCase().includes(context.filter) ||
          req.method.toLowerCase().includes(context.filter)
        );
      });

      return filtered.map((req) => ({
        id: req.id,
        name: req.name,
        type: 'request' as const,
        method: req.method,
        detail: req.id,
      }));
    }

    // Normal variable autocomplete
    const items: SuggestionItem[] = [];

    // 1. Available user/environment/collection variables
    availableVariables.forEach((v) => {
      if (!context.filter || v.key.toLowerCase().includes(context.filter)) {
        items.push({
          id: v.key,
          name: v.key,
          type: 'variable' as const,
          detail: v.value ? `(${v.scope || 'var'}) ${v.value}` : v.scope || 'var',
          scope: v.scope,
        });
      }
    });

    // 2. Dynamic tokens: $guid, $timestamp, $request[...]
    const tokens: SuggestionItem[] = [
      {
        id: '$guid',
        name: '$guid',
        type: 'token' as const,
        detail: t('request.randomGuid'),
      },
      {
        id: '$timestamp',
        name: '$timestamp',
        type: 'token' as const,
        detail: t('request.currentTimestamp'),
      },
      {
        id: '$request[...]',
        name: '$request[...]',
        type: 'token' as const,
        detail: t('request.requestChaining'),
      },
    ];

    tokens.forEach((tok) => {
      if (!context.filter || tok.name.toLowerCase().includes(context.filter)) {
        items.push(tok);
      }
    });

    return items;
  }, [context, availableVariables, availableRequests, schemaProperties, t]);

  // Reset selectedIndex whenever context changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [context?.type, context?.filter]);

  // Scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const isOpen = !isDismissed && context !== null && suggestions.length > 0;
  const activeOptionId = isOpen && suggestions[selectedIndex] ? getOptionId(selectedIndex) : undefined;

  // Manage ARIA combobox attributes on the attached input/textarea
  useEffect(() => {
    const el = getTargetElement();
    if (!el) return;

    if (isOpen) {
      el.setAttribute('aria-expanded', 'true');
      el.setAttribute('aria-controls', listboxId);
      if (activeOptionId) {
        el.setAttribute('aria-activedescendant', activeOptionId);
      } else {
        el.removeAttribute('aria-activedescendant');
      }
    } else {
      el.setAttribute('aria-expanded', 'false');
      el.removeAttribute('aria-controls');
      el.removeAttribute('aria-activedescendant');
    }
  }, [getTargetElement, isOpen, listboxId, activeOptionId]);

  useEffect(() => {
    const el = getTargetElement();
    return () => {
      if (el) {
        el.removeAttribute('aria-expanded');
        el.removeAttribute('aria-controls');
        el.removeAttribute('aria-activedescendant');
      }
    };
  }, [getTargetElement]);

  // Dismissal on outside click / blur
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      const el = getTargetElement();
      if (el && el.contains(target)) return;
      if (containerRef.current && containerRef.current.contains(target)) return;

      setIsDismissed(true);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, getTargetElement]);

  const handleSelect = useCallback(
    (item: SuggestionItem) => {
      if (!context) return;
      const el = getTargetElement();
      const currentVal = value;

      if (context.type === 'property') {
        let prefix = '';
        let insertText = '';
        let suffix = currentVal.slice(effectiveCursorPos);

        // Consume any remaining word characters in suffix
        const wordTailMatch = suffix.match(/^[a-zA-Z0-9_$-]+/);
        if (wordTailMatch) {
          suffix = suffix.slice(wordTailMatch[0].length);
        }

        if (context.hasQuote) {
          // Inside quotes context: prefix ends with " (openPos is right after ")
          prefix = currentVal.slice(0, context.openPos);
          insertText = item.name;
        } else {
          // Bare property name context: openPos is start of identifier
          prefix = currentVal.slice(0, context.openPos);
          const hasColon = suffix.trimStart().startsWith(':');
          insertText = hasColon ? `"${item.name}"` : `"${item.name}": `;
        }

        const newValue = prefix + insertText + suffix;
        const newCursor = prefix.length + insertText.length;

        if (el) {
          el.value = newValue;
          el.setSelectionRange(newCursor, newCursor);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        setCursorPosition(newCursor);
        onChange?.(newValue, newCursor);
        setIsDismissed(true);
        return;
      }

      const prefix = currentVal.slice(0, context.openPos);
      let suffix = currentVal.slice(effectiveCursorPos);

      let insertText = '';
      let shouldStayOpen = false;

      const closeIndex = suffix.indexOf('}}');
      const nextOpen = suffix.indexOf('{{');
      const hasClose =
        closeIndex !== -1 &&
        (nextOpen === -1 || closeIndex < nextOpen) &&
        !suffix.slice(0, closeIndex).includes('\n');

      if (item.type === 'request') {
        insertText = `{{$request['${item.id}'].response.body.`;
        if (hasClose) {
          suffix = suffix.slice(closeIndex);
        }
      } else if (item.type === 'token' && item.id === '$request[...]') {
        insertText = `{{$request['`;
        shouldStayOpen = true;
        if (hasClose) {
          suffix = suffix.slice(closeIndex);
        }
      } else {
        insertText = `{{${item.id}}}`;
        if (hasClose) {
          // Cleanly replace until closing }} to avoid duplicate trailing tokens
          suffix = suffix.slice(closeIndex + 2);
        }
      }

      const newValue = prefix + insertText + suffix;
      const newCursor = prefix.length + insertText.length;

      if (el) {
        el.value = newValue;
        el.setSelectionRange(newCursor, newCursor);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      setCursorPosition(newCursor);
      onChange?.(newValue, newCursor);

      if (!shouldStayOpen) {
        setIsDismissed(true);
      }
    },
    [context, effectiveCursorPos, getTargetElement, onChange, value]
  );

  // Keydown and cursor event listeners on the active element
  useEffect(() => {
    const el = getTargetElement();
    if (!el) return;

    const handleKeyDown = (evt: Event) => {
      const e = evt as KeyboardEvent;
      if (!isOpen || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const selected = suggestions[selectedIndex];
        if (selected) {
          handleSelect(selected);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsDismissed(true);
      } else if (e.key === 'Tab') {
        setIsDismissed(true);
      }
    };

    const handleEventUpdate = () => {
      updateCursorFromElement();
    };

    el.addEventListener('keydown', handleKeyDown);
    el.addEventListener('keyup', handleEventUpdate);
    el.addEventListener('click', handleEventUpdate);
    el.addEventListener('select', handleEventUpdate);

    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      el.removeEventListener('keyup', handleEventUpdate);
      el.removeEventListener('click', handleEventUpdate);
      el.removeEventListener('select', handleEventUpdate);
    };
  }, [getTargetElement, handleSelect, isOpen, selectedIndex, suggestions, updateCursorFromElement]);

  const handleExternalKeyDown = useCallback(
    (key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape'): boolean => {
      if (!isOpen || suggestions.length === 0) return false;

      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return true;
      } else if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return true;
      } else if (key === 'Enter') {
        const selected = suggestions[selectedIndex];
        if (selected) {
          handleSelect(selected);
          return true;
        }
      } else if (key === 'Escape') {
        setIsDismissed(true);
        return true;
      }
      return false;
    },
    [handleSelect, isOpen, selectedIndex, suggestions]
  );

  useEffect(() => {
    if (navigationRef) {
      navigationRef.current = {
        isOpen,
        onKeyDown: handleExternalKeyDown,
      };
    }
  }, [navigationRef, isOpen, handleExternalKeyDown]);

  const liveRegion = (
    <span className="sr-only" role="status" aria-live="polite">
      {isOpen && suggestions.length > 0
        ? suggestions.length === 1
          ? t('request.suggestionAvailable')
          : t('request.suggestionsAvailable', { count: suggestions.length })
        : ''}
    </span>
  );

  const popover = isOpen ? (
    <div
      role="listbox"
      id={listboxId}
      aria-label={t('request.autocompleteSuggestions')}
      style={
        cursorCoords
          ? {
              position: 'fixed',
              left: Math.max(16, Math.min(cursorCoords.left, (typeof window !== 'undefined' ? window.innerWidth : 800) - 300)),
              top: cursorCoords.bottom + 4,
              zIndex: 9999,
            }
          : undefined
      }
      className={
        cursorCoords
          ? 'w-[280px] max-h-60 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl text-neutral-200 py-1 animate-in fade-in duration-75'
          : 'absolute z-50 left-0 top-full mt-1 w-full min-w-[280px] max-w-md max-h-60 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl text-neutral-200 py-1'
      }
    >
      {suggestions.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div
            key={`${item.type}-${item.id}-${index}`}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            role="option"
            id={getOptionId(index)}
            aria-selected={isSelected}
            onClick={() => handleSelect(item)}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            className={`px-3 py-2 cursor-pointer text-xs flex items-center justify-between gap-2 transition-colors ${
              isSelected
                ? 'bg-blue-600/30 text-white font-medium'
                : 'hover:bg-neutral-800 text-neutral-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {item.type === 'request' ? (
                <>
                  <MethodBadge method={item.method} />
                  <span className="truncate">{item.name}</span>
                </>
              ) : item.type === 'token' ? (
                <>
                  {item.id === '$request[...]' ? (
                    <Link2 className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-hidden="true" />
                  ) : item.id === '$guid' ? (
                    <Shuffle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
                  )}
                  <span className="font-mono text-purple-300 font-semibold truncate">{item.name}</span>
                </>
              ) : item.type === 'property' ? (
                <>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 ${
                      SCHEMA_TYPE_BADGES[item.propertyType?.toLowerCase() || 'string'] ||
                      SCHEMA_TYPE_BADGES.string
                    }`}
                  >
                    [{item.propertyType || 'string'}]
                  </span>
                  <span className="font-mono text-emerald-300 font-medium truncate">{item.name}</span>
                </>
              ) : (
                <>
                  <Variable className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                  <span className="font-mono text-sky-300 font-medium truncate">{item.name}</span>
                </>
              )}
            </div>

            {(item.description || item.detail) && (
              <span className="text-[10px] text-neutral-400 shrink-0 max-w-[140px] truncate font-mono">
                {item.description || item.detail}
              </span>
            )}
          </div>
        );
      })}
    </div>
  ) : null;

  if (children) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {children}
        {liveRegion}
        {popover}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className}>
      {liveRegion}
      {popover}
    </div>
  );
}
