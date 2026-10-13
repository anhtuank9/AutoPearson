// AutoPearson — Copyright (c) 2026 anhtuank9. All rights reserved.
// Non-commercial use only. Copying or using this code for profit requires
// prior written permission: https://github.com/anhtuank9. See LICENSE.
'use strict';

const { chromium } = require('playwright');
const { loadConfig } = require('./config');
const { ensureSignedIn, runAssignments, saveDiagnostic } = require('./assignment');
const { runMyContent, runMyContentSolve } = require('./my-content');

function browserLaunchOptions(config) {
  const options = {
    headless: config.headless,
    args: ['--disable-save-password-bubble', '--disable-dev-shm-usage'],
  };
  if (config.browser !== 'chromium') options.channel = config.browser;
  return options;
}

function printCopyrightNotice() {
  console.log('AutoPearson © 2026 anhtuank9. All rights reserved.');
  console.log('Non-commercial use only. Copying or using this code for profit requires prior written permission.');
  console.log('Contact: https://github.com/anhtuank9 | License: LICENSE');
}

async function main() {
  printCopyrightNotice();
  const config = loadConfig();
  const browser = await chromium.launch(browserLaunchOptions(config));
  const context = await browser.newContext({ viewport: { width: 1440, height: config.viewportHeight } });
  const page = await context.newPage();
  let activePage = page;
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(60_000);
  try {
    const connectPage = await ensureSignedIn(page, config);
    activePage = connectPage;
    if (config.section === 'my-content') {
      const result = await runMyContent(connectPage, config);
      console.log(`My Content preview: ${result.courses} course(s), ${result.lessons} lesson(s) listed. No lesson was opened or checked.`);
      return;
    }
    if (config.section === 'my-content-solve') {
      const result = await runMyContentSolve(connectPage, config);
      console.log(`My Content: visited ${result.visited} lesson(s), saved ${result.completed}, already complete ${result.alreadyComplete}, failed ${result.failures.length}.`);
      if (result.failures.length) process.exitCode = 2;
      return;
    }
    const result = await runAssignments(connectPage, config);
    console.log(`Checked ${result.checked} active assignments. ${result.inaccessible.length} lesson(s) remain inaccessible; ${result.unopenedAssignments.length} assignment(s) did not open; ${result.closedBelow100.length} closed assignment(s) are below 100%.`);
    if (result.unopenedAssignments.length) {
      console.log(`Could not open: ${result.unopenedAssignments.map(entry => entry.title).join('; ')}`);
    }
    if (result.closedBelow100.length) {
      console.log(`Closed below 100%: ${result.closedBelow100.map(entry => `${entry.title} ${entry.score}%`).join('; ')}`);
    }
    if (result.inaccessible.length || result.unopenedAssignments.length || result.closedBelow100.length) process.exitCode = 2;
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
