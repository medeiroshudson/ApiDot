import React, { useState, useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RequestAutocomplete } from './RequestAutocomplete';

describe('RequestAutocomplete', () => {
  const mockVariables = [
    { key: 'baseUrl', value: 'https://api.example.com', scope: 'environment' },
    { key: 'authToken', value: 'secret-token-123', scope: 'global' },
    { key: 'userId', value: '42', scope: 'collection' },
  ];

  const mockRequests = [
    { id: 'auth-req-123', name: 'Authenticate User', method: 'POST' },
    { id: 'users-req-456', name: 'Get Users List', method: 'GET' },
    { id: 'update-req-789', name: 'Update Profile', method: 'PUT' },
  ];

  function TestWrapper(props: {
    initialValue?: string;
    availableVariables?: typeof mockVariables;
    availableRequests?: typeof mockRequests;
    onChange?: (val: string) => void;
    isTextarea?: boolean;
  }) {
    const [val, setVal] = useState(props.initialValue ?? '');
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    const handleChange = (newVal: string) => {
      setVal(newVal);
      props.onChange?.(newVal);
    };

    return (
      <div className="relative">
        {props.isTextarea ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            aria-label="Editor Payload"
            value={val}
            onChange={(e) => handleChange(e.target.value)}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            aria-label="URL Input"
            value={val}
            onChange={(e) => handleChange(e.target.value)}
          />
        )}
        <RequestAutocomplete
          inputRef={inputRef}
          value={val}
          onChange={handleChange}
          availableVariables={props.availableVariables ?? mockVariables}
          availableRequests={props.availableRequests ?? mockRequests}
        />
      </div>
    );
  }

  it('triggers when typing {{ and renders listbox of variable suggestions (active variables, $guid, $timestamp, and $request[...])', () => {
    render(<TestWrapper />);

    expect(screen.queryByRole('listbox')).toBeNull();

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{' } });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();

    // Verify active variables
    expect(screen.getByText('baseUrl')).toBeDefined();
    expect(screen.getByText('authToken')).toBeDefined();
    expect(screen.getByText('userId')).toBeDefined();

    // Verify dynamic tokens ($guid, $timestamp, $request[...])
    expect(screen.getByText('$guid')).toBeDefined();
    expect(screen.getByText('$timestamp')).toBeDefined();
    expect(screen.getByText('$request[...]')).toBeDefined();

    // Verify accessible role option on items
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(6);
  });

  it('filters variable suggestions based on typed query', () => {
    render(<TestWrapper />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{base' } });

    expect(screen.getByText('baseUrl')).toBeDefined();
    expect(screen.queryByText('authToken')).toBeNull();
    expect(screen.queryByText('$guid')).toBeNull();
  });

  it('when typing {{$request[, lists available requests with their HTTP method badge and name', () => {
    render(<TestWrapper />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{$request[' } });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();

    // Check request names
    expect(screen.getByText('Authenticate User')).toBeDefined();
    expect(screen.getByText('Get Users List')).toBeDefined();
    expect(screen.getByText('Update Profile')).toBeDefined();

    // Check HTTP method badges
    expect(screen.getByText('POST')).toBeDefined();
    expect(screen.getByText('GET')).toBeDefined();
    expect(screen.getByText('PUT')).toBeDefined();
  });

  it('filters available requests when query is typed after {{$request[', () => {
    render(<TestWrapper />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{$request[Users' } });

    expect(screen.getByText('Get Users List')).toBeDefined();
    expect(screen.queryByText('Authenticate User')).toBeNull();
    expect(screen.queryByText('Update Profile')).toBeNull();
  });

  it("selecting a request inserts {{$request['<id>'].response.body. (canonical ID syntax)", () => {
    const onChange = vi.fn();
    render(<TestWrapper onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{$request[' } });

    const requestOption = screen.getByText('Get Users List');
    fireEvent.click(requestOption);

    expect(onChange).toHaveBeenCalledWith("{{$request['users-req-456'].response.body.");
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keyboard navigation with ArrowDown, ArrowUp, Enter to select, and Escape to dismiss', () => {
    const onChange = vi.fn();
    render(<TestWrapper onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{' } });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');

    // ArrowDown moves selection
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    // ArrowUp moves selection back
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // Escape dismisses listbox
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();

    // Typing again reopens listbox
    fireEvent.change(input, { target: { value: '{{user' } });
    expect(screen.getByRole('listbox')).toBeDefined();

    // Enter selects the active option
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('{{userId}}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports accessible roles (role="listbox", role="option", aria-selected)', () => {
    render(<TestWrapper />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{' } });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-label');

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    const selectedOptions = options.filter(
      (opt) => opt.getAttribute('aria-selected') === 'true'
    );
    expect(selectedOptions).toHaveLength(1);
  });

  it('works seamlessly inside a textarea element', () => {
    const onChange = vi.fn();
    render(<TestWrapper isTextarea onChange={onChange} />);

    const textarea = screen.getByRole('textbox', { name: /editor payload/i });
    fireEvent.change(textarea, { target: { value: '{\n  "token": "{{' } });

    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByText('authToken')).toBeDefined();

    fireEvent.click(screen.getByText('authToken'));
    expect(onChange).toHaveBeenCalledWith('{\n  "token": "{{authToken}}');
  });

  it('selecting $request[...] from variable suggestions inserts {{$request[ to start chaining', () => {
    const onChange = vi.fn();
    render(<TestWrapper onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{' } });

    const requestTokenOption = screen.getByText('$request[...]');
    fireEvent.click(requestTokenOption);

    expect(onChange).toHaveBeenCalledWith("{{$request['");
  });
});
