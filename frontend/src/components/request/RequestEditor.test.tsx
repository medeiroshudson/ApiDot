import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestEditor, insertTokenAtCursor, resolvePathParams } from './RequestEditor';
import { useI18nStore } from '@/stores/useI18nStore';

describe('RequestEditor', () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: 'en-US' });
  });

  afterEach(() => {
    useI18nStore.setState({ locale: 'en-US' });
  });
  it('renders all key elements: method selector, URL input, and split send button', () => {
    render(<RequestEditor />);

    expect(screen.getByRole('combobox', { name: /http method/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /request url/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /send request/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /send and target options/i })).toBeDefined();
  });

  it('allows changing the HTTP method', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ method: 'GET', url: 'https://api.example.com' }} />);

    const methodSelect = screen.getByRole('combobox', { name: /http method/i });
    fireEvent.change(methodSelect, { target: { value: 'POST' } });

    expect(methodSelect).toHaveValue('POST');

    const sendBtn = screen.getByRole('button', { name: /send request/i });
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

    const urlInput = screen.getByRole('textbox', { name: /request url/i });
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/users' } });

    expect(urlInput).toHaveValue('https://api.example.com/users');

    const sendBtn = screen.getByRole('button', { name: /send request/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/users',
      })
    );
  });

  it('switches between Specification, Params, Headers, Body, and Auth tabs', () => {
    render(<RequestEditor />);

    const specTab = screen.getByRole('tab', { name: /specification/i });
    const paramsTab = screen.getByRole('tab', { name: /params/i });
    const headersTab = screen.getByRole('tab', { name: /headers/i });
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    const authTab = screen.getByRole('tab', { name: /auth/i });

    expect(specTab).toBeDefined();
    expect(paramsTab).toBeDefined();
    expect(headersTab).toBeDefined();
    expect(bodyTab).toBeDefined();
    expect(authTab).toBeDefined();

    // Default tab is Specification
    expect(document.getElementById('panel-specification')).not.toHaveAttribute('hidden');

    // Switch to Params tab
    fireEvent.click(paramsTab);
    expect(document.getElementById('panel-params')).not.toHaveAttribute('hidden');

    // Switch to Headers tab
    fireEvent.click(headersTab);
    expect(screen.getByTestId('headers-code-editor')).toBeDefined();

    // Switch to Body tab
    fireEvent.click(bodyTab);
    expect(screen.getByTestId('body-empty-placeholder')).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveTextContent(/none/i);
    expect(radios[1]).toHaveTextContent(/text/i);
    expect(radios[2]).toHaveTextContent(/json/i);

    fireEvent.click(screen.getByRole('radio', { name: /json/i }));
    expect(screen.getByTestId('body-code-editor')).toBeDefined();

    // Switch to Auth tab
    fireEvent.click(authTab);
    expect(screen.getByRole('combobox', { name: /authentication type/i })).toBeDefined();

    // Switch back to Specification tab
    fireEvent.click(specTab);
    expect(screen.getByTestId('specification-panel')).toBeInTheDocument();
  });

  it('navigates tabs using ArrowRight and ArrowLeft with roving tabIndex', () => {
    render(<RequestEditor />);

    const specTab = screen.getByRole('tab', { name: /specification/i });
    const authTab = screen.getByRole('tab', { name: /auth/i });
    const paramsTab = screen.getByRole('tab', { name: /params/i });
    const headersTab = screen.getByRole('tab', { name: /headers/i });
    const bodyTab = screen.getByRole('tab', { name: /body/i });

    // Specification is active by default (index 0)
    expect(specTab).toHaveAttribute('tabindex', '0');
    expect(authTab).toHaveAttribute('tabindex', '-1');
    expect(paramsTab).toHaveAttribute('tabindex', '-1');
    expect(headersTab).toHaveAttribute('tabindex', '-1');
    expect(bodyTab).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(specTab, { key: 'ArrowRight' });
    expect(authTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(authTab, { key: 'ArrowRight' });
    expect(paramsTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(paramsTab, { key: 'ArrowRight' });
    expect(headersTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(headersTab, { key: 'ArrowRight' });
    expect(bodyTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(bodyTab, { key: 'ArrowLeft' });
    expect(headersTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders all tab panels in DOM with hidden attribute matching active tab', () => {
    render(<RequestEditor />);

    const specPanel = document.getElementById('panel-specification');
    const authPanel = document.getElementById('panel-auth');
    const paramsPanel = document.getElementById('panel-params');
    const headersPanel = document.getElementById('panel-headers');
    const bodyPanel = document.getElementById('panel-body');

    expect(specPanel).not.toHaveAttribute('hidden');
    expect(authPanel).toHaveAttribute('hidden');
    expect(paramsPanel).toHaveAttribute('hidden');
    expect(headersPanel).toHaveAttribute('hidden');
    expect(bodyPanel).toHaveAttribute('hidden');

    const headersTab = screen.getByRole('tab', { name: /headers/i });
    fireEvent.click(headersTab);

    expect(specPanel).toHaveAttribute('hidden');
    expect(headersPanel).not.toHaveAttribute('hidden');
  });

  it('supports basic auth and api key configuration', () => {
    const onSend = vi.fn();
    render(<RequestEditor onSend={onSend} initialRequest={{ url: 'https://api.example.com' }} />);

    const authTab = screen.getByRole('tab', { name: /auth/i });
    fireEvent.click(authTab);

    const authTypeSelect = screen.getByRole('combobox', { name: /authentication type/i });
    fireEvent.change(authTypeSelect, { target: { value: 'apikey' } });

    const keyInput = screen.getByRole('textbox', { name: /api key name/i });
    const valInput = screen.getByRole('textbox', { name: /api key value/i });
    fireEvent.change(keyInput, { target: { value: 'X-Custom-Header' } });
    fireEvent.change(valInput, { target: { value: 'tok_12345' } });

    const sendBtn = screen.getByRole('button', { name: /send request/i });
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
    const sendBtn = screen.getByRole('button', { name: /send request/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'Agent',
      })
    );

    // Clicking chevron opens dropdown with "Execute on Cloud Server"
    const chevronBtn = screen.getByRole('button', { name: /send and target options/i });
    fireEvent.click(chevronBtn);

    const serverOption = screen.getByRole('menuitem', { name: /execute on cloud server/i });
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
    const sendBtn = screen.getByRole('button', { name: /send request/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'Server',
      })
    );

    // Dropdown shows Agent option disabled
    const chevronBtn = screen.getByRole('button', { name: /send and target options/i });
    fireEvent.click(chevronBtn);

    const agentOption = screen.getByRole('menuitem', { name: /execute on local agent/i });
    expect(agentOption).toBeDisabled();
  });

  it('formats unformatted JSON in the body when clicking the format button', () => {
    render(<RequestEditor initialRequest={{ body: '{"name":"api","age":30}' }} />);

    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    const formatBtn = screen.getByRole('button', { name: /format json/i });
    fireEvent.click(formatBtn);

    expect(screen.getByTestId('format-notice')).toHaveTextContent(/formatted successfully/i);
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
    const urlInput = screen.getByRole('textbox', { name: /request url/i });
    fireEvent.change(urlInput, { target: { value: 'https://api.com/users/new' } });

    expect(screen.getByTestId('dirty-indicator')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /save request/i });
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
    const pathParamInput = screen.getByPlaceholderText('Value for :petId');
    fireEvent.change(pathParamInput, { target: { value: '42' } });

    const sendBtn = screen.getByRole('button', { name: /send request/i });
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

    const addQueryKey = screen.getByPlaceholderText(/New parameter/i);
    fireEvent.change(addQueryKey, { target: { value: 'limit' } });
    fireEvent.blur(addQueryKey);

    const urlInput = screen.getByRole('textbox', { name: /request url/i });
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

    // Switch to Specification tab
    const specTab = screen.getByRole('tab', { name: /specification/i });
    fireEvent.click(specTab);

    expect(screen.getByText('Buscar Pet')).toBeInTheDocument();
    expect(screen.getByDisplayValue('name')).toBeInTheDocument();

    // Click "Generate Example"
    const generateBtn = screen.getByRole('button', { name: /Generate Example/i });
    fireEvent.click(generateBtn);

    // Should switch to Body tab and have JSON body
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
    const saveBtn = screen.getByRole('button', { name: /save request/i });
    fireEvent.click(saveBtn);

    expect(onSaveExisting).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaDefinition: testSchema,
      })
    );

    // Send request
    const sendBtn = screen.getByRole('button', { name: /send request/i });
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

    // Switch to Body tab
    const bodyTab = screen.getByRole('tab', { name: /body/i });
    fireEvent.click(bodyTab);

    // The CodeEditor for body is present
    expect(screen.getByTestId('body-code-editor')).toBeInTheDocument();
  });

  it('renders URL field with autoGrow behavior (textarea with rows="1" and break-all)', () => {
    render(<RequestEditor initialRequest={{ url: 'https://api.example.com/long/path' }} />);

    const urlInput = screen.getByRole('textbox', { name: /request url/i });
    expect(urlInput.tagName).toBe('TEXTAREA');
    expect(urlInput).toHaveAttribute('rows', '1');
    expect(urlInput).toHaveClass('break-all');
  });

  it('keeps method selector, URL input, and Send button aligned to top with items-start', () => {
    render(<RequestEditor />);

    const methodSelect = screen.getByRole('combobox', { name: /http method/i });
    const controlsContainer = methodSelect.closest('.items-start');
    expect(controlsContainer).toHaveClass('items-start');

    const sendBtn = screen.getByRole('button', { name: /send request/i });
    const sendContainer = sendBtn.parentElement;
    expect(sendContainer).toHaveClass('items-start');
  });

  it('renders HTTP method selector using canonical Select with badge styling and Lucide chevron', () => {
    const { container } = render(<RequestEditor initialRequest={{ method: 'GET' }} />);

    const methodSelect = screen.getByRole('combobox', { name: /http method/i });
    expect(methodSelect).toBeInTheDocument();
    expect(methodSelect).toHaveValue('GET');

    // Standardized sizeVariant="md" (h-9, text-xs, pl-2.5, pr-8)
    expect(methodSelect).toHaveClass('h-9');
    expect(methodSelect).toHaveClass('text-xs');
    expect(methodSelect).toHaveClass('pl-2.5');
    expect(methodSelect).toHaveClass('pr-8');

    // Method badge styling for GET
    expect(methodSelect).toHaveClass('text-emerald-400');
    expect(methodSelect).toHaveClass('bg-emerald-950/60');
    expect(methodSelect).toHaveClass('border-emerald-800/80');

    // ChevronDown icon inherits method color with opacity-70
    const chevron = container.querySelector('[data-testid="select-chevron"]');
    expect(chevron).toBeInTheDocument();
    expect(chevron).toHaveClass('text-current');
    expect(chevron).toHaveClass('opacity-70');

    // When method changes to POST, badge colors update dynamically
    fireEvent.change(methodSelect, { target: { value: 'POST' } });
    expect(methodSelect).toHaveValue('POST');
    expect(methodSelect).toHaveClass('text-blue-400');
    expect(methodSelect).toHaveClass('bg-blue-950/60');
    expect(methodSelect).toHaveClass('border-blue-800/80');
  });

  it('triggers request dispatch without appending newlines when pressing Enter in URL field', () => {
    const onSend = vi.fn();
    render(
      <RequestEditor
        onSend={onSend}
        initialRequest={{ method: 'GET', url: 'https://api.example.com/test' }}
      />
    );

    const urlInput = screen.getByRole('textbox', { name: /request url/i });
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

    const urlInput = screen.getByRole('textbox', { name: /request url/i });
    expect(urlInput).toHaveValue('https://api.example.com/data');

    const clearBtn = screen.getByRole('button', { name: /clear url/i });
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).toHaveClass('top-2.5');

    fireEvent.click(clearBtn);

    expect(urlInput).toHaveValue('');
    expect(screen.queryByRole('button', { name: /clear url/i })).toBeNull();
  });

  it('renders single-row request bar layout and concise send button', () => {
    useI18nStore.setState({ locale: 'pt-BR' });
    render(<RequestEditor />);
    const sendButton = screen.getByRole('button', { name: /enviar requisição/i });
    expect(sendButton).toBeInTheDocument();
    expect(sendButton).toHaveTextContent('Enviar');
    expect(sendButton).not.toHaveTextContent(/\bvia\b/i);
    expect(sendButton).not.toHaveTextContent('ONLINE');
  });

  it('disables primary send button when target is explicitly Agent and agent is offline, while chevron remains clickable', () => {
    useI18nStore.setState({ locale: 'pt-BR' });
    render(
      <RequestEditor
        initialRequest={{ target: 'Agent', url: 'https://api.test' }}
        isAgentOnline={false}
      />
    );
    const sendButton = screen.getByRole('button', { name: /enviar requisição/i });
    expect(sendButton).toBeDisabled();

    const chevron = screen.getByRole('button', { name: /opções de envio/i });
    expect(chevron).not.toBeDisabled();
    fireEvent.click(chevron);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('dispatches immediately and updates target when selecting alternative target in dropdown without marking dirty', () => {
    useI18nStore.setState({ locale: 'pt-BR' });
    const onSend = vi.fn();
    render(
      <RequestEditor
        initialRequest={{ target: 'Agent', url: 'https://api.test' }}
        isAgentOnline={false}
        onSend={onSend}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /opções de envio/i }));
    fireEvent.click(screen.getByText(/servidor \(nuvem\)/i));

    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ target: 'Server' }));
    expect(screen.queryByTestId('dirty-indicator')).not.toBeInTheDocument();
  });

  it('does not dispatch request when pressing Enter in URL field if Agent target is offline', () => {
    const onSend = vi.fn();
    render(
      <RequestEditor
        initialRequest={{ target: 'Agent', url: 'https://api.test' }}
        isAgentOnline={false}
        onSend={onSend}
      />
    );
    const urlInput = screen.getByRole('textbox', { name: /request url/i });
    fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders tabs in new order with Authorization in second place and default to specification', () => {
    render(<RequestEditor />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent(/specification|especificação/i);
    expect(tabs[1]).toHaveTextContent(/authorization|autenticação/i);
    expect(tabs[2]).toHaveTextContent(/params|parâmetros/i);
    expect(tabs[3]).toHaveTextContent(/headers|cabeçalhos/i);
    expect(tabs[4]).toHaveTextContent(/body|corpo/i);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('renders responseSlot and splitterSlot side-by-side below request bar when provided', () => {
    render(
      <RequestEditor
        isDesktop={true}
        requestDetailsRatio={60}
        responseSlot={<div data-testid="mock-response-viewer">Response Content</div>}
        splitterSlot={<div data-testid="mock-splitter">Splitter</div>}
      />
    );
    expect(screen.getByTestId('mock-response-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('mock-splitter')).toBeInTheDocument();
  });

  it('respects activeTab prop and notifies onTabChange when tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<RequestEditor activeTab="headers" onTabChange={onTabChange} />);

    const headersTab = screen.getByRole('tab', { name: /headers/i });
    expect(headersTab).toHaveAttribute('aria-selected', 'true');

    const authTab = screen.getByRole('tab', { name: /auth/i });
    fireEvent.click(authTab);

    expect(onTabChange).toHaveBeenCalledWith('auth');
  });

  it('renders mobile switcher and switches between request and response when isDesktop is false and responseSlot is provided', () => {
    const onMobilePaneChange = vi.fn();
    render(
      <RequestEditor
        isDesktop={false}
        activeMobilePane="request"
        onMobilePaneChange={onMobilePaneChange}
        responseStatusCode={200}
        responseSlot={<div data-testid="mock-response-viewer">Response Content</div>}
      />
    );

    const requestButton = screen.getByRole('button', { name: /^request$|^requisição$/i });
    const responseButton = screen.getByRole('button', { name: /^response|^resposta/i });

    expect(requestButton).toBeInTheDocument();
    expect(responseButton).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();

    fireEvent.click(responseButton);
    expect(onMobilePaneChange).toHaveBeenCalledWith('response');
  });
});
