'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { playerScope, pageSignature, solveCurrentPage, advance, saveAndExit, firstVisible } = require('./player');

function log(message) { console.log(`[${new Date().toLocaleTimeString()}] ${message}`); }

async function dismissCookieDialog(page) {
  for (const selector of [
    '#close-pc-btn-handler',
    '.onetrust-close-btn-handler',
    '#onetrust-reject-all-handler',
    '#onetrust-accept-btn-handler',
  ]) {
    const control = page.locator(selector).first();
    if (await control.isVisible().catch(() => false)) {
      await control.click({ timeout: 5000 }).catch(() => {});
    }
  }
  const overlay = page.locator('.onetrust-pc-dark-filter');
  if (await overlay.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

async function dismissWalkthrough(page) {
  const tour = page.locator('.gc-control:visible').first();
  if (!await tour.isVisible().catch(() => false)) return;
  const close = tour.locator('[class*="close" i], [aria-label*="close" i]').first();
  if (await close.isVisible().catch(() => false)) await close.click();
  else {
    const box = await tour.boundingBox();
    if (!box) throw new Error('Walkthrough has no visible close control');
    await page.mouse.click(box.x + box.width - 40, box.y + 40);
  }
  await tour.waitFor({ state: 'hidden', timeout: 5000 });
  log('Closed Pearson welcome tour.');
}

async function ensureSignedIn(page, config) {
  let clientId = '';
  await page.goto(config.startUrl, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).hostname === 'englishconnect.pearson.com' && new URL(page.url()).pathname === '/') {
    await page.goto('https://englishconnect.pearson.com/accounts/login', { waitUntil: 'domcontentloaded' });
  }
  const reachedLoginOrPortal = url =>
    url.hostname === 'login.pearson.com' ||
    (url.hostname === 'english-dashboard.pearson.com' &&
      (url.pathname === '/' || url.pathname.startsWith('/dashboard'))) ||
    (url.hostname === 'englishconnect.pearson.com' && /^\/(home|assignments)/.test(url.pathname));
  await page.waitForURL(reachedLoginOrPortal, { timeout: 60_000, waitUntil: 'domcontentloaded' });
  if (/login\.pearson\.com/.test(page.url())) {
    clientId = new URL(page.url()).searchParams.get('client_id') || '';
    const username = page.getByRole('textbox', { name: /^Username$/i });
    const password = page.locator('input[type="password"]').first();
    await username.waitFor({ state: 'visible', timeout: 30_000 });
    await dismissCookieDialog(page);
    if (config.username && config.password) {
      await username.fill(config.username);
      await password.fill(config.password);
      await dismissCookieDialog(page);
      await page.getByRole('button', { name: /^Sign in$/i }).click();
      log('Submitted Pearson sign-in form.');
    } else {
      log('Please sign in in the opened browser. Waiting for the dashboard...');
    }
    await page.waitForURL(url =>
      (url.hostname === 'english-dashboard.pearson.com' &&
        (url.pathname === '/' || url.pathname.startsWith('/dashboard'))) ||
      (url.hostname === 'englishconnect.pearson.com' && /^\/(home|assignments)/.test(url.pathname)),
    { timeout: 300_000, waitUntil: 'domcontentloaded' });
  }
  if (/english-dashboard\.pearson\.com/.test(page.url())) {
    if (clientId) {
      const directPage = await page.context().newPage();
      try {
        const deepLink = `https://englishconnect.pearson.com/deeplinks/pearson?clientId=${encodeURIComponent(clientId)}&type=STUDENT`;
        await directPage.goto(deepLink, { waitUntil: 'domcontentloaded' });
        await directPage.waitForURL(url =>
          url.hostname === 'englishconnect.pearson.com' &&
          /^\/(assignments-v2|courses|home|my-content)/.test(url.pathname),
        { timeout: 60_000, waitUntil: 'domcontentloaded' });
        log('Opened English Connect through its Pearson link.');
        return directPage;
      } catch {
        const url = new URL(directPage.url());
        log(`Pearson link ended at ${url.hostname}${url.pathname}; trying the dashboard button.`);
        await directPage.close();
      }
    }
    const open = page.getByRole('button', { name: 'Pearson English Connect' });
    await open.waitFor({ state: 'visible', timeout: 30_000 });
    await dismissWalkthrough(page);
    const connectUrl = url => url.hostname === 'englishconnect.pearson.com' &&
      /^\/(assignments-v2|courses|home|my-content)/.test(url.pathname);
    const popupPromise = page.context().waitForEvent('page', { timeout: 15_000 });
    const sameTabPromise = page.waitForURL(connectUrl, { timeout: 15_000 }).then(() => page);
    const openedPromise = Promise.any([popupPromise, sameTabPromise]).catch(() => null);
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await open.click({ timeout: 5000 }); break; }
      catch (error) {
        if (!await page.locator('.gc-control:visible').first().isVisible().catch(() => false) || attempt === 2) throw error;
        await dismissWalkthrough(page);
      }
    }
    const connectPage = await openedPromise;
    if (!connectPage) throw new Error('Pearson English Connect did not open');
    connectPage.on('framenavigated', frame => {
      if (frame !== connectPage.mainFrame()) return;
      try {
        const url = new URL(frame.url());
        log(`English Connect redirect: ${url.hostname}${url.pathname}`);
      } catch {}
    });
    try {
      await connectPage.waitForURL(connectUrl,
      { timeout: 120_000, waitUntil: 'domcontentloaded' });
    } catch (error) {
      await saveDiagnostic(connectPage, config, error.message);
      throw error;
    }
    log(`Opened English Connect: ${connectPage.url()}`);
    return connectPage;
  }
  log(`Signed in: ${new URL(page.url()).hostname}`);
  return page;
}

async function openAssignments(page) {
  const listUrl = 'https://englishconnect.pearson.com/assignments-v2/assignments-students-list';
  if (!page.url().startsWith(listUrl)) await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('mat-row[role="row"]').first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function actionEntries(page) {
  return page.locator('mat-row[role="row"]').evaluateAll(elements => {
    return elements.map((row, index) => {
      const cell = name => row.querySelector(`.mat-column-${name}`);
      const title = (cell('title')?.innerText || '').trim();
      const teacher = (cell('teacherName')?.innerText || '').trim();
      const dueCell = cell('dueDate');
      const due = dueCell?.getAttribute('aria-label') || dueCell?.innerText || '';
      const state = (cell('state')?.innerText || '').trim().toLowerCase();
      const score = Number.parseFloat((cell('score')?.innerText || '').replace('%', ''));
      const action = [...row.querySelectorAll('button,[role="button"]')]
        .filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true')
        .map(button => (button.innerText || '').trim().toUpperCase())
        .find(text => text === 'CONTINUE' || text === 'START') || '';
      return { index, key: `${title}|${teacher}|${due}`, title, teacher, due,
        dueMs: Date.parse(due) || 0, score, state, action };
    }).filter(entry => entry.title);
  });
}

async function openAction(page, index) {
  const row = page.locator('mat-row[role="row"]').nth(index);
  const listUrl = page.url();
  for (let attempt = 1; attempt <= 2; attempt++) {
    await row.getByRole('button', { name: /^(CONTINUE|START)$/i }).click();
    try {
      await page.waitForURL(/assignment-student-details/,
        { timeout: 15_000, waitUntil: 'domcontentloaded' });
      await page.locator('mat-row[role="row"]').first().waitFor({ state: 'visible', timeout: 30_000 });
      return true;
    } catch (error) {
      if (page.url() !== listUrl || !/Timeout \d+ms exceeded/.test(error.message)) throw error;
      if (attempt < 2) log('Assignment did not open; retrying START/CONTINUE (1/2).');
    }
  }
  return false;
}

async function lessonEntries(page) {
  return page.locator('mat-row[role="row"]').evaluateAll(elements => elements.map((row, index) => {
    const cell = name => row.querySelector(`.mat-column-${name}`);
    const title = (cell('lessonTitle')?.innerText || '').trim();
    const scoreText = (cell('score')?.innerText || '').trim();
    const score = Number.parseFloat(scoreText.replace('%', ''));
    const action = [...row.querySelectorAll('button')]
      .filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true')
      .map(button => (button.innerText || '').trim().toUpperCase())
      .find(text => text === 'CONTINUE' || text === 'START') || '';
    return { index, key: `${index}|${title}`, title, score, action };
  }).filter(entry => entry.title));
}

async function openLesson(page, index) {
  const row = page.locator('mat-row[role="row"]').nth(index);
  let lessonPage = null;
  for (let attempt = 1; attempt <= 3 && !lessonPage; attempt++) {
    const knownPages = new Set(page.context().pages());
    const detailUrl = page.url();
    const popupPromise = page.context().waitForEvent('page', { timeout: 30_000 });
    const sameTabPromise = page.waitForURL(url => {
      const nextUrl = url.toString();
      return nextUrl !== detailUrl &&
        /englishconnect\.pearson\.com\/assignments\/view\//.test(nextUrl);
    }, { timeout: 30_000 }).then(() => page);
    // Attach rejection handlers before clicking. Pearson sometimes keeps the
    // lesson in this tab, so the unused popup waiter is expected to time out.
    const openedPromise = Promise.any([popupPromise, sameTabPromise]).catch(() => null);
    await row.getByRole('button', { name: /^(CONTINUE|START)$/i }).click();
    lessonPage = await openedPromise;
    if (!lessonPage) {
      lessonPage = page.context().pages().find(current => !knownPages.has(current) && !current.isClosed()) || null;
      if (!lessonPage && attempt < 3) log(`Lesson did not open; retrying START/CONTINUE (${attempt}/3).`);
    }
  }
  if (!lessonPage) {
    const pages = page.context().pages().map(current => {
      try { const url = new URL(current.url()); return `${url.hostname}${url.pathname}`; }
      catch { return current.url(); }
    });
    throw new Error(`Lesson did not open after START/CONTINUE; tabs: ${JSON.stringify(pages)}`);
  }
  await lessonPage.locator('#content-iframe').waitFor({ state: 'attached', timeout: 30_000 });
  await lessonPage.frameLocator('#content-iframe')
    .locator('.ic_button_nextpage, .ic_button_check, .ic_button_done, .limited-show-answers-button')
    .first().waitFor({ state: 'attached', timeout: 120_000 });
  return lessonPage;
}

async function runAssignmentDetail(page, config) {
  const processedLessons = new Set();
  const attemptsByLesson = new Map();
  const previousScores = new Map();
  for (let i = 0; i < config.maxPages; i++) {
    const lessons = await lessonEntries(page);
    const next = lessons.find(lesson => lesson.action && !(lesson.score >= 100) && !processedLessons.has(lesson.key) &&
      (!config.lessonFilter || lesson.title.toLocaleLowerCase().includes(config.lessonFilter)));
    if (!next) {
      const unavailable = lessons.filter(lesson => !lesson.action && !(lesson.score >= 100) &&
        (!config.lessonFilter || lesson.title.toLocaleLowerCase().includes(config.lessonFilter)));
      if (unavailable.length) {
        const accessBlocked = await page.getByText('Block access after due date').isVisible().catch(() => false);
        log(`${unavailable.length} lessons remain below 100% without START/CONTINUE${accessBlocked ? ' (access blocked after due date)' : ''}: ${unavailable.map(lesson => `${lesson.title} ${Number.isNaN(lesson.score) ? '?' : lesson.score}%`).join('; ')}`);
      }
      return { completed: processedLessons.size, unavailable };
    }
    log(`Lesson: ${next.title} (${Number.isNaN(next.score) ? '?' : next.score}%)`);
    const detailUrl = page.url();
    const lessonPage = await openLesson(page, next.index);
    let lessonError = null;
    try {
      await runLesson(lessonPage, config);
    } catch (error) {
      if (!error.diagnosticSaved) {
        await saveDiagnostic(lessonPage, config, error.message);
        error.diagnosticSaved = true;
      }
      lessonError = error;
    } finally {
      if (lessonPage !== page && !lessonPage.isClosed()) await lessonPage.close();
    }
    if (lessonError && !lessonError.saveExitTimeout) throw lessonError;
    if (page.isClosed()) throw new Error('Assignment details tab closed unexpectedly');
    if (lessonError?.saveExitTimeout && lessonPage === page && page.url() !== detailUrl) {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('mat-row[role="row"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    const remaining = (await lessonEntries(page)).find(lesson => lesson.key === next.key && !(lesson.score >= 100));
    if (!remaining) {
      processedLessons.add(next.key);
      log(`Verified complete: ${next.title}${lessonError?.saveExitTimeout ? ' (score saved despite delayed exit)' : ''}.`);
      continue;
    }
    const attempts = (attemptsByLesson.get(next.key) || 0) + 1;
    const oldScore = previousScores.get(next.key) ?? next.score;
    attemptsByLesson.set(next.key, attempts);
    previousScores.set(next.key, remaining.score);
    log(`${next.title} is still ${remaining.score}%; retry ${attempts}/3.`);
    if (attempts >= 3 || (attempts >= 2 && remaining.score <= oldScore)) {
      throw new Error(`${next.title} remains below 100% (${remaining.score}%) after ${attempts} run(s)`);
    }
  }
  throw new Error(`Stopped after ${config.maxPages} lessons in one assignment`);
}

async function saveDiagnostic(page, config, reason) {
  fs.mkdirSync(config.diagnosticsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(config.diagnosticsDir, stamp);
  await page.screenshot({ path: `${base}.png`, timeout: 10_000 }).catch(() => {});
  const frames = [];
  for (const frame of page.frames()) {
    frames.push({
      url: frame.url(),
      text: await frame.locator('body').innerText({ timeout: 2000 }).catch(() => ''),
      controls: await frame.evaluate(() => [...document.querySelectorAll('input,select,textarea,.ic_button_nextpage,.ic_button_check,[class*="drag" i],[class*="drop" i],[class*="gap" i]')]
        .slice(0, 120)
        .map(element => ({ tag: element.tagName, className: String(element.className || ''),
          id: element.id, placeholder: element.getAttribute('placeholder'),
          outerHTML: element.outerHTML.slice(0, 400) }))).catch(() => []),
    });
  }
  const tourHtml = await page.locator('.gc-control').first()
    .evaluate(element => element.outerHTML.slice(0, 8000)).catch(() => '');
  fs.writeFileSync(`${base}.json`, JSON.stringify({ reason, url: page.url(), tourHtml, frames }, null, 2));
  log(`Diagnostic saved: ${base}.png and ${base}.json`);
}

async function runLesson(page, config) {
  const signatures = new Set();
  for (let number = 1; number <= config.maxPages; number++) {
    const scope = await playerScope(page);
    const signature = await pageSignature(scope);
    if (signatures.has(signature)) throw new Error(`The lesson returned to an earlier page (${number})`);
    signatures.add(signature);
    log(`Page ${number}: ${page.url()}`);
    const result = await solveCurrentPage(page, config.checkLimit);
    log(`Page ${number}: ${result.status}${result.plan ? `, ${result.plan.fields.length} fields, ${result.plan.choices.length} choices, ${result.plan.drops.length} drops, ${result.plan.coloring.length} colored words, ${result.plan.connections.length} connections` : ''}`);
    const afterAnswerSignature = await pageSignature(await playerScope(page));
    if (await advance(page, afterAnswerSignature)) continue;
    const finalText = await (await playerScope(page)).locator('body').innerText().catch(() => '');
    if (/Lesson Report/i.test(finalText)) log(`Lesson report: ${finalText.replace(/\s+/g, ' ').slice(0, 900)}`);
    await saveAndExit(page);
    return number;
  }
  throw new Error(`Stopped at PEARSON_MAX_PAGES=${config.maxPages}`);
}

async function runAssignments(page, config) {
  await openAssignments(page);
  const processed = new Set();
  const inaccessible = [];
  const unopenedAssignments = [];
  const closedBelow100 = new Map();
  for (let i = 0; i < config.maxAssignments; i++) {
    const entries = await actionEntries(page);
    for (const entry of entries) {
      if (/completed|submitted/.test(entry.state) && entry.score < 100 &&
          (!config.assignmentFilter || entry.title.toLocaleLowerCase().includes(config.assignmentFilter))) {
        closedBelow100.set(entry.key, entry);
      }
    }
    const next = entries.filter(entry => entry.action && !/completed|submitted/.test(entry.state))
      .sort((a, b) => b.dueMs - a.dueMs || a.index - b.index)
      .find(entry => entry.key && !processed.has(entry.key) &&
      (!config.assignmentFilter || entry.title.toLocaleLowerCase().includes(config.assignmentFilter)));
    if (!next) {
      const nextPage = page.getByRole('button', { name: 'Next page' });
      if (await nextPage.count() && await nextPage.isEnabled()) {
        const oldFirst = await page.locator('mat-row[role="row"]').first().innerText();
        await nextPage.click();
        await page.waitForFunction(old => {
          const first = document.querySelector('mat-row[role="row"]');
          return first && first.innerText !== old;
        }, oldFirst, { timeout: 30_000 });
        continue;
      }
      log(`Checked ${processed.size} active assignments; ${inaccessible.length} lesson(s) have no START/CONTINUE; ${unopenedAssignments.length} assignment(s) did not open; ${closedBelow100.size} closed assignment(s) are below 100%.`);
      return { checked: processed.size, inaccessible, unopenedAssignments, closedBelow100: [...closedBelow100.values()] };
    }
    log(`Assignment ${i + 1}: ${next.title} (due ${next.due})`);
    try {
      if (!await openAction(page, next.index)) {
        log(`Assignment ${next.title}: START/CONTINUE did not open the assignment.`);
        unopenedAssignments.push(next);
        processed.add(next.key);
        if (config.assignmentFilter) return { checked: processed.size, inaccessible, unopenedAssignments, closedBelow100: [...closedBelow100.values()] };
        continue;
      }
      const result = await runAssignmentDetail(page, config);
      log(`Assignment ${next.title}: completed ${result.completed} lessons; ${result.unavailable.length} unavailable.`);
      inaccessible.push(...result.unavailable.map(lesson => ({ assignment: next.title, ...lesson })));
      processed.add(next.key);
      await openAssignments(page);
      if (config.assignmentFilter) return { checked: processed.size, inaccessible, unopenedAssignments, closedBelow100: [...closedBelow100.values()] };
    } catch (error) {
      if (!error.diagnosticSaved) {
        await saveDiagnostic(page, config, error.message);
        error.diagnosticSaved = true;
      }
      throw error;
    }
  }
  throw new Error(`Stopped at PEARSON_MAX_ASSIGNMENTS=${config.maxAssignments}`);
}

module.exports = {
  ensureSignedIn,
  runAssignments,
  runLesson,
  saveDiagnostic,
  testing: { actionEntries, lessonEntries, openLesson },
};
