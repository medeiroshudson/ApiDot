import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RequestEditor, insertTokenAtCursor, resolvePathParams } from './RequestEditor';

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

  it('switches between Specification, Params, Headers, Body, and Auth tabs', () => {
    render(<RequestEditor />);

    const specTab = screen.getByRole('tab', { name: /especificação/i });
    const paramsTab = screen.getByRole('tab', { name: /parâmetros/i });
    const headersTab = screen.getByRole('tab', { name: /cabeçalhos|headers/i });
    const bodyTab = screen.getByRole('tab', { name: /corpo|body/i });
    const authTab = screen.getByRole('tab', { name: /autenticação|auth/i });

    expect(specTab).toBeDefined();
    expect(paramsTab).toBeDefined();
    expect(headersTab).toBeDefined();
    expect(bodyTab).toBeDefined();
    expect(authTab).toBeDefined();

    // Default tab is Parâmetros
    expect(document.getElementById('panel-params')).not.toHaveAttribute('hidden');

    // Switch to Cabeçalhos tab
    fireEvent.click(headersTab);
    expect(screen.getByTestId('headers-code-editor')).toBeDefined();

    // Switch to Corpo tab
    fireEvent.click(bodyTab);
    expect(screen.getByTestId('body-empty-placeholder')).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveTextContent(/nenhum/i);
    expect(radios[1]).toHaveTextContent(/texto/i);
    expect(radios[2]).toHaveTextContent(/json/i);

    fireEvent.click(screen.getByRole('radio', { name: /json/i }));
    expect(screen.getByTestId('body-code-editor')).toBeDefined();

    // Switch to Autenticação tab
    fireEvent.click(authTab);
    expect(screen.getByRole('combobox', { name: /tipo de autenticação/i })).toBeDefined();

    // Switch to Especificação tab
    fireEvent.click(specTab);
    expect(screen.getByTestId('specification-panel')).toBeInTheDocument();
  });

  it('navigates tabs using ArrowRight and ArrowLeft with roving tabIndex', () => {
    render(<RequestEditor />);

    const specTab = screen.getByRole('tab', { name: /especificação/i });
    const paramsTab = screen.getByRole('tab', { name: /parâmetros/i });
    const headersTab = screen.getByRole('tab', { name: /cabeçalhos|headers/i });
    const bodyTab = screen.getByRole('tab', { name: /corpo|body/i });
    const authTab = screen.getByRole('tab', { name: /autenticação|auth/i });

    // Params is active by default (index 1)
    expect(paramsTab).toHaveAttribute('tabindex', '0');
    expect(specTab).toHaveAttribute('tabindex', '-1');
    expect(headersTab).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(paramsTab, { key: 'ArrowRight' });
    expect(headersTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(headersTab, { key: 'ArrowRight' });
    expect(bodyTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(bodyTab, { key: 'ArrowRight' });
    expect(authTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(authTab, { key: 'ArrowLeft' });
    expect(bodyTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders all tab panels in DOM with hidden attribute matching active tab', () => {
    render(<RequestEditor />);

    const specPanel = document.getElementById('panel-specification');
    const paramsPanel = document.getElementById('panel-params');
    const headersPanel = document.getElementById('panel-headers');
    const bodyPanel = document.getElementById('panel-body');
    const authPanel = document.getElementById('panel-auth');

    expect(specPanel).toHaveAttribute('hidden');
    expect(paramsPanel).not.toHaveAttribute('hidden');
    expect(headersPanel).toHaveAttribute('hidden');
    expect(bodyPanel).toHaveAttribute('hidden');
    expect(authPanel).toHaveAttribute('hidden');

    const headersTab = screen.getByRole('tab', { name: /cabeçalhos|headers/i });
    fireEvent.click(headersTab);

    expect(paramsPanel).toHaveAttribute('hidden');
    expect(headersPanel).not.toHaveAttribute('hidden');
  });

  it('supports basic auth and api key configuration', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ url: 'https://api.example.com' }} />);

    const authTab = screen.getByRole('tab', { name: /autenticação|auth/i });
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

    const bodyTab = screen.getByRole('tab', { name: /corpo|body/i });
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

  it('resolves :param path parameters when sending the request', () => {
    const onSend = vi.fn();
    render(
      <RequestEditor
        onSend={onSend}
        initialRequest={{
          method: 'GET',
          url: 'https://api.com/pets/:petId',
        }}
      />
    );

    // Path param input should be rendered by ParamsTab
    const pathParamInput = screen.getByPlaceholderText('Valor para :petId');
    fireEvent.change(pathParamInput, { target: { value: '42' } });

    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.com/pets/42',
        pathParams: expect.objectContaining({ petId: '42' }),
      })
    );
  });

  it('synchronizes URL when ParamsTab emits query changes', () => {
    render(
      <RequestEditor
        initialRequest={{
          method: 'GET',
          url: 'https://api.com/pets',
        }}
      />
    );

    const addQueryKey = screen.getByPlaceholderText(/Novo parâmetro/i);
    fireEvent.change(addQueryKey, { target: { value: 'limit' } });
    fireEvent.blur(addQueryKey);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput).toHaveValue('https://api.com/pets?limit=');
  });

  it('resolvePathParams helper resolves multiple parameters and preserves unmatched tokens', () => {
    const resolved = resolvePathParams(
      'https://api.com/v1/:storeId/items/:itemId/details/:missing',
      { storeId: '10', itemId: '20' }
    );
    expect(resolved).toBe('https://api.com/v1/10/items/20/details/:missing');
  });

  it('switches to body tab and sets body format to json when generating body example from SpecificationTab', () => {
    const initialSchema = JSON.stringify({
      summary: 'Buscar Pet',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Rex' },
        },
      },
    });

    render(
      <RequestEditor
        initialRequest={{
          method: 'POST',
          url: 'https://api.com/pets',
          schemaDefinition: initialSchema,
        }}
      />
    );

    // Switch to Especificação tab
    const specTab = screen.getByRole('tab', { name: /especificação/i });
    fireEvent.click(specTab);

    expect(screen.getByText('Buscar Pet')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();

    // Click "Gerar Exemplo no Corpo"
    const generateBtn = screen.getByRole('button', { name: /Gerar Exemplo no Corpo/i });
    fireEvent.click(generateBtn);

    // Should switch to Corpo tab and have JSON body
    expect(document.getElementById('panel-body')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('body-code-editor')).toBeInTheDocument();
    expect(screen.getByTestId('dirty-indicator')).toBeInTheDocument();
  });

  it('preserves and passes schemaDefinition during save and send', () => {
    const onSaveExisting = vi.fn();
    const onSend = vi.fn();
    const testSchema = JSON.stringify({
      summary: 'Operação Teste',
      body: { type: 'object', properties: {} },
    });

    render(
      <RequestEditor
        currentRequestId="req-999"
        onSaveExisting={onSaveExisting}
        onSend={onSend}
        initialRequest={{
          method: 'GET',
          url: 'https://api.com/items',
          schemaDefinition: testSchema,
        }}
      />
    );

    // Save request
    const saveBtn = screen.getByRole('button', { name: /salvar requisição/i });
    fireEvent.click(saveBtn);

    expect(onSaveExisting).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaDefinition: testSchema,
      })
    );

    // Send request
    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaDefinition: testSchema,
      })
    );
  });

  it('computes schemaProperties from schemaDefinition and provides autocompletion in body editor', () => {
    const testSchema = JSON.stringify({
      summary: 'Pets API',
      body: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Category name' },
        },
      },
    });

    render(
      <RequestEditor
        initialRequest={{
          method: 'POST',
          url: 'https://api.com/pets',
          body: '{ "cat',
          schemaDefinition: testSchema,
        }}
      />
    );

    // Switch to Corpo tab
    const bodyTab = screen.getByRole('tab', { name: /corpo/i });
    fireEvent.click(bodyTab);

    // The CodeEditor for body is present
    expect(screen.getByTestId('body-code-editor')).toBeInTheDocument();
  });

  it('renders URL field with autoGrow behavior (textarea with rows="1" and break-all)', () => {
    render(<RequestEditor initialRequest={{ url: 'https://api.example.com/long/path' }} />);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput.tagName).toBe('TEXTAREA');
    expect(urlInput).toHaveAttribute('rows', '1');
    expect(urlInput).toHaveClass('break-all');
  });

  it('keeps method selector, URL input, and Send button aligned to top with items-start', () => {
    render(<RequestEditor />);

    const methodSelect = screen.getByRole('combobox', { name: /método http/i });
    const controlsContainer = methodSelect.parentElement;
    expect(controlsContainer).toHaveClass('items-start');

    const sendBtn = screen.getByRole('button', { name: /enviar requisição/i });
    const sendContainer = sendBtn.parentElement;
    expect(sendContainer).toHaveClass('items-start');
  });

  it('triggers request dispatch without appending newlines when pressing Enter in URL field', () => {
    const onSend = vi.fn();
    render(
      <RequestEditor
        onSend={onSend}
        initialRequest={{ method: 'GET', url: 'https://api.example.com/test' }}
      />
    );

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/test',
      })
    );
    expect(urlInput).toHaveValue('https://api.example.com/test');
  });

  it('clears URL when clicking clear button (X) in autoGrow input', () => {
    render(<RequestEditor initialRequest={{ url: 'https://api.example.com/data' }} />);

    const urlInput = screen.getByRole('textbox', { name: /url da requisição/i });
    expect(urlInput).toHaveValue('https://api.example.com/data');

    const clearBtn = screen.getByRole('button', { name: /limpar url/i });
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).toHaveClass('top-2.5');

    fireEvent.click(clearBtn);

    expect(urlInput).toHaveValue('');
    expect(screen.queryByRole('button', { name: /limpar url/i })).toBeNull();
  });
});
