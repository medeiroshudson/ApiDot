const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/opt/data/workspace/ApiDot/screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  process.env.CHROME_BIN ||
  '/opt/hermes/tools/chromium-1208/chrome-linux64/chrome';

async function run() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  // Mock server response
  const setupMocks = async (page) => {
    await page.route('**/api/requests/execute', async (route) => {
      const data = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req-98765-prod',
            'server': 'ApiDot.Server .NET 9.0'
          },
          body: JSON.stringify({
            status: "success",
            user: {
              id: "usr_882910",
              name: "Hudson Medeiros",
              email: "hudson.rocha@viveo.com.br",
              roles: ["admin", "developer"],
              active: true,
              balance: 1450.75,
              metadata: null
            },
            auth: {
              token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token-auth-valid",
              expiresIn: 3600
            },
            activeEnvironment: "{{baseUrl}}"
          }),
          timing: {
            dnsLookupMs: 4.2,
            tlsHandshakeMs: 12.8,
            timeToFirstByteMs: 45.1,
            contentTransferMs: 8.5,
            totalDurationMs: 70.6
          }
        })
      });
    });
  };

  // 1. Desktop View (1440x900) - Main with Response Syntax Highlighting
  console.log('Capturing Desktop Main View...');
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  await setupMocks(desktopPage);
  await desktopPage.goto('http://localhost:3000');
  await desktopPage.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

  // Execute request to populate ResponseViewer with colored syntax
  const urlInput = desktopPage.getByLabel('URL da requisição');
  await urlInput.fill('https://api.viveo.internal/v1/users/me');
  await desktopPage.getByRole('button', { name: /enviar/i }).click();
  await desktopPage.getByTestId('status-badge').waitFor({ state: 'visible' });
  await desktopPage.waitForTimeout(500);

  await desktopPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '01-desktop-main-syntax-highlighting.png'),
    fullPage: false
  });

  // 2. Desktop Autocomplete Popover
  console.log('Capturing Desktop Autocomplete Popover...');
  await urlInput.focus();
  await urlInput.fill('https://api.viveo.internal/v1/users/{{');
  const popover = desktopPage.getByRole('listbox', { name: 'Sugestões de autocompletar' });
  await popover.waitFor({ state: 'visible' });
  await desktopPage.waitForTimeout(400);

  await desktopPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '02-desktop-autocomplete-popover.png'),
    fullPage: false
  });

  // Clear input back to valid URL
  await urlInput.fill('https://api.viveo.internal/v1/users/me');
  await desktopPage.keyboard.press('Escape');
  await desktopPage.waitForTimeout(200);

  // 3. Desktop Dependency Linker Modal
  console.log('Capturing Desktop Dependency Linker Modal...');
  const vincularBtn = desktopPage.getByRole('button', { name: 'Vincular' });
  await vincularBtn.click();
  const linkerModal = desktopPage.getByRole('dialog', { name: 'Vincular Resposta de Dependência' });
  await linkerModal.waitFor({ state: 'visible' });
  await desktopPage.waitForTimeout(500);

  await desktopPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '03-desktop-dependency-linker-modal.png'),
    fullPage: false
  });

  // Close Linker modal
  await desktopPage.keyboard.press('Escape');
  await desktopPage.waitForTimeout(300);

  // 4. Desktop Environment Modal
  console.log('Capturing Desktop Environment Modal...');
  const envBtn = desktopPage.getByRole('button', { name: 'Configurar ambientes e variáveis' });
  await envBtn.click();
  const envModal = desktopPage.getByRole('dialog', { name: 'Ambientes e Variáveis' });
  await envModal.waitFor({ state: 'visible' });
  await desktopPage.waitForTimeout(500);

  await desktopPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '04-desktop-environment-modal.png'),
    fullPage: false
  });

  await desktopContext.close();

  // 5. Mobile View (390x844 - iPhone 14 style)
  console.log('Capturing Mobile Views...');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await setupMocks(mobilePage);
  await mobilePage.goto('http://localhost:3000');
  await mobilePage.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

  // 5.1 Mobile Request Editor (Omnibar & Toolbar)
  await mobilePage.getByLabel('URL da requisição').fill('https://api.viveo.internal/v1/auth/token');
  await mobilePage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '05-mobile-request-editor.png'),
    fullPage: false
  });

  // 5.2 Mobile Execute & Response View
  await mobilePage.getByRole('button', { name: /enviar/i }).click();
  await mobilePage.getByTestId('status-badge').waitFor({ state: 'visible' });
  await mobilePage.waitForTimeout(500);

  // On mobile, click the "Resposta" button toggle
  const respostaBtn = mobilePage.getByRole('button', { name: /^Resposta/i });
  if (await respostaBtn.isVisible()) {
    await respostaBtn.click();
    await mobilePage.waitForTimeout(400);
  }

  await mobilePage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '06-mobile-response-syntax-highlighting.png'),
    fullPage: false
  });

  // 5.3 Mobile Dependency Linker Modal
  // Switch back to Requisição tab
  const reqBtn = mobilePage.getByRole('button', { name: /^Requisição$/i });
  if (await reqBtn.isVisible()) {
    await reqBtn.click();
    await mobilePage.waitForTimeout(300);
  }
  const mobileVincular = mobilePage.getByRole('button', { name: 'Vincular' });
  await mobileVincular.click();
  const mobileLinkerModal = mobilePage.getByRole('dialog', { name: 'Vincular Resposta de Dependência' });
  await mobileLinkerModal.waitFor({ state: 'visible' });
  await mobilePage.waitForTimeout(400);

  await mobilePage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '07-mobile-dependency-linker-modal.png'),
    fullPage: false
  });

  await mobileContext.close();
  await browser.close();
  console.log('All screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
