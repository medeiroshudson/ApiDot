import React, { useState, useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RequestAutocomplete, HTTP_METHOD_BADGES, METHOD_COLORS, SchemaPropertyItem } from './RequestAutocomplete';

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

  it('dismisses suggestion listbox when clicking outside the input and popover', () => {
    render(
      <div>
        <button data-testid="outside-button">Outside</button>
        <TestWrapper />
      </div>
    );

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{' } });

    expect(screen.getByRole('listbox')).toBeDefined();

    // Clicking outside dismisses
    const outsideBtn = screen.getByTestId('outside-button');
    fireEvent.pointerDown(outsideBtn);

    expect(screen.queryByRole('listbox')).toBeNull();

    // Typing again reopens
    fireEvent.change(input, { target: { value: '{{base' } });
    expect(screen.getByRole('listbox')).toBeDefined();

    // Clicking inside the input does not dismiss
    fireEvent.pointerDown(input);
    expect(screen.getByRole('listbox')).toBeDefined();
  });

  it('announces available suggestions in a polite live region for screen readers', () => {
    render(<TestWrapper />);

    const status = screen.getByRole('status');
    expect(status).toHaveClass('sr-only');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{' } });

    // 3 mock variables + 3 tokens = 6 suggestions
    expect(status).toHaveTextContent(/6 suggestions available/i);

    // Filtering down to 1 suggestion updates live announcement
    fireEvent.change(input, { target: { value: '{{base' } });
    expect(status).toHaveTextContent(/1 suggestion available/i);

    // Escape dismisses and clears live announcement
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(status).toHaveTextContent('');
  });

  it('generates unique instance IDs and sets combobox ARIA attributes on attached input', () => {
    render(
      <div>
        <TestWrapper />
        <TestWrapper />
      </div>
    );

    const inputs = screen.getAllByRole('textbox', { name: /url input/i });
    expect(inputs[0]).toHaveAttribute('aria-expanded', 'false');
    expect(inputs[0]).not.toHaveAttribute('aria-controls');
    expect(inputs[0]).not.toHaveAttribute('aria-activedescendant');

    // Trigger autocomplete on first input
    fireEvent.change(inputs[0], { target: { value: '{{' } });

    const listboxes = screen.getAllByRole('listbox');
    expect(listboxes).toHaveLength(1);
    const listboxId1 = listboxes[0].id;
    expect(listboxId1).toMatch(/-listbox$/);

    // Check combobox attributes on first input
    expect(inputs[0]).toHaveAttribute('aria-expanded', 'true');
    expect(inputs[0]).toHaveAttribute('aria-controls', listboxId1);
    const activeOptionId1 = inputs[0].getAttribute('aria-activedescendant');
    expect(activeOptionId1).toMatch(/-option-0$/);

    const options = screen.getAllByRole('option');
    expect(options[0].id).toBe(activeOptionId1);
    options.forEach((opt, idx) => {
      expect(opt.id).toMatch(new RegExp(`-option-${idx}$`));
    });

    // ArrowDown updates aria-activedescendant
    fireEvent.keyDown(inputs[0], { key: 'ArrowDown' });
    expect(inputs[0].getAttribute('aria-activedescendant')).toMatch(/-option-1$/);

    // Trigger autocomplete on second input to verify unique IDs across instances
    fireEvent.change(inputs[1], { target: { value: '{{' } });
    const bothListboxes = screen.getAllByRole('listbox');
    expect(bothListboxes).toHaveLength(2);
    const listboxId2 = bothListboxes[1].id;
    expect(listboxId2).toMatch(/-listbox$/);
    expect(listboxId1).not.toBe(listboxId2);
  });

  it('cleanly replaces tokens up to closing braces in suffix, avoiding duplicate trailing tokens', () => {
    const onChange = vi.fn();
    render(<TestWrapper onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: /url input/i }) as HTMLInputElement;

    // Editing "{{base}}" with cursor at 6 (right before closing "}}")
    fireEvent.change(input, { target: { value: '{{base}}' } });
    input.setSelectionRange(6, 6);
    fireEvent.click(input);

    expect(screen.getByRole('listbox')).toBeDefined();
    fireEvent.click(screen.getByText('baseUrl'));

    // Suffix "}}" should be cleanly replaced, NOT duplicated as "{{baseUrl}}}}"
    expect(onChange).toHaveBeenCalledWith('{{baseUrl}}');

    // Editing "{{ba_old}} /api" with cursor at 4 (right after "{{ba")
    fireEvent.change(input, { target: { value: '{{ba_old}} /api' } });
    input.setSelectionRange(4, 4);
    fireEvent.click(input);

    fireEvent.click(screen.getByText('baseUrl'));
    // "_old}}" is cleanly replaced, preserving " /api"
    expect(onChange).toHaveBeenCalledWith('{{baseUrl}} /api');
  });

  it('prevents double invocation on mouse click by selecting strictly in onClick', () => {
    const onChange = vi.fn();
    render(<TestWrapper onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{' } });
    onChange.mockClear();

    const option = screen.getByText('baseUrl');
    // Simulate real user mouse click: mousedown followed by click
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('{{baseUrl}}');
  });

  it('renders uppercase method badges and exports shared HTTP_METHOD_BADGES', () => {
    expect(HTTP_METHOD_BADGES.GET).toBeDefined();
    expect(METHOD_COLORS).toBe(HTTP_METHOD_BADGES);

    const customRequests = [
      { id: 'custom-1', name: 'Custom Lowercase', method: 'post' },
      { id: 'custom-2', name: 'Custom Default', method: '' },
    ];
    render(<TestWrapper availableRequests={customRequests} />);

    const input = screen.getByRole('textbox', { name: /url input/i });
    fireEvent.change(input, { target: { value: '{{$request[' } });

    expect(screen.getByText('POST')).toBeDefined();
    expect(screen.getByText('GET')).toBeDefined();
  });

  describe('RequestAutocomplete with schemaProperties', () => {
    it('suggests schema properties with badge and description when typing in body editor', () => {
      const schemaProps: SchemaPropertyItem[] = [
        { key: 'category', type: 'string', description: 'Pet category name' },
        { key: 'tags', type: 'array', description: 'Pet tags' },
      ];

      render(
        <RequestAutocomplete
          value='{ "cat'
          cursorPos={6}
          schemaProperties={schemaProps}
        />
      );

      expect(screen.getByText('category')).toBeInTheDocument();
      expect(screen.getByText('[string]')).toBeInTheDocument();
    });

    it('suggests all schema properties when typing after opening quote', () => {
      const schemaProps: SchemaPropertyItem[] = [
        { key: 'category', type: 'string', description: 'Pet category name' },
        { key: 'tags', type: 'array', description: 'Pet tags' },
        { key: 'count', type: 'integer' },
      ];

      render(
        <RequestAutocomplete
          value='{ "'
          cursorPos={3}
          schemaProperties={schemaProps}
        />
      );

      expect(screen.getByText('category')).toBeInTheDocument();
      expect(screen.getByText('[string]')).toBeInTheDocument();
      expect(screen.getByText('Pet category name')).toBeInTheDocument();
      expect(screen.getByText('tags')).toBeInTheDocument();
      expect(screen.getByText('[array]')).toBeInTheDocument();
      expect(screen.getByText('count')).toBeInTheDocument();
      expect(screen.getByText('[integer]')).toBeInTheDocument();
    });

    it('selecting a schema property inside quotes inserts key', () => {
      const onChange = vi.fn();
      const schemaProps: SchemaPropertyItem[] = [
        { key: 'category', type: 'string', description: 'Pet category name' },
      ];

      render(
        <RequestAutocomplete
          value='{ "cat'
          cursorPos={6}
          schemaProperties={schemaProps}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByText('category'));

      expect(onChange).toHaveBeenCalledWith('{ "category', 11);
    });

    it('selecting a schema property when typing bare property name inserts "key": ', () => {
      const onChange = vi.fn();
      const schemaProps: SchemaPropertyItem[] = [
        { key: 'category', type: 'string', description: 'Pet category name' },
      ];

      render(
        <RequestAutocomplete
          value='{ cat'
          cursorPos={5}
          schemaProperties={schemaProps}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByText('category'));

      expect(onChange).toHaveBeenCalledWith('{ "category": ', 14);
    });

    it('preserves closing quotes and subsequent content when selecting inside quotes', () => {
      const onChange = vi.fn();
      const schemaProps: SchemaPropertyItem[] = [
        { key: 'category', type: 'string', description: 'Pet category name' },
      ];

      render(
        <RequestAutocomplete
          value='{ "c" }'
          cursorPos={4}
          schemaProperties={schemaProps}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByText('category'));

      expect(onChange).toHaveBeenCalledWith('{ "category" }', 11);
    });

    it('does not trigger schema properties autocompletion when typing a value after colon', () => {
      const schemaProps: SchemaPropertyItem[] = [
        { key: 'category', type: 'string' },
      ];

      render(
        <RequestAutocomplete
          value='{ "category": "cat'
          cursorPos={18}
          schemaProperties={schemaProps}
        />
      );

      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('allows keyboard navigation with Enter to select a schema property', () => {
      const onChange = vi.fn();
      const schemaProps: SchemaPropertyItem[] = [
        { key: 'alpha', type: 'string' },
        { key: 'beta', type: 'number' },
      ];

      const inputRef = React.createRef<HTMLInputElement>();

      render(
        <div>
          <input ref={inputRef} defaultValue='{ "' />
          <RequestAutocomplete
            inputRef={inputRef}
            value='{ "'
            cursorPos={3}
            schemaProperties={schemaProps}
            onChange={onChange}
          />
        </div>
      );

      fireEvent.keyDown(inputRef.current!, { key: 'ArrowDown' });
      fireEvent.keyDown(inputRef.current!, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith('{ "beta', 7);
    });

    it('prioritizes {{ variable autocomplete even when schemaProperties are provided', () => {
      const schemaProps: SchemaPropertyItem[] = [
        { key: 'category', type: 'string' },
      ];
      const variables = [
        { key: 'myVar', value: '123' },
      ];

      render(
        <RequestAutocomplete
          value='{ "name": "{{'
          cursorPos={13}
          availableVariables={variables}
          schemaProperties={schemaProps}
        />
      );

      expect(screen.getByText('myVar')).toBeInTheDocument();
      expect(screen.queryByText('category')).toBeNull();
    });
  });
});
