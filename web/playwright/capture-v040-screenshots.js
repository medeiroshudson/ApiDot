const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../../screenshots');
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

  const setupMocks = async (page) => {
    await page.route('**/api/collections/**/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          addedRequests: 2,
          updatedRequests: 1,
          fieldsAdded: 3,
          fieldsRemoved: 1,
          fieldsPreserved: 5,
        }),
      });
    });
  };

  // 1. Desktop Collection Settings Modal (1440x900)
  console.log('Capturing Desktop Collection Settings Modal...');
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  await setupMocks(desktopPage);
  await desktopPage.goto('http://localhost:3000');
  await desktopPage.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

  // Open Collection Settings Modal
  const settingsBtn = desktopPage.locator('aside').getByRole('button', { name: 'Configurações da coleção Minha API' });
  await settingsBtn.click();
  const modal = desktopPage.getByRole('dialog');
  await modal.waitFor({ state: 'visible' });

  // Fill in spec URL
  const urlInput = modal.getByLabel('URL da Especificação OpenAPI (v3.x JSON/YAML)');
  await urlInput.fill('https://api.empresa.com/v1/swagger.json');
  await desktopPage.waitForTimeout(400);

  await desktopPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '08-desktop-collection-settings-modal.png'),
    fullPage: false
  });

  // Sync to display report inside modal
  const syncBtn = modal.getByRole('button', { name: 'Sincronizar Coleção' });
  await syncBtn.click();
  await desktopPage.getByTestId('sync-report-card').waitFor({ state: 'visible' });
  await desktopPage.waitForTimeout(400);

  // 2. Desktop Audit Summary Banner
  // Close modal to see the Audit Summary Banner in the main page
  const closeBtn = modal.getByRole('button', { name: 'Fechar modal' });
  await closeBtn.click();
  const auditBanner = desktopPage.getByTestId('audit-summary-banner');
  await auditBanner.waitFor({ state: 'visible' });
  await desktopPage.waitForTimeout(400);

  await desktopPage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '09-desktop-collection-sync-audit-banner.png'),
    fullPage: false
  });

  await desktopContext.close();

  // 3. Mobile Collection Settings Modal (390x844)
  console.log('Capturing Mobile Collection Settings Modal...');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await setupMocks(mobilePage);
  await mobilePage.goto('http://localhost:3000');
  await mobilePage.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

  // Open drawer
  const menuBtn = mobilePage.getByRole('button', { name: 'Alternar menu de navegação' });
  await menuBtn.click();
  await mobilePage.waitForTimeout(300);

  // Click settings icon in drawer
  const mobileSettingsBtn = mobilePage.getByRole('button', { name: 'Configurações da coleção Minha API' });
  await mobileSettingsBtn.click();
  const mobileModal = mobilePage.getByTestId('collection-settings-backdrop');
  await mobileModal.waitFor({ state: 'visible' });
  await mobilePage.waitForTimeout(400);

  await mobilePage.screenshot({
    path: path.join(SCREENSHOTS_DIR, '10-mobile-collection-settings-modal.png'),
    fullPage: false
  });

  await mobileContext.close();
  await browser.close();
  console.log('v0.4.0 screenshots captured successfully!');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
