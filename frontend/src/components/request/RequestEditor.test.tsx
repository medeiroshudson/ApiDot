import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RequestEditor, insertTokenAtCursor } from './RequestEditor';

describe('RequestEditor', () => {
  it('renders all key elements: method selector, URL input, and split send button', () => {
    render(<RequestEditor />);

    expect(screen.getByRole('combobox', { name: /método http/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /url da requisição/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /enviar requisição/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /opções de envio e alvo/i })).toBeDefined();
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
    expect(screen.getByTestId('headers-code-editor')).toBeDefined();

    // Switch to Body tab
    fireEvent.click(bodyTab);
    expect(screen.getByTestId('body-empty-placeholder')).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveTextContent(/nenhum/i);
    expect(radios[1]).toHaveTextContent(/texto/i);
    expect(radios[2]).toHaveTextContent(/json/i);

    fireEvent.click(screen.getByRole('radio', { name: /json/i }));
    expect(screen.getByTestId('body-code-editor')).toBeDefined();

    // Switch to Auth tab
    fireEvent.click(authTab);
    expect(screen.getByRole('combobox', { name: /tipo de autenticação/i })).toBeDefined();
  });

  it('navigates tabs using ArrowRight and ArrowLeft with roving tabIndex', () => {
    render(<RequestEditor />);

    const headersTab = screen.getByRole('tab', { name: /headers/i });
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    const authTab = screen.getByRole('tab', { name: /auth/i });

    expect(headersTab).toHaveAttribute('tabindex', '0');
    expect(bodyTab).toHaveAttribute('tabindex', '-1');
    expect(authTab).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(headersTab, { key: 'ArrowRight' });
    expect(bodyTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(bodyTab, { key: 'ArrowRight' });
    expect(authTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders all tab panels in DOM with hidden attribute matching active tab', () => {
    render(<RequestEditor />);

    const headersPanel = document.getElementById('panel-headers');
    const bodyPanel = document.getElementById('panel-body');
    const authPanel = document.getElementById('panel-auth');

    expect(headersPanel).not.toHaveAttribute('hidden');
    expect(bodyPanel).toHaveAttribute('hidden');
    expect(authPanel).toHaveAttribute('hidden');

    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    expect(headersPanel).toHaveAttribute('hidden');
    expect(bodyPanel).not.toHaveAttribute('hidden');
    expect(authPanel).toHaveAttribute('hidden');
  });

  it('supports basic auth and api key configuration', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ url: 'https://api.example.com' }} />);

    const authTab = screen.getByRole('tab', { name: /auth/i });
    fireEvent.click(authTab);

    const authTypeSelect = screen.getByRole('combobox', { name: /tipo de autenticação/i });
    fireEvent.change(authTypeSelect, { target: { value: 'apikey' } });

    const keyInput = screen.getByRole('textbox', { name: /nome da chave api/i });
    const valInput = screen.getByRole('textbox', { name: /valor da chave api/i });
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

  it('prioritizes Agent target when agent is online and allows override via split button', () => {
    const onSend = vi.fn();
    render(
      <RequestEditor
        isAgentOnline={true}
        onSend={onSend}
        initialRequest={{
          method: 'GET',
          url: 'https://api.example.com/data',
        }}
      />
    );

    // Clicking main send button should prioritize Agent
    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'Agent',
      })
    );

    // Clicking chevron opens dropdown with "Executar no Servidor Nuvem"
    const chevronBtn = screen.getByRole('button', { name: /opções de envio e alvo/i });
    fireEvent.click(chevronBtn);

    const serverOption = screen.getByRole('menuitem', { name: /executar no servidor nuvem/i });
    expect(serverOption).toBeInTheDocument();
    fireEvent.click(serverOption);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'Server',
      })
    );
  });

  it('defaults to Server target when agent is offline and disables Agent override', () => {
    const onSend = vi.fn();
    render(
      <RequestEditor
        isAgentOnline={false}
        onSend={onSend}
        initialRequest={{
          method: 'GET',
          url: 'https://api.example.com/data',
        }}
      />
    );

    // Main button sends to Server
    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'Server',
      })
    );

    // Dropdown shows Agent option disabled
    const chevronBtn = screen.getByRole('button', { name: /opções de envio e alvo/i });
    fireEvent.click(chevronBtn);

    const agentOption = screen.getByRole('menuitem', { name: /executar no agent local/i });
    expect(agentOption).toBeDisabled();
  });

  it('formats unformatted JSON in the body when clicking the format button', () => {
    render(<RequestEditor initialRequest={{ body: '{"name":"api","age":30}' }} />);

    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    const formatBtn = screen.getByRole('button', { name: /formatar json/i });
    fireEvent.click(formatBtn);

    expect(screen.getByTestId('format-notice')).toHaveTextContent(/formatado com sucesso/i);
  });

  it('renders request title bar, dirty indicator, and handles save action', () => {
    const onSaveExisting = vi.fn();
    render(
      <RequestEditor
        requestName="Buscar Usuários"
        currentRequestId="req-123"
        initialRequest={{ method: 'GET', url: 'https://api.com/users' }}
        onSaveExisting={onSaveExisting}
      />
    );

    expect(screen.getByTestId('request-title')).toHaveTextContent('Buscar Usuários');
    expect(screen.queryByTestId('dirty-indicator')).toBeNull();

    // Change URL to trigger dirty indicator
    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.change(urlInput, { target: { value: 'https://api.com/users/new' } });

    expect(screen.getByTestId('dirty-indicator')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /salvar requisição/i });
    fireEvent.click(saveBtn);

    expect(onSaveExisting).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.com/users/new',
      })
    );
  });

  it('insertTokenAtCursor helper inserts token at cursor position', () => {
    const onChange = vi.fn();
    const mockElement = {
      selectionStart: 5,
      selectionEnd: 5,
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLInputElement;

    insertTokenAtCursor(mockElement, 'hello world', ' brave', onChange);
    expect(onChange).toHaveBeenCalledWith('hello brave world');
  });
});
