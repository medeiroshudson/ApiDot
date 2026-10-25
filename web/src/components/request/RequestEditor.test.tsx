import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RequestEditor } from './RequestEditor';

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
});
