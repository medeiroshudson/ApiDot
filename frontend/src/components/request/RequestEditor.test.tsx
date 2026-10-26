import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RequestEditor, insertTokenAtCursor } from './RequestEditor';

describe('RequestEditor', () => {
  it('renders all key elements: method selector, URL input, target selector, and send button', () => {
    render(<RequestEditor />);

    expect(screen.getByRole('combobox', { name: /método http/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /url da requisição/i })).toBeDefined();
    expect(screen.getByRole('combobox', { name: /target de execução/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /enviar requisição/i })).toBeDefined();
  });

  it('allows changing the HTTP method', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ method: 'GET', url: 'https://api.example.com' }} />);

    const methodSelect = screen.getByRole('combobox', { name: /método http/i });
    fireEvent.change(methodSelect, { target: { value: 'POST' } });

    expect(methodSelect).toHaveValue('POST');

    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://api.example.com',
      })
    );
  });

  it('allows changing the URL input', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} />);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/users' } });

    expect(urlInput).toHaveValue('https://api.example.com/users');

    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/users',
      })
    );
  });

  it('switches between Headers, Body, and Auth tabs', () => {
    render(<RequestEditor />);

    const headersTab = screen.getByRole('tab', { name: /headers/i });
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    const authTab = screen.getByRole('tab', { name: /auth/i });

    expect(headersTab).toBeDefined();
    expect(bodyTab).toBeDefined();
    expect(authTab).toBeDefined();

    // Default tab is Headers
    expect(screen.getByRole('textbox', { name: /cabeçalhos http/i })).toBeDefined();

    // Switch to Body tab
    fireEvent.click(bodyTab);
    expect(screen.getByRole('textbox', { name: /corpo da requisição/i })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: /cabeçalhos http/i })).toBeNull();

    // Switch to Auth tab
    fireEvent.click(authTab);
    expect(screen.getByRole('combobox', { name: /tipo de autenticação/i })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: /corpo da requisição/i })).toBeNull();
  });

  it('navigates tabs using ArrowRight and ArrowLeft with roving tabIndex', () => {
    render(<RequestEditor />);

    const headersTab = screen.getByRole('tab', { name: /headers/i });
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    const authTab = screen.getByRole('tab', { name: /auth/i });

    // Initial roving tabIndex: active tab has 0, inactive have -1
    expect(headersTab).toHaveAttribute('tabindex', '0');
    expect(bodyTab).toHaveAttribute('tabindex', '-1');
    expect(authTab).toHaveAttribute('tabindex', '-1');
    expect(headersTab).toHaveAttribute('aria-selected', 'true');

    // ArrowRight moves from Headers to Body
    fireEvent.keyDown(headersTab, { key: 'ArrowRight' });
    expect(bodyTab).toHaveAttribute('tabindex', '0');
    expect(headersTab).toHaveAttribute('tabindex', '-1');
    expect(authTab).toHaveAttribute('tabindex', '-1');
    expect(bodyTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(bodyTab);

    // ArrowRight moves from Body to Auth
    fireEvent.keyDown(bodyTab, { key: 'ArrowRight' });
    expect(authTab).toHaveAttribute('tabindex', '0');
    expect(bodyTab).toHaveAttribute('tabindex', '-1');
    expect(headersTab).toHaveAttribute('tabindex', '-1');
    expect(authTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(authTab);

    // ArrowRight wraps around from Auth to Headers
    fireEvent.keyDown(authTab, { key: 'ArrowRight' });
    expect(headersTab).toHaveAttribute('tabindex', '0');
    expect(bodyTab).toHaveAttribute('tabindex', '-1');
    expect(authTab).toHaveAttribute('tabindex', '-1');
    expect(headersTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(headersTab);

    // ArrowLeft wraps around from Headers to Auth
    fireEvent.keyDown(headersTab, { key: 'ArrowLeft' });
    expect(authTab).toHaveAttribute('tabindex', '0');
    expect(headersTab).toHaveAttribute('tabindex', '-1');
    expect(bodyTab).toHaveAttribute('tabindex', '-1');
    expect(authTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(authTab);

    // ArrowLeft moves from Auth to Body
    fireEvent.keyDown(authTab, { key: 'ArrowLeft' });
    expect(bodyTab).toHaveAttribute('tabindex', '0');
    expect(authTab).toHaveAttribute('tabindex', '-1');
    expect(headersTab).toHaveAttribute('tabindex', '-1');
    expect(bodyTab).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(bodyTab);
  });

  it('renders all tab panels in DOM with hidden attribute matching active tab', () => {
    render(<RequestEditor />);

    const headersPanel = document.getElementById('panel-headers');
    const bodyPanel = document.getElementById('panel-body');
    const authPanel = document.getElementById('panel-auth');

    expect(headersPanel).not.toBeNull();
    expect(bodyPanel).not.toBeNull();
    expect(authPanel).not.toBeNull();

    expect(headersPanel).not.toHaveAttribute('hidden');
    expect(bodyPanel).toHaveAttribute('hidden');
    expect(authPanel).toHaveAttribute('hidden');

    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    expect(headersPanel).toHaveAttribute('hidden');
    expect(bodyPanel).not.toHaveAttribute('hidden');
    expect(authPanel).toHaveAttribute('hidden');

    const authTab = screen.getByRole('tab', { name: /auth/i });
    fireEvent.click(authTab);

    expect(headersPanel).toHaveAttribute('hidden');
    expect(bodyPanel).toHaveAttribute('hidden');
    expect(authPanel).not.toHaveAttribute('hidden');
  });

  it('supports basic auth and api key configuration', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ url: 'https://api.example.com' }} />);

    // Switch to Auth tab
    const authTab = screen.getByRole('tab', { name: /auth/i });
    fireEvent.click(authTab);

    // Select Basic Auth
    const authTypeSelect = screen.getByRole('combobox', { name: /tipo de autenticação/i });
    fireEvent.change(authTypeSelect, { target: { value: 'basic' } });

    const userInput = screen.getByRole('textbox', { name: /usuário/i });
    const passInput = screen.getByLabelText(/senha/i);
    fireEvent.change(userInput, { target: { value: 'admin' } });
    fireEvent.change(passInput, { target: { value: 'secret' } });

    // Select API Key
    fireEvent.change(authTypeSelect, { target: { value: 'apikey' } });
    const keyInput = screen.getByRole('textbox', { name: /chave da api/i });
    const valInput = screen.getByRole('textbox', { name: /valor da chave/i });
    fireEvent.change(keyInput, { target: { value: 'X-Custom-Header' } });
    fireEvent.change(valInput, { target: { value: 'tok_12345' } });

    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          type: 'apikey',
          key: 'X-Custom-Header',
          value: 'tok_12345',
        }),
      })
    );
  });

  it('triggers onSend callback with complete request details', () => {
    const onSend = vi.fn();
    render(
      <RequestEditor
        isAgentOnline={true}
        onSend={onSend}
        initialRequest={{
          method: 'GET',
          url: 'https://api.example.com/data',
          target: 'Inherit',
          headers: '{"Accept": "application/json"}',
          body: '',
          auth: { type: 'none' },
        }}
      />
    );

    // Switch target to Agent
    const targetSelect = screen.getByRole('combobox', { name: /target de execução/i });
    fireEvent.change(targetSelect, { target: { value: 'Agent' } });

    // Switch to Body tab and enter body
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);
    const bodyInput = screen.getByRole('textbox', { name: /corpo da requisição/i });
    fireEvent.change(bodyInput, { target: { value: '{"name": "test"}' } });

    // Switch to Auth tab and select Bearer
    const authTab = screen.getByRole('tab', { name: /auth/i });
    fireEvent.click(authTab);
    const authTypeSelect = screen.getByRole('combobox', { name: /tipo de autenticação/i });
    fireEvent.change(authTypeSelect, { target: { value: 'bearer' } });
    const tokenInput = screen.getByRole('textbox', { name: /token bearer/i });
    fireEvent.change(tokenInput, { target: { value: 'secret-token-123' } });

    // Click send
    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://api.example.com/data',
      target: 'Agent',
      headers: '{"Accept": "application/json"}',
      body: '{"name": "test"}',
      auth: {
        type: 'bearer',
        token: 'secret-token-123',
      },
    });
  });

  it('triggers onChange callback when any field updates', () => {
    const onChange = vi.fn();
    render(<RequestEditor onChange={onChange} />);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: 'https://new-url.com' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://new-url.com',
      })
    );
  });

  it('syncs form fields when initialRequest changes', () => {
    const { rerender } = render(
      <RequestEditor
        initialRequest={{
          method: 'GET',
          url: 'https://api.initial.com',
          headers: '{"Auth": "123"}',
          body: 'initial body',
          target: 'Server',
        }}
      />
    );

    const methodSelect = screen.getByRole('combobox', { name: /método http/i });
    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    const targetSelect = screen.getByRole('combobox', { name: /target de execução/i });
    const headersInput = screen.getByRole('textbox', { name: /cabeçalhos http/i });

    expect(methodSelect).toHaveValue('GET');
    expect(urlInput).toHaveValue('https://api.initial.com');
    expect(targetSelect).toHaveValue('Server');
    expect(headersInput).toHaveValue('{"Auth": "123"}');

    rerender(
      <RequestEditor
        initialRequest={{
          method: 'POST',
          url: 'https://api.updated.com',
          headers: '{"Auth": "456"}',
          body: 'updated body',
          target: 'Agent',
        }}
      />
    );

    expect(methodSelect).toHaveValue('POST');
    expect(urlInput).toHaveValue('https://api.updated.com');
    expect(targetSelect).toHaveValue('Agent');
    expect(headersInput).toHaveValue('{"Auth": "456"}');
  });

  it('disables all inputs, selects, textareas, and TargetSelector when isLoading is true', () => {
    const onSend = vi.fn();
    render(
      <RequestEditor
        isLoading={true}
        onSend={onSend}
        initialRequest={{
          url: 'https://api.example.com',
          auth: { type: 'bearer', token: 'token123' },
        }}
      />
    );

    expect(screen.getByRole('combobox', { name: /método http/i })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /url da requisição/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /target de execução/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /enviar requisição/i })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /cabeçalhos http/i })).toBeDisabled();

    // Switch to Body tab and check body textarea
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);
    expect(screen.getByRole('textbox', { name: /corpo da requisição/i })).toBeDisabled();

    // Switch to Auth tab and check auth select and inputs
    const authTab = screen.getByRole('tab', { name: /auth/i });
    fireEvent.click(authTab);
    expect(screen.getByRole('combobox', { name: /tipo de autenticação/i })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /token bearer/i })).toBeDisabled();

    // Button click does not dispatch
    fireEvent.click(screen.getByRole('button', { name: /enviar requisição/i }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('prevents onSend and shows validation feedback when URL is empty or whitespace-only', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ url: '' }} />);

    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/url é obrigatória/i);

    // Whitespace only URL also prevented
    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: '   ' } });
    fireEvent.click(sendBtn);
    expect(onSend).not.toHaveBeenCalled();

    // Entering a valid URL clears error feedback and allows sending
    fireEvent.change(urlInput, { target: { value: 'https://api.valid.com' } });
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(sendBtn);
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.valid.com',
      })
    );
  });

  it('triggers handleSend when pressing Enter in the URL input', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ url: 'https://api.example.com/enter-test' }} />);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.keyDown(urlInput, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/enter-test',
      })
    );
  });

  it('does not send on Enter when URL is empty', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ url: '' }} />);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.keyDown(urlInput, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/url é obrigatória/i);
  });

  it('formats unformatted JSON in the body when clicking the format button', () => {
    render(<RequestEditor initialRequest={{ body: '{"name":"Hudson","active":true}' }} />);

    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    const bodyInput = screen.getByRole('textbox', { name: /corpo da requisição/i });
    expect(bodyInput).toHaveValue('{"name":"Hudson","active":true}');

    const formatBtn = screen.getByRole('button', { name: /formatar corpo/i });
    fireEvent.click(formatBtn);

    const expectedJson = JSON.stringify({ name: 'Hudson', active: true }, null, 2);
    expect(bodyInput).toHaveValue(expectedJson);
    expect(screen.getByText(/formatado com sucesso/i)).toBeDefined();
  });

  it('shows error notice when formatting invalid JSON in the body', () => {
    render(<RequestEditor initialRequest={{ body: '{ invalid json }' }} />);

    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    const formatBtn = screen.getByRole('button', { name: /formatar corpo/i });
    fireEvent.click(formatBtn);

    expect(screen.getByText(/json inválido/i)).toBeDefined();
  });

  it('triggers variable autocomplete in URL input when typing {{ and allows selection', () => {
    const mockVariables = [
      { key: 'baseUrl', value: 'https://api.example.com', scope: 'env' },
    ];
    const onChange = vi.fn();
    render(
      <RequestEditor
        availableVariables={mockVariables}
        onChange={onChange}
      />
    );

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: '{{' } });

    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByText('baseUrl')).toBeDefined();

    fireEvent.click(screen.getByText('baseUrl'));
    expect(urlInput).toHaveValue('{{baseUrl}}');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '{{baseUrl}}',
      })
    );
  });

  it('triggers request chaining autocomplete in headers and body textareas when typing {{$request[', () => {
    const mockRequests = [
      { id: 'auth-req', name: 'Auth Token', method: 'POST' },
    ];
    const onChange = vi.fn();
    render(
      <RequestEditor
        availableRequests={mockRequests}
        onChange={onChange}
      />
    );

    // Test headers textarea
    const headersInput = screen.getByRole('textbox', { name: /cabeçalhos http/i });
    fireEvent.change(headersInput, { target: { value: 'Authorization: {{$request[' } });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();
    expect(screen.getByText('Auth Token')).toBeDefined();
    expect(within(listbox).getByText('POST')).toBeDefined();

    fireEvent.click(screen.getByText('Auth Token'));
    expect(headersInput).toHaveValue("Authorization: {{$request['auth-req'].response.body.");

    // Switch to body tab
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    const bodyInput = screen.getByRole('textbox', { name: /corpo da requisição/i });
    fireEvent.change(bodyInput, { target: { value: '{"token": "{{$request[' } });

    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByText('Auth Token')).toBeDefined();

    fireEvent.click(screen.getByText('Auth Token'));
    expect(bodyInput).toHaveValue('{"token": "{{$request[\'auth-req\'].response.body.');
  });

  it('renders "Vincular" button and opens DependencyLinkerModal', () => {
    const mockRequests = [
      {
        id: 'req-auth',
        name: 'Login Auth',
        method: 'POST',
        url: 'https://api.example.com/v1/auth',
        response: {
          statusCode: 200,
          body: JSON.stringify({ token: 'xyz123' }),
        },
      },
    ];
    render(
      <RequestEditor
        availableRequests={mockRequests}
      />
    );

    const vincularBtn = screen.getByRole('button', { name: /vincular/i });
    expect(vincularBtn).toBeInTheDocument();

    fireEvent.click(vincularBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Login Auth')).toBeInTheDocument();
  });

  it('inserts selected token into the active editor area (body, headers, url)', () => {
    const mockRequests = [
      {
        id: 'req-auth',
        name: 'Login Auth',
        method: 'POST',
        url: 'https://api.example.com/v1/auth',
        response: {
          statusCode: 200,
          body: JSON.stringify({ token: 'xyz123' }),
        },
      },
    ];
    const onChange = vi.fn();
    render(
      <RequestEditor
        availableRequests={mockRequests}
        onChange={onChange}
      />
    );

    // 1. Switch to Body tab and open modal
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    const vincularBtn = screen.getByRole('button', { name: /vincular/i });
    fireEvent.click(vincularBtn);

    // In modal, click on token property
    fireEvent.click(screen.getByText('token'));

    // Should insert token into body textarea and call onChange
    const bodyInput = screen.getByRole('textbox', { name: /corpo da requisição/i });
    expect(bodyInput).toHaveValue("{{$request['req-auth'].response.body.token}}");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "{{$request['req-auth'].response.body.token}}",
      })
    );
  });

  it('inserts selected token into headers textarea when headers tab is active', () => {
    const mockRequests = [
      {
        id: 'req-auth',
        name: 'Login Auth',
        method: 'POST',
        url: 'https://api.example.com/v1/auth',
        response: {
          statusCode: 200,
          body: JSON.stringify({ token: 'xyz123' }),
        },
      },
    ];
    const onChange = vi.fn();
    render(
      <RequestEditor
        availableRequests={mockRequests}
        onChange={onChange}
      />
    );

    // Headers tab is active by default
    const vincularBtn = screen.getByRole('button', { name: /vincular/i });
    fireEvent.click(vincularBtn);

    // In modal, click on token property
    fireEvent.click(screen.getByText('token'));

    // Should insert token into headers textarea and call onChange
    const headersInput = screen.getByRole('textbox', { name: /cabeçalhos http/i });
    expect(headersInput).toHaveValue("{{$request['req-auth'].response.body.token}}");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: "{{$request['req-auth'].response.body.token}}",
      })
    );
  });

  it('inserts selected token into URL input when URL input was focused', () => {
    const mockRequests = [
      {
        id: 'req-auth',
        name: 'Login Auth',
        method: 'POST',
        url: 'https://api.example.com/v1/auth',
        response: {
          statusCode: 200,
          body: JSON.stringify({ token: 'xyz123' }),
        },
      },
    ];
    const onChange = vi.fn();
    render(
      <RequestEditor
        availableRequests={mockRequests}
        onChange={onChange}
      />
    );

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.focus(urlInput);

    const vincularBtn = screen.getByRole('button', { name: /vincular/i });
    fireEvent.click(vincularBtn);

    // In modal, click on token property
    fireEvent.click(screen.getByText('token'));

    // Should insert token into URL input
    expect(urlInput).toHaveValue("{{$request['req-auth'].response.body.token}}");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "{{$request['req-auth'].response.body.token}}",
      })
    );
  });

  describe('insertTokenAtCursor helper', () => {
    it('inserts token at cursor position when element has selectionStart/selectionEnd', () => {
      const input = document.createElement('input');
      input.value = 'Hello World';
      input.selectionStart = 5;
      input.selectionEnd = 5;

      const onChange = vi.fn();
      insertTokenAtCursor(input, 'Hello World', ' beautiful', onChange);

      expect(onChange).toHaveBeenCalledWith('Hello beautiful World');
    });

    it('replaces selected range with token', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'foo REPLACE bar';
      textarea.selectionStart = 4;
      textarea.selectionEnd = 11;

      const onChange = vi.fn();
      insertTokenAtCursor(textarea, 'foo REPLACE bar', 'INSERTED', onChange);

      expect(onChange).toHaveBeenCalledWith('foo INSERTED bar');
    });

    it('appends token when element is null or selection is not available', () => {
      const onChange = vi.fn();
      insertTokenAtCursor(null, 'existing-', 'token', onChange);
      expect(onChange).toHaveBeenCalledWith('existing-token');

      const onChangeEmpty = vi.fn();
      insertTokenAtCursor(null, '', 'first-token', onChangeEmpty);
      expect(onChangeEmpty).toHaveBeenCalledWith('first-token');
    });
  });
});
