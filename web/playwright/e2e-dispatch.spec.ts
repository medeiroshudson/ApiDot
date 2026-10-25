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
});
