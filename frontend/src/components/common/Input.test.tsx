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
    expect(textarea.style.height).toBe('36px');

    fireEvent.focus(textarea);
    expect(textarea).toHaveClass('max-h-[84px]');
    expect(textarea.style.height).toBe('84px');

    fireEvent.blur(textarea);
    expect(textarea).not.toHaveClass('max-h-[84px]');
    expect(textarea.style.height).toBe('36px');
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
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('applies error ring styling and aria-invalid on autoGrow mode', () => {
    render(<Input autoGrow error placeholder="Error state autoGrow" />);
    const textarea = screen.getByPlaceholderText('Error state autoGrow');
    expect(textarea).toHaveClass('border-rose-500');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });
});
