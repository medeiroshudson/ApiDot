import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Variable, Shuffle, Clock, Link2 } from 'lucide-react';

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

export interface RequestAutocompleteProps {
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value?: string;
  onChange?: (val: string, newCursor?: number) => void;
  availableVariables?: AutocompleteVariable[];
  availableRequests?: AutocompleteRequest[];
  className?: string;
  children?: React.ReactNode;
}

interface SuggestionItem {
  id: string;
  name: string;
  type: 'variable' | 'token' | 'request';
  method?: string;
  detail?: string;
  scope?: string;
}

const METHOD_BADGES: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80',
  POST: 'text-blue-400 bg-blue-950/60 border-blue-800/80',
  PUT: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
  PATCH: 'text-purple-400 bg-purple-950/60 border-purple-800/80',
  DELETE: 'text-rose-400 bg-rose-950/60 border-rose-800/80',
  HEAD: 'text-neutral-400 bg-neutral-900 border-neutral-700',
  OPTIONS: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/80',
};

function getAutocompleteContext(text: string, cursorPos: number) {
  const textBefore = text.slice(0, cursorPos);
  const lastOpen = textBefore.lastIndexOf('{{');
  if (lastOpen === -1) return null;

  const content = textBefore.slice(lastOpen + 2);
  // If closing braces or newline exists between {{ and cursorPos, do not trigger
  if (content.includes('}}') || content.includes('\n')) return null;

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

export function RequestAutocomplete({
  inputRef,
  value = '',
  onChange,
  availableVariables = [],
  availableRequests = [],
  className = '',
  children,
}: RequestAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<number>(value.length);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const getTargetElement = useCallback((): HTMLInputElement | HTMLTextAreaElement | null => {
    if (inputRef?.current) return inputRef.current;
    if (containerRef.current) {
      return containerRef.current.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    }
    return null;
  }, [inputRef]);

  // Track cursor position from target element events
  const updateCursorFromElement = useCallback(() => {
    const el = getTargetElement();
    if (el && el.selectionStart !== null && el.selectionStart !== undefined) {
      setCursorPosition(el.selectionStart);
    } else {
      setCursorPosition(value.length);
    }
  }, [getTargetElement, value.length]);

  // When value prop changes, re-evaluate cursor and undis-miss
  useEffect(() => {
    setIsDismissed(false);
    updateCursorFromElement();
  }, [value, updateCursorFromElement]);

  // Parse trigger context
  const context = useMemo(() => {
    return getAutocompleteContext(value, cursorPosition);
  }, [value, cursorPosition]);

  // Generate suggestions based on context
  const suggestions = useMemo<SuggestionItem[]>(() => {
    if (!context) return [];

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
        detail: 'UUID v4 aleatório',
      },
      {
        id: '$timestamp',
        name: '$timestamp',
        type: 'token' as const,
        detail: 'Timestamp Unix atual',
      },
      {
        id: '$request[...]',
        name: '$request[...]',
        type: 'token' as const,
        detail: 'Response chaining de outra requisição',
      },
    ];

    tokens.forEach((t) => {
      if (!context.filter || t.name.toLowerCase().includes(context.filter)) {
        items.push(t);
      }
    });

    return items;
  }, [context, availableVariables, availableRequests]);

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

  const handleSelect = useCallback(
    (item: SuggestionItem) => {
      if (!context) return;
      const el = getTargetElement();
      const currentVal = value;
      const prefix = currentVal.slice(0, context.openPos);
      let suffix = currentVal.slice(cursorPosition);

      let insertText = '';
      let shouldStayOpen = false;

      if (item.type === 'request') {
        insertText = `{{$request['${item.id}'].response.body.`;
      } else if (item.type === 'token' && item.id === '$request[...]') {
        insertText = `{{$request['`;
        shouldStayOpen = true;
      } else {
        insertText = `{{${item.id}}}`;
        if (suffix.startsWith('}}')) {
          suffix = suffix.slice(2);
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
    [context, cursorPosition, getTargetElement, onChange, value]
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
      }
    };

    const handleEventUpdate = () => {
      updateCursorFromElement();
    };

    el.addEventListener('keydown', handleKeyDown);
    el.addEventListener('keyup', handleEventUpdate);
    el.addEventListener('click', handleEventUpdate);

    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      el.removeEventListener('keyup', handleEventUpdate);
      el.removeEventListener('click', handleEventUpdate);
    };
  }, [getTargetElement, handleSelect, isOpen, selectedIndex, suggestions, updateCursorFromElement]);

  const popover = isOpen ? (
    <div
      role="listbox"
      id="autocomplete-listbox"
      aria-label="Sugestões de autocompletar"
      className="absolute z-50 left-0 top-full mt-1 w-full min-w-[280px] max-w-md max-h-60 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl text-neutral-200 py-1"
    >
      {suggestions.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div
            key={item.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            role="option"
            id={`autocomplete-option-${index}`}
            aria-selected={isSelected}
            onClick={() => handleSelect(item)}
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelect(item);
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
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                      METHOD_BADGES[item.method || 'GET'] || METHOD_BADGES.GET
                    }`}
                  >
                    {item.method || 'GET'}
                  </span>
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
              ) : (
                <>
                  <Variable className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                  <span className="font-mono text-sky-300 font-medium truncate">{item.name}</span>
                </>
              )}
            </div>

            {item.detail && (
              <span className="text-[10px] text-neutral-400 shrink-0 max-w-[140px] truncate font-mono">
                {item.detail}
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
        {popover}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className}>
      {popover}
    </div>
  );
}
