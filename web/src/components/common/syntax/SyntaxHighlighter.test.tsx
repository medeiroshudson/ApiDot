import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { jsonHighlighter } from './jsonHighlighter';
import {
  SyntaxHighlighter,
  registerHighlighter,
  getHighlighter,
  DEFAULT_TOKEN_CLASSES,
} from './SyntaxHighlighter';
import { SyntaxHighlighterStrategy, SyntaxToken } from './types';

describe('jsonHighlighter tokenizer', () => {
  it('tokenizes JSON keys and string values correctly', () => {
    const code = '{"title": "ApiDot"}';
    const tokens = jsonHighlighter(code);

    const keyToken = tokens.find((t: SyntaxToken) => t.type === 'key');
    const stringToken = tokens.find((t: SyntaxToken) => t.type === 'string');

    expect(keyToken).toBeDefined();
    expect(keyToken?.value).toBe('"title"');

    expect(stringToken).toBeDefined();
    expect(stringToken?.value).toBe('"ApiDot"');
  });

  it('tokenizes numbers, booleans, and null', () => {
    const code = '{"count": 42, "ratio": 3.14, "active": true, "deleted": false, "extra": null}';
    const tokens = jsonHighlighter(code);

    const numberTokens = tokens.filter((t: SyntaxToken) => t.type === 'number');
    const booleanTokens = tokens.filter((t: SyntaxToken) => t.type === 'boolean');
    const nullToken = tokens.find((t: SyntaxToken) => t.type === 'null');

    expect(numberTokens.map((t: SyntaxToken) => t.value)).toEqual(['42', '3.14']);
    expect(booleanTokens.map((t: SyntaxToken) => t.value)).toEqual(['true', 'false']);
    expect(nullToken).toBeDefined();
    expect(nullToken?.value).toBe('null');
  });

  it('tokenizes JSON punctuation characters', () => {
    const code = '{"items": [1, 2]}';
    const tokens = jsonHighlighter(code);

    const punctuationValues = tokens
      .filter((t: SyntaxToken) => t.type === 'punctuation')
      .map((t: SyntaxToken) => t.value);

    expect(punctuationValues).toContain('{');
    expect(punctuationValues).toContain('}');
    expect(punctuationValues).toContain('[');
    expect(punctuationValues).toContain(']');
    expect(punctuationValues).toContain(':');
    expect(punctuationValues).toContain(',');
  });

  it('tokenizes dynamic interpolation tags {{...}} standalone and within strings', () => {
    const standaloneCode = '{{userId}}';
    const standaloneTokens = jsonHighlighter(standaloneCode);

    expect(standaloneTokens).toHaveLength(1);
    expect(standaloneTokens[0]).toEqual({
      type: 'variable',
      value: '{{userId}}',
    });

    const embeddedCode =
      '{"auth": "Bearer {{token}}", "ref": "{{$request[\\"req_1\\"].response.body.id}}", "simple": "{{$request[\'req_2\'].response.body.id}}"}';
    const embeddedTokens = jsonHighlighter(embeddedCode);

    const variableTokens = embeddedTokens.filter((t: SyntaxToken) => t.type === 'variable');
    expect(variableTokens.map((t: SyntaxToken) => t.value)).toContain('{{token}}');
    expect(variableTokens.map((t: SyntaxToken) => t.value)).toContain(
      '{{$request[\\"req_1\\"].response.body.id}}'
    );
    expect(variableTokens.map((t: SyntaxToken) => t.value)).toContain(
      "{{$request['req_2'].response.body.id}}"
    );
  });

  it('preserves full original text fidelity across all tokens', () => {
    const complexJson = JSON.stringify(
      {
        name: 'ApiDot',
        version: 1,
        active: true,
        data: null,
        tags: ['api', 'rest'],
      },
      null,
      2
    );

    const tokens = jsonHighlighter(complexJson);
    const reconstructed = tokens.map((t: SyntaxToken) => t.value).join('');
    expect(reconstructed).toBe(complexJson);
  });
});

describe('SyntaxHighlighter component', () => {
  const sampleJson = JSON.stringify(
    {
      id: 101,
      name: 'Test Item',
      valid: true,
      meta: null,
      token: '{{authToken}}',
    },
    null,
    2
  );

  it('renders tokens with appropriate semantic Tailwind CSS classes', () => {
    const { container } = render(
      <SyntaxHighlighter code={sampleJson} language="json" />
    );

    // Key ("id") -> text-sky-400
    const keyEl = container.querySelector('.text-sky-400');
    expect(keyEl).toBeInTheDocument();
    expect(keyEl?.textContent).toBe('"id"');

    // Number (101) -> text-amber-400
    const numEl = container.querySelector('.text-amber-400');
    expect(numEl).toBeInTheDocument();
    expect(numEl?.textContent).toBe('101');

    // String ("Test Item") -> text-emerald-400
    const strEl = container.querySelector('.text-emerald-400');
    expect(strEl).toBeInTheDocument();
    expect(strEl?.textContent).toBe('"Test Item"');

    // Boolean (true) -> text-purple-400
    const boolEl = container.querySelector('.text-purple-400');
    expect(boolEl).toBeInTheDocument();
    expect(boolEl?.textContent).toBe('true');

    // Null (null) -> text-rose-400
    const nullEl = container.querySelector('.text-rose-400');
    expect(nullEl).toBeInTheDocument();
    expect(nullEl?.textContent).toBe('null');

    // Punctuation (:) -> text-neutral-400
    const punctEl = container.querySelector('.text-neutral-400');
    expect(punctEl).toBeInTheDocument();

    // Variable ({{authToken}}) -> text-yellow-300 font-semibold bg-yellow-950/40
    const varEl = container.querySelector('.text-yellow-300');
    expect(varEl).toBeInTheDocument();
    expect(varEl?.className).toContain('font-semibold');
    expect(varEl?.className).toContain('bg-yellow-950/40');
    expect(varEl?.textContent).toBe('{{authToken}}');
  });

  it('renders whole text correctly in code container', () => {
    render(
      <SyntaxHighlighter
        code={sampleJson}
        language="json"
        data-testid="syntax-code-block"
      />
    );

    const block = screen.getByTestId('syntax-code-block');
    expect(block.textContent).toBe(sampleJson);
  });

  it('allows registering and rendering custom language strategies (e.g. xml)', () => {
    const dummyXmlStrategy: SyntaxHighlighterStrategy = (code: string): SyntaxToken[] => {
      // Basic split for <tag>content</tag>
      const regex = /(<\/?[\w:-]+>)|([^<]+)/g;
      const tokens: SyntaxToken[] = [];
      let match: RegExpExecArray | null;

      while ((match = regex.exec(code)) !== null) {
        if (match[1]) {
          tokens.push({ type: 'tag', value: match[1] });
        } else if (match[2]) {
          tokens.push({ type: 'plain', value: match[2] });
        }
      }
      return tokens;
    };

    registerHighlighter('xml', dummyXmlStrategy);
    expect(getHighlighter('xml')).toBe(dummyXmlStrategy);

    const xmlCode = '<response>OK</response>';
    const { container } = render(
      <SyntaxHighlighter
        code={xmlCode}
        language="xml"
        tokenClasses={{ tag: 'text-orange-400' }}
      />
    );

    const tagEls = container.querySelectorAll('.text-orange-400');
    expect(tagEls.length).toBe(2);
    expect(tagEls[0].textContent).toBe('<response>');
    expect(tagEls[1].textContent).toBe('</response>');
  });

  it('falls back to plain text for unknown language or unformatted text', () => {
    const rawText = 'Plain text response from server without json formatting';
    const { container } = render(
      <SyntaxHighlighter code={rawText} language="unknown-lang" />
    );

    expect(container.textContent).toBe(rawText);
    const plainEl = container.querySelector(`.${DEFAULT_TOKEN_CLASSES.plain.split(' ')[0]}`);
    expect(plainEl).toBeInTheDocument();
    expect(plainEl?.textContent).toBe(rawText);
  });

  it('handles empty code safely without errors', () => {
    const { container } = render(<SyntaxHighlighter code="" language="json" />);
    expect(container.textContent).toBe('');
  });
});
