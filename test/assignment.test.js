'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { testing } = require('../src/assignment');

function launchTestBrowser() {
  const browser = process.env.PEARSON_TEST_BROWSER || 'chrome';
  return chromium.launch(browser === 'chromium'
    ? { headless: true }
    : { channel: browser, headless: true });
}

test('does not offer a disabled lesson action', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <mat-row role="row">
        <span class="mat-column-lessonTitle">Locked lesson</span>
        <span class="mat-column-score">0%</span>
        <button disabled>CONTINUE</button>
      </mat-row>
      <mat-row role="row">
        <span class="mat-column-lessonTitle">Open lesson</span>
        <span class="mat-column-score">50%</span>
        <button>CONTINUE</button>
      </mat-row>
    `);
    const lessons = await testing.lessonEntries(page);
    assert.equal(lessons[0].action, '');
    assert.equal(lessons[1].action, 'CONTINUE');
  } finally {
    await browser.close();
  }
});

test('opens a lesson that navigates in the current tab', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.route('https://englishconnect.pearson.com/**', route =>
      route.fulfill({ body: '<html><body></body></html>' }));
    await page.goto('https://englishconnect.pearson.com/assignments-v2/assignment/1/assignment-student-details/2/edit');
    await page.setContent(`
      <mat-row role="row"><button id="open">CONTINUE</button></mat-row>
      <script>
        document.querySelector('#open').addEventListener('click', () => {
          history.pushState({}, '', '/assignments/view/2/3/new/next/test');
          const iframe = document.createElement('iframe');
          iframe.id = 'content-iframe';
          iframe.srcdoc = '<button class="ic_button_done">Done</button>';
          document.body.append(iframe);
        });
      </script>
    `);
    const lessonPage = await testing.openLesson(page, 0);
    assert.equal(lessonPage, page);
    assert.match(page.url(), /\/assignments\/view\//);
  } finally {
    await browser.close();
  }
});
