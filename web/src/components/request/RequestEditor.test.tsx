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

  it('supports basic auth and api key configuration', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} />);

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

  it('disables send button when isLoading is true', () => {
    const onSend = vi.fn();
    render(<RequestEditor isLoading={true} onSend={onSend} />);

    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    expect(sendBtn).toBeDisabled();

    fireEvent.click(sendBtn);
    expect(onSend).not.toHaveBeenCalled();
  });
});
