// AutoPearson — Copyright (c) 2026 anhtuank9. All rights reserved.
// Non-commercial use only. See LICENSE: https://github.com/anhtuank9.
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { runMyContent } = require('../src/my-content');

test('previews a selected My Content course without opening or checking a lesson', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const navigations = [];
    await page.route('https://englishconnect.pearson.com/**', route => {
      navigations.push(new URL(route.request().url()).pathname);
      if (route.request().url().includes('/courses/list/')) {
        return route.fulfill({ body: '<a class="card-link" href="/courses/123/next/list">Speakout Practice</a>' });
      }
      return route.fulfill({ body: `<button>TABLE OF CONTENTS</button>
        <button id="list"></button><button id="expand">expand_more</button>
        <div id="lessons" hidden><div class="resource-card__title-wrapper"><a onclick="window.lessonOpened=true">1A Simple Grammar</a></div>
        <button id="check" onclick="window.checked=true">Check</button></div>
        <script>document.querySelector('#expand').onclick=()=>{document.querySelector('#expand').textContent='expand_less';document.querySelector('#lessons').hidden=false}</script>` });
    });
    const result = await runMyContent(page, {
      courseFilter: 'practice', lessonFilter: '', maxAssignments: 100,
    });
    assert.deepEqual(result, { courses: 1, lessons: 1 });
    assert.equal(await page.evaluate(() => window.lessonOpened || false), false);
    assert.equal(await page.evaluate(() => window.checked || false), false);
    assert.deepEqual(navigations, ['/courses/list/type/all', '/courses/123/next/list']);
  } finally {
    await browser.close();
  }
});
