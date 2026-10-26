import { test, expect } from '@playwright/test';

test.describe('Request Editor and Execution Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });
  });

  test('should render the request editor interface with default values', async ({ page }) => {
    // Check App Header
    await expect(page.getByText('ApiDot', { exact: true })).toBeVisible();

    // Check Method Selector defaults to GET
    const methodSelect = page.getByLabel('Método HTTP');
    await expect(methodSelect).toBeVisible();
    await expect(methodSelect).toHaveValue('GET');

    // Check URL input
    const urlInput = page.getByLabel('URL da requisição');
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue('');

    // Check Send button
    const sendButton = page.getByRole('button', { name: /enviar/i });
    await expect(sendButton).toBeVisible();

    // Check configuration tabs
    await expect(page.getByRole('tab', { name: 'Headers' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Body' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Auth' })).toBeVisible();
  });

  test('should display validation error when sending with empty URL', async ({ page }) => {
    const sendButton = page.getByRole('button', { name: /enviar/i });
    await sendButton.click();

    // Error message must be rendered
    const errorAlert = page.locator('#url-error');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toHaveText('A URL é obrigatória');

    const urlInput = page.getByLabel('URL da requisição');
    await expect(urlInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('should clear validation error when URL is entered', async ({ page }) => {
    const sendButton = page.getByRole('button', { name: /enviar/i });
    await sendButton.click();

    const errorAlert = page.locator('#url-error');
    await expect(errorAlert).toBeVisible();

    const urlInput = page.getByLabel('URL da requisição');
    await urlInput.fill('https://api.example.com/data');

    await expect(errorAlert).not.toBeVisible();
    await expect(urlInput).toHaveAttribute('aria-invalid', 'false');
  });

  test('should switch tabs and update headers, body, and auth configuration', async ({ page }) => {
    // Fill Headers
    await page.getByRole('tab', { name: 'Headers' }).click();
    const headersArea = page.getByLabel('Cabeçalhos HTTP');
    await headersArea.fill('{"X-Custom-Trace": "trace-123"}');
    await expect(headersArea).toHaveValue('{"X-Custom-Trace": "trace-123"}');

    // Fill Body
    await page.getByRole('tab', { name: 'Body' }).click();
    const bodyArea = page.getByLabel('Corpo da requisição');
    await bodyArea.fill('{"query": "active_users"}');
    await expect(bodyArea).toHaveValue('{"query": "active_users"}');

    // Configure Auth
    await page.getByRole('tab', { name: 'Auth' }).click();
    const authSelect = page.getByLabel('Tipo de autenticação');
    await authSelect.selectOption('bearer');

    const tokenInput = page.getByLabel('Token Bearer');
    await expect(tokenInput).toBeVisible();
    await tokenInput.fill('secret-token-xyz');
    await expect(tokenInput).toHaveValue('secret-token-xyz');
  });

  test('should successfully execute request and display response in viewer', async ({ page }) => {
    let interceptedRequestBody: any = null;

    await page.route('**/api/requests/execute', async (route) => {
      interceptedRequestBody = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req-98765',
          },
          body: JSON.stringify({ message: 'Hello from ApiDot E2E!', success: true }),
          timing: {
            dnsLookupMs: 4,
            tcpHandshakeMs: 8,
            tlsHandshakeMs: 12,
            timeToFirstByteMs: 45,
            contentTransferMs: 15,
            totalDurationMs: 84,
          },
        }),
      });
    });

    // Change Method to POST
    await page.getByLabel('Método HTTP').selectOption('POST');

    // Enter URL
    const urlInput = page.getByLabel('URL da requisição');
    await urlInput.fill('https://api.example.com/v1/resource');

    // Enter Body
    await page.getByRole('tab', { name: 'Body' }).click();
    await page.getByLabel('Corpo da requisição').fill('{"name": "ApiDot"}');

    // Click Send
    await page.getByRole('button', { name: /enviar/i }).click();

    // Verify dispatched payload
    await expect.poll(() => interceptedRequestBody).not.toBeNull();
    expect(interceptedRequestBody.method).toBe('POST');
    expect(interceptedRequestBody.url).toBe('https://api.example.com/v1/resource');
    expect(interceptedRequestBody.bodyContent).toBe('{"name": "ApiDot"}');

    // Verify Response Viewer displays status badge and content
    const statusBadge = page.getByTestId('status-badge');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toHaveText(/200 OK/);

    // Verify response body content is rendered
    await expect(page.getByText('Hello from ApiDot E2E!')).toBeVisible();
  });

  test('should handle 504 Gateway Timeout ProblemDetails from agent execution', async ({ page }) => {
    await page.route('**/api/requests/execute', async (route) => {
      await route.fulfill({
        status: 504,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Agent Execution Timed Out',
          status: 504,
          detail: 'The dispatch to the local agent timed out or was canceled.',
        }),
      });
    });

    const urlInput = page.getByLabel('URL da requisição');
    await urlInput.fill('https://internal.agent.lan/api');

    await page.getByRole('button', { name: /enviar/i }).click();

    // Status badge shows 504 error
    const statusBadge = page.getByTestId('status-badge');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toHaveText(/504/);

    // Problem details title / detail visible in viewer
    await expect(page.getByText('Agent Execution Timed Out')).toBeVisible();
  });

  test('should configure environment variable in modal and interpolate in request execution', async ({ page }) => {
    let interceptedRequestBody: any = null;

    await page.route('**/api/requests/execute', async (route) => {
      interceptedRequestBody = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ message: 'User data fetched with variable' }),
        }),
      });
    });

    // 1. Click "Configurar ambientes e variáveis" button in AppHeader to open EnvironmentModal
    const openEnvBtn = page.getByRole('button', { name: 'Configurar ambientes e variáveis' });
    await expect(openEnvBtn).toBeVisible();
    await openEnvBtn.click();

    // 2. Verify modal opens with tabs ("Globais", "Coleção", "Ambientes", "Calculadas")
    const modal = page.getByTestId('environment-modal-content');
    await expect(modal).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Globais' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Coleção' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Ambientes' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Calculadas' })).toBeVisible();

    // 3. Select "Ambientes" tab -> "Development"
    await page.getByRole('tab', { name: 'Ambientes' }).click();
    await page.getByRole('tab', { name: /Development/i }).click();

    // 4. Enter key "baseUrl" and value "https://api.mocked.com"
    await page.getByRole('button', { name: 'Adicionar Variável' }).click();
    await page.getByPlaceholder('Chave').fill('baseUrl');
    await page.getByPlaceholder('Valor').fill('https://api.mocked.com');

    // 5. Close modal (via close button or backdrop/Escape)
    await page.getByRole('button', { name: 'Fechar modal' }).click();
    await expect(modal).not.toBeVisible();

    // 6. Select "Development" in the AppHeader environment dropdown
    const envSelect = page.getByLabel('Selecionar ambiente ativo');
    await expect(envSelect).toBeVisible();
    await envSelect.selectOption('Development');

    // 7. In RequestEditor, enter URL "{{baseUrl}}/v1/users"
    const urlInput = page.getByLabel('URL da requisição');
    await urlInput.fill('{{baseUrl}}/v1/users');

    // 8. Click "Enviar" button
    await page.getByRole('button', { name: /enviar/i }).click();

    // 9. Verify the intercepted request to /api/requests/execute receives interpolated URL or variables context with baseUrl="https://api.mocked.com" and response viewer displays result
    await expect.poll(() => interceptedRequestBody).not.toBeNull();
    expect(
      interceptedRequestBody.url === 'https://api.mocked.com/v1/users' ||
      interceptedRequestBody.environmentVariables?.baseUrl === 'https://api.mocked.com' ||
      interceptedRequestBody.variables?.baseUrl === 'https://api.mocked.com'
    ).toBe(true);

    const statusBadge = page.getByTestId('status-badge');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toHaveText(/200 OK/);
    await expect(page.getByText('User data fetched with variable')).toBeVisible();
  });

  test('should display colored syntax highlighting tokens in response viewer', async ({ page }) => {
    await page.route('**/api/requests/execute', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'operational',
            service: 'ApiDot Core',
            version: '0.3.0',
            active: true,
            count: 42,
          }),
        }),
      });
    });

    const urlInput = page.getByLabel('URL da requisição');
    await urlInput.fill('https://api.example.com/v1/health');
    await page.getByRole('button', { name: /enviar/i }).click();

    const statusBadge = page.getByTestId('status-badge');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toHaveText(/200 OK/);

    // Verify colored syntax highlighting tokens
    const prettyContent = page.getByTestId('response-pretty-content');
    await expect(prettyContent).toBeVisible();

    // Key tokens should have text-sky-400
    const keyTokens = prettyContent.locator('.text-sky-400');
    await expect(keyTokens.filter({ hasText: '"status"' })).toBeVisible();
    await expect(keyTokens.filter({ hasText: '"service"' })).toBeVisible();

    // String tokens should have text-emerald-400
    const stringTokens = prettyContent.locator('.text-emerald-400');
    await expect(stringTokens.filter({ hasText: '"operational"' })).toBeVisible();
    await expect(stringTokens.filter({ hasText: '"ApiDot Core"' })).toBeVisible();
  });

  test('should open autocomplete popover with variable suggestions when typing {{ in request editor', async ({ page }) => {
    const urlInput = page.getByLabel('URL da requisição');
    await urlInput.focus();
    await urlInput.fill('{{');

    // Autocomplete popover appears
    const popover = page.getByRole('listbox', { name: 'Sugestões de autocompletar' });
    await expect(popover).toBeVisible();

    // Contains dynamic tokens and suggestions
    await expect(popover.getByRole('option', { name: /\$guid/i })).toBeVisible();
    await expect(popover.getByRole('option', { name: /\$timestamp/i })).toBeVisible();
    await expect(popover.getByRole('option', { name: /\$request\[\.\.\.\]/i })).toBeVisible();
  });

  test('should open DependencyLinkerModal when clicking Vincular, allow inspecting response and inserting token', async ({ page }) => {
    const urlInput = page.getByLabel('URL da requisição');
    await urlInput.focus();

    // Click "Vincular" button in the Request Editor toolbar
    const vincularBtn = page.getByRole('button', { name: 'Vincular' });
    await expect(vincularBtn).toBeVisible();
    await vincularBtn.click();

    // DependencyLinkerModal opens
    const modal = page.getByRole('dialog', { name: 'Vincular Resposta de Dependência' });
    await expect(modal).toBeVisible();
    await expect(page.getByText('Vincular Resposta de Dependência')).toBeVisible();

    // Verify available request is listed and inspect response inside modal
    const requestItem = modal.getByRole('button', { name: /Autenticação Login/i });
    await expect(requestItem).toBeVisible();

    // Verify response body tree inspector renders tokens
    const tokenField = modal.getByTitle(/Clique para inserir.*token/i).first();
    await expect(tokenField).toBeVisible();

    // Click the field to insert token into editor
    await tokenField.click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Check that URL input has the inserted {{$request[...]}} token
    const urlVal = await urlInput.inputValue();
    expect(urlVal).toContain('{{$request[');
    expect(urlVal).toContain('.response.body.');
  });

  test('should chain responses using {{$request["id"].response.body.token}} across requests and display syntax highlighted response', async ({ page }) => {
    let interceptedToken = '';

    await page.route('**/api/requests/execute', async (route) => {
      const data = JSON.parse(route.request().postData() || '{}');
      if (data.url.includes('/api/auth')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 200,
            statusText: 'OK',
            body: JSON.stringify({ token: 'jwt-chain-secret-999', userId: 'user-777' }),
          }),
        });
      } else {
        interceptedToken = data.headers?.['Authorization'] || data.url;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 200,
            statusText: 'OK',
            body: JSON.stringify({ success: true, authorizedUser: 'user-777' }),
          }),
        });
      }
    });

    // Step 1: Execute first request (Auth)
    const urlInput = page.getByLabel('URL da requisição');
    await urlInput.fill('https://api.example.com/api/auth');
    await page.getByRole('button', { name: /enviar/i }).click();

    const statusBadge = page.getByTestId('status-badge');
    await expect(statusBadge).toBeVisible();
    await expect(statusBadge).toHaveText(/200 OK/);

    // Step 2: Use response chaining in second request
    await urlInput.fill('https://api.example.com/api/data?token={{$request["req-last"].response.body.token}}');
    await page.getByRole('button', { name: /enviar/i }).click();

    await expect.poll(() => interceptedToken).toContain('jwt-chain-secret-999');

    // Step 3: Verify syntax highlighted payload for keys
    const prettyContent = page.getByTestId('response-pretty-content');
    await expect(prettyContent).toBeVisible();
    const keyTokens = prettyContent.locator('.text-sky-400');
    await expect(keyTokens.filter({ hasText: '"success"' })).toBeVisible();
    await expect(keyTokens.filter({ hasText: '"authorizedUser"' })).toBeVisible();
  });

  test('should sync collection via OpenAPI modal with non-destructive merge report and display audit banner', async ({ page }) => {
    // Verify version badge shows v0.4.0
    await expect(page.getByText('v0.4.0')).toBeVisible();

    // Mock POST **/api/collections/**/sync to return SyncReport
    await page.route('**/api/collections/**/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          addedRequests: 1,
          updatedRequests: 1,
          fieldsAdded: 2,
          fieldsRemoved: 1,
          fieldsPreserved: 3,
        }),
      });
    });

    // Click the collection settings icon button in sidebar
    const settingsBtn = page.locator('aside').getByRole('button', { name: 'Configurações da coleção Minha API' });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    // Verify CollectionSettingsModal opens (role="dialog")
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Fill in OpenAPI Spec URL
    const urlInput = modal.getByLabel('URL da Especificação OpenAPI (v3.x JSON/YAML)');
    await urlInput.fill('https://api.example.com/openapi.json');

    // Click "Sincronizar Coleção"
    const syncBtn = modal.getByRole('button', { name: 'Sincronizar Coleção' });
    await syncBtn.click();

    // Verify sync report card appears (data-testid="sync-report-card") with audit counts
    const reportCard = modal.getByTestId('sync-report-card');
    await expect(reportCard).toBeVisible();
    await expect(reportCard).toContainText('Requisições Adicionadas');
    await expect(reportCard).toContainText('Requisições Atualizadas');
    await expect(reportCard).toContainText('Campos Adicionados');
    await expect(reportCard).toContainText('Campos Removidos');
    await expect(reportCard).toContainText('Campos Preservados');

    // Close modal
    const closeBtn = modal.getByRole('button', { name: 'Fechar modal' });
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // Verify the audit banner (data-testid="audit-summary-banner") is visible on the main page
    const auditBanner = page.getByTestId('audit-summary-banner');
    await expect(auditBanner).toBeVisible();
    await expect(auditBanner).toContainText('1 requisições adicionadas');
    await expect(auditBanner).toContainText('1 atualizadas');
    await expect(auditBanner).toContainText('2 campos adicionados');
    await expect(auditBanner).toContainText('1 removidos');
    await expect(auditBanner).toContainText('3 preservados intactos');
  });

  test('should perform quick sync on collection with spinner animation and show audit summary banner', async ({ page }) => {
    let resolveSync: () => void = () => {};
    const syncPromise = new Promise<void>((resolve) => {
      resolveSync = resolve;
    });

    await page.route('**/api/collections/**/sync', async (route) => {
      await syncPromise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          addedRequests: 2,
          updatedRequests: 1,
          fieldsAdded: 3,
          fieldsRemoved: 0,
          fieldsPreserved: 5,
        }),
      });
    });

    // Click the quick sync icon button in sidebar
    const quickSyncBtn = page.locator('aside').getByRole('button', { name: 'Sincronizar coleção Minha API' });
    await expect(quickSyncBtn).toBeVisible();
    await quickSyncBtn.click();

    // Verify spinner animation appears during sync
    const spinner = quickSyncBtn.locator('svg.animate-spin');
    await expect(spinner).toBeVisible();

    // Complete the mock sync
    resolveSync();

    // Verify audit banner displays results on completion
    const auditBanner = page.getByTestId('audit-summary-banner');
    await expect(auditBanner).toBeVisible();
    await expect(auditBanner).toContainText('2 requisições adicionadas');
    await expect(auditBanner).toContainText('1 atualizadas');
    await expect(auditBanner).toContainText('3 campos adicionados');
    await expect(auditBanner).toContainText('5 preservados intactos');
  });
});
