export type SyntaxTokenType =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'punctuation'
  | 'variable'
  | 'plain'
  | 'tag'
  | 'attr-name'
  | 'attr-value'
  | 'keyword'
  | 'field';

export interface SyntaxToken {
  type: SyntaxTokenType | string;
  value: string;
}

export type SyntaxHighlighterStrategy = (code: string) => SyntaxToken[];

export type SupportedLanguage = 'json' | 'text' | 'xml' | 'graphql' | string;
