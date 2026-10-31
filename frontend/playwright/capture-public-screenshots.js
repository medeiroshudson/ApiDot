const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../../docs/assets/screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const PORT = process.env.PORT || 3005;
const BASE_URL = `http://localhost:${PORT}`;

const MOCK_WORKSPACES = [
  { id: 'ws-ecommerce', name: 'E-Commerce Core', createdAtUtc: '2026-10-27T10:00:00Z' },
  { id: 'ws-payments', name: 'Payments & Billing', createdAtUtc: '2026-10-27T10:00:00Z' },
  { id: 'ws-analytics', name: 'Analytics & Events', createdAtUtc: '2026-10-27T10:00:00Z' },
];

const MOCK_ORDER_SCHEMA = {
  summary: 'Create Customer Order',
  description: 'Validates line items, reserves inventory across regional fulfillment centers, and queues carrier shipment.',
  parameters: [
    {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'Unique UUID to prevent duplicate order placement',
      defaultOrExample: '7f8b1a2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c',
    },
  ],
  body: {
    type: 'object',
    required: ['customerId', 'items'],
    properties: {
      customerId: {
        type: 'string',
        description: 'Unique customer identifier',
        example: 'usr_44921',
      },
      items: {
        type: 'array',
        description: 'List of product SKUs and quantities',
        example: '[{"sku":"PROD-9921","quantity":1}]',
      },
      priority: {
        type: 'string',
        description: 'Shipping tier priority',
        example: 'express',
      },
    },
  },
  responses: [
    {
      statusCode: '201',
      description: 'Order created and queued for processing',
      example: '{"id":"ord_882910","status":"confirmed","total":224.64}',
    },
    {
      statusCode: '400',
      description: 'Invalid item SKU or insufficient inventory',
      example: '{"error":"INVALID_SKU"}',
    },
    {
      statusCode: '401',
      description: 'Missing or expired authentication token',
      example: '{"error":"UNAUTHORIZED"}',
    },
  ],
};

const MOCK_TREE = {
  workspaceId: 'ws-ecommerce',
  workspaceName: 'E-Commerce Core',
  collections: [
    {
      id: 'col-orders',
      name: 'Orders API',
      openApiSpecUrl: 'https://api.example.com/openapi.json',
      defaultTarget: 'Inherit',
      folders: [
        {
          id: 'fld-v1',
          name: 'v1',
          subFolders: [],
          requests: [
            {
              id: 'req-get-order',
              name: 'Get Order By ID',
              method: 'GET',
              url: 'https://api.example.com/v1/orders/ord_882910',
              target: 'Inherit',
              headersJson: JSON.stringify({ Accept: 'application/json' }, null, 2),
              bodyType: 'None',
              bodyContent: null,
              collectionId: 'col-orders',
              folderId: 'fld-v1',
            },
            {
              id: 'req-create-order',
              name: 'Create Order',
              method: 'POST',
              url: 'https://api.example.com/v1/orders',
              target: 'Inherit',
              headersJson: JSON.stringify({ 'Content-Type': 'application/json' }, null, 2),
              bodyType: 'Json',
              bodyContent: JSON.stringify(
                { customerId: 'usr_44921', items: [{ sku: 'PROD-9921', quantity: 1 }] },
                null,
                2
              ),
              schemaDefinition: JSON.stringify(MOCK_ORDER_SCHEMA, null, 2),
              collectionId: 'col-orders',
              folderId: 'fld-v1',
            },
          ],
        },
      ],
      requests: [],
    },
    {
      id: 'col-customers',
      name: 'Customers API',
      openApiSpecUrl: null,
      defaultTarget: 'Inherit',
      folders: [],
      requests: [
        {
          id: 'req-list-customers',
          name: 'List Customers',
          method: 'GET',
          url: 'https://api.example.com/v1/customers',
          target: 'Inherit',
          headersJson: '{}',
          bodyType: 'None',
          bodyContent: null,
          collectionId: 'col-customers',
          folderId: null,
        },
      ],
    },
  ],
};

const MOCK_EXECUTE_RESPONSE = {
  statusCode: 200,
  statusText: 'OK',
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'x-request-id': 'req-ord-882910-live',
    'server': 'Kestrel / .NET 9.0',
    'cache-control': 'no-cache',
    'date': 'Sat, 31 Oct 2026 14:32:00 GMT',
  },
  body: JSON.stringify(
    {
      status: 'success',
      order: {
        id: 'ord_882910',
        customer: {
          id: 'usr_44921',
          name: 'Alex Morgan',
          email: 'alex@example.com',
        },
        items: [
          {
            sku: 'PROD-9921',
            name: 'Mechanical Keyboard Pro',
            quantity: 1,
            unitPrice: 149.0,
          },
          {
            sku: 'ACC-1082',
            name: 'Desk Mat Matte Black',
            quantity: 2,
            unitPrice: 29.5,
          },
        ],
        currency: 'USD',
        subtotal: 208.0,
        tax: 16.64,
        total: 224.64,
        status: 'confirmed',
        createdAt: '2026-10-31T14:32:00Z',
      },
    },
    null,
    2
  ),
  timing: {
    dnsLookupMs: 3.8,
    tlsHandshakeMs: 11.2,
    timeToFirstByteMs: 42.5,
    contentTransferMs: 6.1,
    totalDurationMs: 63.6,
  },
};

const MOCK_SYNC_RESPONSE = {
  addedRequests: 4,
  updatedRequests: 2,
  fieldsAdded: 8,
  fieldsRemoved: 1,
  fieldsPreserved: 15,
};

async function run() {
  console.log(`Launching browser for public sanitized screenshots against ${BASE_URL}...`);
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const setupMocks = async (page) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'usr_44921',
          email: 'alex@example.com',
          displayName: 'Alex Morgan',
          isRoot: true,
          locale: 'en-US',
          workspaces: [
            { id: 'ws-ecommerce', name: 'E-Commerce Core', role: 'Owner' },
            { id: 'ws-payments', name: 'Payments & Billing', role: 'Admin' },
            { id: 'ws-analytics', name: 'Analytics & Events', role: 'Member' },
          ],
        }),
      });
    });

    await page.route('**/api/auth/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          oidcEnabled: true,
          localAuthEnabled: true,
          providerName: 'Authentik',
        }),
      });
    });

    await page.route('**/api/devices', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/workspaces', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_WORKSPACES),
      });
    });

    await page.route('**/api/workspaces/*/tree', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TREE),
      });
    });

    await page.route('**/api/requests/execute', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_EXECUTE_RESPONSE),
      });
    });

    await page.route('**/api/collections/**/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SYNC_RESPONSE),
      });
    });

    await page.route('**/api/collections/**/openapi', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route('**/api/agent/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ online: true, version: '0.4.0' }),
      });
    });
  };

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // High-resolution retina capture
  });

  await context.addInitScript(() => {
    localStorage.setItem('apidot_locale', 'en-US');
    localStorage.setItem('apidot_active_workspace_id', 'ws-ecommerce');
    localStorage.setItem(
      'apidot_workspace_storage',
      JSON.stringify({
        state: {
          workspaces: [
            { id: 'ws-ecommerce', name: 'E-Commerce Core', createdAtUtc: '2026-10-27T10:00:00Z' },
            { id: 'ws-payments', name: 'Payments & Billing', createdAtUtc: '2026-10-27T10:00:00Z' },
            { id: 'ws-analytics', name: 'Analytics & Events', createdAtUtc: '2026-10-27T10:00:00Z' },
          ],
          activeWorkspaceId: 'ws-ecommerce',
          error: null,
        },
        version: 0,
      })
    );
    localStorage.setItem(
      'apidot_environment_storage',
      JSON.stringify({
        state: {
          environments: [
            {
              name: 'Production',
              variables: [
                { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
              ],
            },
            {
              name: 'Staging',
              variables: [
                { key: 'baseUrl', value: 'https://staging.api.example.com', enabled: true },
              ],
            },
          ],
          activeEnvironment: 'Production',
          globals: [
            { key: 'apiVersion', value: 'v1', enabled: true },
          ],
          collectionVariables: [],
        },
        version: 0,
      })
    );
  });

  const page = await context.newPage();
  await setupMocks(page);

  console.log('Navigating to workspace...');
  await page.goto(`${BASE_URL}/workspace/ws-ecommerce/request/req-get-order`);
  await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });
  await page.waitForTimeout(600);

  // 1. Desktop Hero Request/Response View
  console.log('Capturing 01-desktop-hero-request-response.png...');
  const sendBtn = page.getByRole('button', { name: /send request/i });
  await sendBtn.click();
  await page.getByTestId('status-badge').waitFor({ state: 'visible' });
  await page.waitForTimeout(600);

  const heroPath = path.join(SCREENSHOTS_DIR, '01-desktop-hero-request-response.png');
  await page.screenshot({ path: heroPath, fullPage: false });
  console.log(`Saved: ${heroPath}`);

  // 2. Desktop Variable Autocomplete
  console.log('Capturing 02-desktop-variable-autocomplete.png...');
  const urlInput = page.getByRole('textbox', { name: /request url/i, exact: true });
  await urlInput.focus();
  await urlInput.fill('https://api.example.com/v1/orders/{{');
  const popover = page.getByRole('listbox', { name: /autocomplete suggestions/i });
  await popover.waitFor({ state: 'visible' });
  await page.waitForTimeout(400);

  const autocompletePath = path.join(SCREENSHOTS_DIR, '02-desktop-variable-autocomplete.png');
  await page.screenshot({ path: autocompletePath, fullPage: false });
  console.log(`Saved: ${autocompletePath}`);

  // Clean up input after screenshot
  await urlInput.fill('https://api.example.com/v1/orders/ord_882910');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 3. Desktop OpenAPI Sync Audit Modal
  console.log('Capturing 03-desktop-openapi-sync-audit.png...');
  const settingsBtn = page.locator('aside').getByRole('button', { name: /collection settings.*orders api/i });
  await settingsBtn.click();
  const modal = page.getByRole('dialog');
  await modal.waitFor({ state: 'visible' });

  // Switch to OpenAPI tab
  const openapiTab = modal.getByRole('tab', { name: /openapi/i });
  await openapiTab.click();
  await page.waitForTimeout(300);

  // Set OpenAPI Spec URL
  const specInput = modal.locator('#openapi-spec-url');
  await specInput.fill('https://api.example.com/openapi.json');
  await page.waitForTimeout(200);

  // Click Sync Collection
  const syncBtn = modal.getByRole('button', { name: /sync collection/i });
  await syncBtn.click();
  await modal.getByTestId('sync-report-section').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);

  const syncAuditPath = path.join(SCREENSHOTS_DIR, '03-desktop-openapi-sync-audit.png');
  await page.screenshot({ path: syncAuditPath, fullPage: false });
  console.log(`Saved: ${syncAuditPath}`);

  // Close modal
  await modal.getByRole('button', { name: /close collection settings/i }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.waitForTimeout(300);

  // 4. Desktop Workspace and Tree
  console.log('Capturing 04-desktop-workspace-and-tree.png...');
  const wsTrigger = page.getByTestId('workspace-switcher-trigger');
  await wsTrigger.click();
  await page.getByTestId('workspace-switcher-dropdown').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);

  const workspaceTreePath = path.join(SCREENSHOTS_DIR, '04-desktop-workspace-and-tree.png');
  await page.screenshot({ path: workspaceTreePath, fullPage: false });
  console.log(`Saved: ${workspaceTreePath}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 5. Desktop Request Specification Tab (Key differentiator)
  console.log('Capturing 05-desktop-request-specification.png...');
  // Click on 'Create Order' in collection tree
  const createOrderNode = page.locator('aside').getByText('Create Order', { exact: true });
  await createOrderNode.click();
  await page.waitForTimeout(400);

  // Switch to Specification tab
  const specTab = page.getByRole('tab', { name: /specification/i });
  await specTab.click();
  await page.getByText('Create Customer Order').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);

  const specPath = path.join(SCREENSHOTS_DIR, '05-desktop-request-specification.png');
  await page.screenshot({ path: specPath, fullPage: false });
  console.log(`Saved: ${specPath}`);

  await context.close();
  await browser.close();
  console.log('All public screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Error capturing public screenshots:', err);
  process.exit(1);
});
