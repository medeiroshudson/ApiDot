import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CodeEditor } from './CodeEditor';

describe('CodeEditor component', () => {
  it('renders CodeMirror container with testId and aria-label', () => {
    render(
      <CodeEditor
        value='{"key": "value"}'
        ariaLabel="Corpo JSON"
        testId="body-code-editor"
      />
    );

    const container = screen.getByTestId('body-code-editor');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('aria-label', 'Corpo JSON');
    expect(container.querySelector('.cm-editor')).toBeInTheDocument();
  });

  it('renders with placeholder and initial text', () => {
    render(
      <CodeEditor
        value=""
        placeholder="Digite o JSON..."
        testId="empty-editor"
      />
    );

    const container = screen.getByTestId('empty-editor');
    expect(container.querySelector('.cm-placeholder')).toHaveTextContent('Digite o JSON...');
  });

  it('supports readOnly and disabled mode', () => {
    const { container } = render(
      <CodeEditor
        value='{"readOnly": true}'
        readOnly
      />
    );

    const content = container.querySelector('.cm-content');
    expect(content).toHaveAttribute('aria-readonly', 'true');
  });

  it('accepts custom language modes (json vs text)', () => {
    const { rerender, container } = render(
      <CodeEditor value='{"a": 1}' language="json" />
    );
    expect(container.querySelector('.cm-editor')).toBeInTheDocument();

    rerender(<CodeEditor value="Chave: Valor" language="text" />);
    expect(container.querySelector('.cm-editor')).toBeInTheDocument();
  });
});
