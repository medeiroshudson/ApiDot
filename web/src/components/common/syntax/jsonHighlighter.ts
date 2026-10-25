import { SyntaxHighlighterStrategy, SyntaxToken } from './types';

const VAR_REGEX = /\{\{[\s\S]*?\}\}/y;
const STR_REGEX = /"(?:\\.|{{[\s\S]*?}}|[^"\\{]|(?:\{(?!\{)))*"/y;
const NUM_REGEX = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?![a-zA-Z_])/y;
const BOOL_REGEX = /(?:true|false)(?![a-zA-Z0-9_])/y;
const NULL_REGEX = /null(?![a-zA-Z0-9_])/y;
const PUNCT_REGEX = /[{}\[\],:]/y;
const WS_REGEX = /\s+/y;

export const jsonHighlighter: SyntaxHighlighterStrategy = (code: string): SyntaxToken[] => {
  if (!code) return [];

  const tokens: SyntaxToken[] = [];
  let i = 0;

  while (i < code.length) {
    // 1. Dynamic tags outside strings
    VAR_REGEX.lastIndex = i;
    const varMatch = VAR_REGEX.exec(code);
    if (varMatch) {
      tokens.push({ type: 'variable', value: varMatch[0] });
      i += varMatch[0].length;
      continue;
    }

    // 2. Strings and Keys
    STR_REGEX.lastIndex = i;
    const strMatch = STR_REGEX.exec(code);
    if (strMatch) {
      const fullStr = strMatch[0];
      const afterIdx = i + fullStr.length;
      const isKey = /^\s*:/.test(code.slice(afterIdx));

      if (isKey) {
        tokens.push({ type: 'key', value: fullStr });
      } else {
        // String value: check if it contains inner dynamic interpolation tags {{...}}
        const innerVarRegex = /\{\{[\s\S]*?\}\}/g;
        let lastIdx = 0;
        let innerMatch: RegExpExecArray | null;
        let hasVariables = false;

        while ((innerMatch = innerVarRegex.exec(fullStr)) !== null) {
          hasVariables = true;
          if (innerMatch.index > lastIdx) {
            tokens.push({
              type: 'string',
              value: fullStr.slice(lastIdx, innerMatch.index),
            });
          }
          tokens.push({
            type: 'variable',
            value: innerMatch[0],
          });
          lastIdx = innerMatch.index + innerMatch[0].length;
        }

        if (hasVariables) {
          if (lastIdx < fullStr.length) {
            tokens.push({
              type: 'string',
              value: fullStr.slice(lastIdx),
            });
          }
        } else {
          tokens.push({ type: 'string', value: fullStr });
        }
      }

      i += fullStr.length;
      continue;
    }

    // 3. Booleans
    BOOL_REGEX.lastIndex = i;
    const boolMatch = BOOL_REGEX.exec(code);
    if (boolMatch) {
      tokens.push({ type: 'boolean', value: boolMatch[0] });
      i += boolMatch[0].length;
      continue;
    }

    // 4. Null
    NULL_REGEX.lastIndex = i;
    const nullMatch = NULL_REGEX.exec(code);
    if (nullMatch) {
      tokens.push({ type: 'null', value: nullMatch[0] });
      i += nullMatch[0].length;
      continue;
    }

    // 5. Numbers
    NUM_REGEX.lastIndex = i;
    const numMatch = NUM_REGEX.exec(code);
    if (numMatch) {
      tokens.push({ type: 'number', value: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    // 6. Punctuation
    PUNCT_REGEX.lastIndex = i;
    const punctMatch = PUNCT_REGEX.exec(code);
    if (punctMatch) {
      tokens.push({ type: 'punctuation', value: punctMatch[0] });
      i += punctMatch[0].length;
      continue;
    }

    // 7. Whitespace
    WS_REGEX.lastIndex = i;
    const wsMatch = WS_REGEX.exec(code);
    if (wsMatch) {
      tokens.push({ type: 'plain', value: wsMatch[0] });
      i += wsMatch[0].length;
      continue;
    }

    // 8. Fallback plain character
    tokens.push({ type: 'plain', value: code[i] });
    i++;
  }

  return tokens;
};
