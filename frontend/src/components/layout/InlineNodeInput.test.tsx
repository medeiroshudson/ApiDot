import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InlineNodeInput } from './InlineNodeInput';

describe('InlineNodeInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input with placeholder and initialValue', () => {
    render(
      <InlineNodeInput
        initialValue="Minha Coleção"
        placeholder="Nome do item..."
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Minha Coleção');
    expect(input.placeholder).toBe('Nome do item...');
  });

  it('automatically focuses the input on mount', () => {
    render(
      <InlineNodeInput
        initialValue=""
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox');
    expect(document.activeElement).toBe(input);
  });

  it('updates text value when user types', () => {
    render(
      <InlineNodeInput
        initialValue=""
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Nova Requisição' } });
    expect(input.value).toBe('Nova Requisição');
  });

  it('commits trimmed value on Enter key press', () => {
    const handleCommit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InlineNodeInput
        initialValue="   Pasta V1   "
        onCommit={handleCommit}
        onCancel={handleCancel}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleCommit).toHaveBeenCalledTimes(1);
    expect(handleCommit).toHaveBeenCalledWith('Pasta V1');
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('discards and cancels when Enter is pressed with empty string', () => {
    const handleCommit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InlineNodeInput
        initialValue=""
        onCommit={handleCommit}
        onCancel={handleCancel}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleCommit).not.toHaveBeenCalled();
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('discards and cancels when Enter is pressed with whitespace only', () => {
    const handleCommit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InlineNodeInput
        initialValue="     "
        onCommit={handleCommit}
        onCancel={handleCancel}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleCommit).not.toHaveBeenCalled();
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape key press', () => {
    const handleCommit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InlineNodeInput
        initialValue="Texto Cancelado"
        onCommit={handleCommit}
        onCancel={handleCancel}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(handleCommit).not.toHaveBeenCalled();
  });

  it('calls onCancel on blur if not committed or cancelled yet', () => {
    const handleCommit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InlineNodeInput
        initialValue="Original"
        onCommit={handleCommit}
        onCancel={handleCancel}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.blur(input);

    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(handleCommit).not.toHaveBeenCalled();
  });

  it('does not trigger onCancel on blur after Enter committed', () => {
    const handleCommit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InlineNodeInput
        initialValue="Válido"
        onCommit={handleCommit}
        onCancel={handleCancel}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(handleCommit).toHaveBeenCalledWith('Válido');

    // Simulate subsequent blur event triggered by focus change
    fireEvent.blur(input);

    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('does not trigger onCancel twice on blur after Escape cancelled', () => {
    const handleCommit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InlineNodeInput
        initialValue="Válido"
        onCommit={handleCommit}
        onCancel={handleCancel}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    expect(handleCancel).toHaveBeenCalledTimes(1);

    // Simulate blur after escape
    fireEvent.blur(input);

    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('applies custom className and attributes', () => {
    render(
      <InlineNodeInput
        initialValue=""
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        className="my-custom-class"
        placeholder="Custom Placeholder"
      />
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('my-custom-class');
    expect(input).toHaveAttribute('data-testid', 'inline-node-input');
  });

  it('syncs value when initialValue prop updates', () => {
    const { rerender } = render(
      <InlineNodeInput
        initialValue="Original"
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Original');

    rerender(
      <InlineNodeInput
        initialValue="Updated Value"
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(input.value).toBe('Updated Value');
  });
});
