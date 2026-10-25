import React, { useMemo } from 'react';
import { jsonHighlighter } from './jsonHighlighter';
import {
  SupportedLanguage,
  SyntaxHighlighterStrategy,
  SyntaxToken,
  SyntaxTokenType,
} from './types';

export const DEFAULT_TOKEN_CLASSES: Record<SyntaxTokenType | string, string> = {
  key: 'text-sky-400',
  string: 'text-emerald-400',
  number: 'text-amber-400',
  boolean: 'text-purple-400',
  null: 'text-rose-400',
  punctuation: 'text-neutral-400',
  variable: 'text-yellow-300 font-semibold bg-yellow-950/40 rounded px-0.5',
  plain: 'text-neutral-300',
  tag: 'text-rose-400',
  'attr-name': 'text-amber-400',
  'attr-value': 'text-emerald-400',
  keyword: 'text-purple-400',
  field: 'text-sky-400',
};

export const plainHighlighter: SyntaxHighlighterStrategy = (code: string): SyntaxToken[] => {
  if (!code) return [];
  return [{ type: 'plain', value: code }];
};

const registry = new Map<string, SyntaxHighlighterStrategy>();
registry.set('json', jsonHighlighter);
registry.set('text', plainHighlighter);

export function registerHighlighter(
  language: string,
  strategy: SyntaxHighlighterStrategy
): void {
  registry.set(language.toLowerCase(), strategy);
}

export function getHighlighter(language: string): SyntaxHighlighterStrategy | undefined {
  return registry.get(language.toLowerCase());
}

export interface SyntaxHighlighterProps {
  code: string;
  language?: SupportedLanguage;
  strategy?: SyntaxHighlighterStrategy;
  tokenClasses?: Partial<Record<string, string>>;
  className?: string;
  showLineNumbers?: boolean;
  'data-testid'?: string;
}

export function SyntaxHighlighter({
  code,
  language = 'json',
  strategy,
  tokenClasses,
  className = '',
  showLineNumbers = false,
  'data-testid': dataTestId,
}: SyntaxHighlighterProps) {
  const tokens = useMemo(() => {
    if (!code) return [];

    const activeStrategy =
      strategy ||
      getHighlighter(language) ||
      plainHighlighter;

    try {
      return activeStrategy(code);
    } catch {
      return plainHighlighter(code);
    }
  }, [code, language, strategy]);

  const getTokenClass = (type: string): string => {
    return tokenClasses?.[type] || DEFAULT_TOKEN_CLASSES[type] || DEFAULT_TOKEN_CLASSES.plain;
  };

  const lines = useMemo(() => {
    if (!showLineNumbers) return null;

    const grouped: SyntaxToken[][] = [[]];
    for (const token of tokens) {
      if (!token.value.includes('\n')) {
        grouped[grouped.length - 1].push(token);
      } else {
        const parts = token.value.split('\n');
        for (let p = 0; p < parts.length; p++) {
          if (p > 0) {
            grouped.push([]);
          }
          if (parts[p].length > 0) {
            grouped[grouped.length - 1].push({
              type: token.type,
              value: parts[p],
            });
          }
        }
      }
    }
    return grouped;
  }, [tokens, showLineNumbers]);

  if (!code) {
    return (
      <pre
        data-testid={dataTestId}
        className={`font-mono text-xs whitespace-pre-wrap break-all select-text ${className}`}
      />
    );
  }

  if (showLineNumbers && lines) {
    return (
      <pre
        data-testid={dataTestId}
        className={`font-mono text-xs overflow-x-auto select-text ${className}`}
      >
        <div className="table w-full border-collapse">
          {lines.map((lineTokens, lineIdx) => (
            <div key={lineIdx} className="table-row">
              <span className="table-cell select-none pr-3 text-right text-neutral-600 w-8 tabular-nums">
                {lineIdx + 1}
              </span>
              <span className="table-cell whitespace-pre-wrap break-all">
                {lineTokens.length === 0 ? (
                  '\n'
                ) : (
                  lineTokens.map((token, tokenIdx) => (
                    <span
                      key={tokenIdx}
                      className={getTokenClass(token.type)}
                    >
                      {token.value}
                    </span>
                  ))
                )}
              </span>
            </div>
          ))}
        </div>
      </pre>
    );
  }

  return (
    <pre
      data-testid={dataTestId}
      className={`font-mono text-xs whitespace-pre-wrap break-all select-text ${className}`}
    >
      <code>
        {tokens.map((token, index) => (
          <span key={index} className={getTokenClass(token.type)}>
            {token.value}
          </span>
        ))}
      </code>
    </pre>
  );
}
