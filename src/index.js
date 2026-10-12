'use strict';

const { chromium } = require('playwright');
const { loadConfig } = require('./config');
const { ensureSignedIn, runAssignments, saveDiagnostic } = require('./assignment');

function browserLaunchOptions(config) {
  const options = {
    headless: config.headless,
    args: ['--disable-save-password-bubble', '--disable-dev-shm-usage'],
  };
  if (config.browser !== 'chromium') options.channel = config.browser;
  return options;
}

async function main() {
  const config = loadConfig();
  const browser = await chromium.launch(browserLaunchOptions(config));
  const context = await browser.newContext({ viewport: { width: 1440, height: config.viewportHeight } });
  const page = await context.newPage();
  let activePage = page;
  page.setDefaultTimeout(10_000);
  try {
    const connectPage = await ensureSignedIn(page, config);
    activePage = connectPage;
    const result = await runAssignments(connectPage, config);
    console.log(`Checked ${result.checked} active assignments. ${result.inaccessible.length} lessons remain inaccessible; ${result.closedBelow100.length} closed assignment(s) are below 100%.`);
    if (result.closedBelow100.length) {
      console.log(`Closed below 100%: ${result.closedBelow100.map(entry => `${entry.title} ${entry.score}%`).join('; ')}`);
    }
    if (result.inaccessible.length || result.closedBelow100.length) process.exitCode = 2;
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    if (!error.diagnosticSaved && !activePage.isClosed()) await saveDiagnostic(activePage, config, error.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { main, browserLaunchOptions };
