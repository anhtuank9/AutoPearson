// AutoPearson — Copyright (c) 2026 anhtuank9. All rights reserved.
// Non-commercial use only. Copying or using this code for profit requires
// prior written permission: https://github.com/anhtuank9. See LICENSE.
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { runLesson } = require('../src/assignment');
const { solveCurrentPage, captureConnections } = require('../src/player');

function launchTestBrowser() {
  const browser = process.env.PEARSON_TEST_BROWSER || 'chrome';
  return chromium.launch(browser === 'chromium'
    ? { headless: true }
    : { channel: browser, headless: true });
}

test('checks five times, copies a revealed text answer, completes Done, and saves', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.route('https://englishconnect.pearson.com/assignments/view/test', route =>
      route.fulfill({ body: '<html><body></body></html>' }));
    await page.goto('https://englishconnect.pearson.com/assignments/view/test');
    await page.setContent(`
      <main>
        <section class="ic_page">
          <h1>Question one</h1>
          <label>Answer <input class="text_gap" type="text"></label>
          <button class="ic_button_limited_check" id="check">Check</button>
          <button class="limited-show-answers-button" id="show" hidden>Show Answers</button>
          <button id="next">Next</button>
        </section>
        <button id="exit">Save &amp; Exit</button>
      </main>
      <script>
        let count = 0;
        const check = document.querySelector('#check');
        check.addEventListener('click', () => {
          if (check.className === 'ic_button_limited_check') {
            count++;
            check.className = 'ic_button_limited_uncheck';
            check.textContent = 'Uncheck';
            if (count === 5) document.querySelector('#show').hidden = false;
          } else {
            check.className = 'ic_button_limited_check';
            check.textContent = 'Check';
          }
        });
        document.querySelector('#show').addEventListener('click', event => {
          if (event.target.className === 'limited-show-answers-button') {
            const answer = document.createElement('span');
            answer.className = 'text_gap-correct-answer';
            answer.textContent = 'correct answer';
            document.querySelector('label').append(answer);
            event.target.className = 'limited-hide-answers-button';
            event.target.textContent = 'Hide Answers';
          } else {
            document.querySelector('.text_gap-correct-answer').remove();
            event.target.className = 'limited-show-answers-button';
            event.target.textContent = 'Show Answers';
          }
        });
        document.querySelector('#next').addEventListener('click', () => {
          window.answerFilled = document.querySelector('input').value;
          document.querySelector('.ic_page').innerHTML = '<h1>Question two</h1><button id="done">Done</button>';
          document.querySelector('#done').addEventListener('click', event => event.target.remove());
        });
        document.querySelector('#exit').addEventListener('click', () => {
          window.saved = true;
          history.pushState({}, '', '/assignments-v2/assignment/123/assignment-student-details/456/edit');
        });
      </script>
    `);
    const total = await runLesson(page, { maxPages: 5, checkLimit: 5 });
    assert.equal(total, 2);
    assert.deepEqual(await page.evaluate(() => ({ count, answerFilled: window.answerFilled, saved: window.saved })), {
      count: 5,
      answerFilled: 'correct answer',
      saved: true,
    });
  } finally {
    await browser.close();
  }
});

test('uses Reset between checks and fills revealed dropdown answers', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <p><select class="ic_inlineChoice"><option value="-">---</option><option value="playing">playing</option><option value="to play">to play</option></select></p>
        <p><select class="ic_inlineChoice"><option value="-">---</option><option value="doing">doing</option><option value="do">do</option></select></p>
        <button class="ic_button_check" id="check">Check</button>
        <button class="ic_button_reset" id="reset">Reset</button>
        <button class="limited-show-answers-button" id="show" hidden>Show Answers</button>
        <div id="confirm" hidden>Are you sure you want to reset your activity?<button id="yes">Yes</button><button>No</button></div>
      </main>
      <script>
        let count = 0;
        document.querySelector('#check').addEventListener('click', event => {
          count++;
          event.target.classList.add('disabled');
          for (const select of document.querySelectorAll('select')) select.disabled = true;
          if (count === 5) document.querySelector('#show').hidden = false;
        });
        document.querySelector('#reset').addEventListener('click', () => {
          document.querySelector('#confirm').hidden = false;
        });
        document.querySelector('#yes').addEventListener('click', () => {
          document.querySelector('#confirm').hidden = true;
          document.querySelector('#check').classList.remove('disabled');
          for (const select of document.querySelectorAll('select')) select.disabled = false;
        });
        document.querySelector('#show').addEventListener('click', event => {
          if (event.target.className === 'limited-show-answers-button') {
            ['playing', 'doing'].forEach((answer, index) => {
              const marker = document.createElement('span');
              marker.className = 'ic_inlineChoice-correct-answer';
              marker.textContent = answer;
              document.querySelectorAll('select')[index].after(marker);
            });
            event.target.className = 'limited-hide-answers-button';
          } else {
            for (const marker of document.querySelectorAll('.ic_inlineChoice-correct-answer')) marker.remove();
            event.target.className = 'limited-show-answers-button';
          }
        });
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.deepEqual(await page.locator('select').evaluateAll(elements => elements.map(el => el.value)), ['playing', 'doing']);
    assert.equal(await page.evaluate(() => count), 6);
  } finally {
    await browser.close();
  }
});

test('fills a revealed true-false checkbox table', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <table class="tf_checkbox"><tbody>
          <tr class="tf_checkbox_row"><td>Activity</td><td>Brett</td><td>Carmen</td></tr>
          <tr class="tf_checkbox_row"><td>Won money</td>
            <td class="tf_checkbox_image up" onclick="this.classList.toggle('down')">Brett</td>
            <td class="tf_checkbox_image up" onclick="this.classList.toggle('down')">Carmen</td></tr>
          <tr class="tf_checkbox_row"><td>On television</td>
            <td class="tf_checkbox_image up" onclick="this.classList.toggle('down')">Brett</td>
            <td class="tf_checkbox_image up" onclick="this.classList.toggle('down')">Carmen</td></tr>
        </tbody></table>
        <button class="ic_button_limited_check" id="check">Check</button>
        <button class="ic_button_reset" id="reset">Reset</button>
        <button class="limited-show-answers-button" id="show" hidden>Show Answers</button>
      </main>
      <script>
        let count = 0;
        document.querySelector('#check').onclick = event => {
          if (event.target.className === 'ic_button_limited_check') {
            count++;
            event.target.className = 'ic_button_limited_uncheck';
            if (count === 5) document.querySelector('#show').hidden = false;
          } else event.target.className = 'ic_button_limited_check';
        };
        document.querySelector('#reset').onclick = () => {
          document.querySelector('#check').className = 'ic_button_limited_check';
          for (const cell of document.querySelectorAll('td.tf_checkbox_image')) cell.classList.remove('down');
        };
        document.querySelector('#show').onclick = event => {
          const cells = document.querySelectorAll('td.tf_checkbox_image');
          const reveal = event.target.className === 'limited-show-answers-button';
          for (const index of [0, 3]) cells[index].classList.toggle('correct-answer', reveal);
          event.target.className = reveal ? 'limited-hide-answers-button' : 'limited-show-answers-button';
        };
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.deepEqual(result.plan.tableCheckbox, [{ rowIndex: 0, cellIndex: 0 }, { rowIndex: 1, cellIndex: 1 }]);
    assert.deepEqual(await page.locator('td.tf_checkbox_image').evaluateAll(cells => cells.map(cell => cell.classList.contains('down'))),
      [true, false, false, true]);
    assert.equal(await page.evaluate(() => count), 6);
  } finally {
    await browser.close();
  }
});

test('uses each revealed color when marking pronunciation words', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <div class="addon_Text_Coloring" id="Text_Coloring2">
          <div class="text-coloring-color-button text-coloring-active-button" data-colorid="red">weak</div>
          <div class="text-coloring-color-button" data-colorid="blue">strong</div>
          <span class="text-coloring-selectable-word" data-word-index="1">Have</span>
          <span class="text-coloring-selectable-word" data-word-index="2">has</span>
        </div>
        <button class="ic_button_limited_check" id="check">Check</button>
        <button class="ic_button_reset" id="reset">Reset</button>
        <button class="limited-show-answers-button" id="show" hidden>Show Answers</button>
      </main>
      <script>
        let count = 0;
        const addon = document.querySelector('#Text_Coloring2');
        addon.querySelectorAll('[data-colorid]').forEach(button => button.onclick = () => {
          addon.querySelector('.text-coloring-active-button').classList.remove('text-coloring-active-button');
          button.classList.add('text-coloring-active-button');
        });
        addon.querySelectorAll('[data-word-index]').forEach(word => word.onclick = () => {
          const color = addon.querySelector('.text-coloring-active-button').dataset.colorid;
          word.className = 'text-coloring-selectable-word text-coloring-colored-with-' + color;
        });
        document.querySelector('#check').onclick = event => {
          if (event.target.className === 'ic_button_limited_check') {
            count++;
            event.target.className = 'ic_button_limited_uncheck';
            if (count === 5) document.querySelector('#show').hidden = false;
          } else event.target.className = 'ic_button_limited_check';
        };
        document.querySelector('#reset').onclick = () => {
          document.querySelector('#check').className = 'ic_button_limited_check';
          for (const word of addon.querySelectorAll('[data-word-index]')) word.className = 'text-coloring-selectable-word';
        };
        document.querySelector('#show').onclick = event => {
          const reveal = event.target.className === 'limited-show-answers-button';
          const words = addon.querySelectorAll('[data-word-index]');
          words[0].className = reveal ? 'text-coloring-selectable-word text-coloring-show-answers-red' : 'text-coloring-selectable-word';
          words[1].className = reveal ? 'text-coloring-selectable-word text-coloring-show-answers-blue' : 'text-coloring-selectable-word';
          event.target.className = reveal ? 'limited-hide-answers-button' : 'limited-show-answers-button';
        };
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.deepEqual(result.plan.coloring.map(word => word.color), ['red', 'blue']);
    assert.deepEqual(await page.locator('[data-word-index]').evaluateAll(words => words.map(word =>
      word.classList.contains('text-coloring-colored-with-red') ? 'red' :
        word.classList.contains('text-coloring-colored-with-blue') ? 'blue' : 'none')),
    ['red', 'blue']);
    assert.equal(await page.evaluate(() => count), 6);
  } finally {
    await browser.close();
  }
});

test('avoids duplicating a fixed first letter in an edit gap', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <input type="edit" placeholder="p" id="gap">
      <button class="ic_button_check" id="check">Check</button>
      <button class="ic_button_reset" id="reset">Reset</button>
      <button class="limited-show-answers-button" id="show" hidden>Show Answers</button>
      <script>
        let checks = 0;
        document.querySelector('#gap').addEventListener('input', event => {
          if (!event.target.value.startsWith('p')) event.target.value = 'p' + event.target.value;
          else event.target.value = 'p' + event.target.value;
        });
        document.querySelector('#check').addEventListener('click', () => {
          if (++checks === 5) document.querySelector('#show').hidden = false;
        });
        document.querySelector('#show').addEventListener('click', event => {
          const selected = event.target.classList.toggle('selected');
          document.querySelector('#gap').className = selected ? 'ic_filled_gap-correct-answer' : '';
          document.querySelector('#gap').value = selected ? 'pitch' : '';
        });
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.equal(await page.locator('#gap').inputValue(), 'pitch');
  } finally {
    await browser.close();
  }
});

test('maps revealed words to drag targets and checks the completed exercise', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <div class="ic_sourceListItem ui-draggable" draggable="true">isn’t very</div>
        <div class="ic_sourceListItem ui-draggable" draggable="true">going</div>
        <p>One <span id="3gap-1" class="ic_draggableGapEmpty" style="display:inline-block;width:100px;height:30px;border:1px solid"></span></p>
        <p>Two <span id="gap-2" class="ic_draggableGapEmpty" style="display:inline-block;width:100px;height:30px;border:1px solid"></span></p>
        <p>Example <span id="gap-3" class="ic_draggableGapFilled" style="display:inline-block;width:100px;height:30px;border:1px solid">example</span></p>
        <button class="ic_button_check" id="check">Check</button>
        <button class="ic_button_reset" id="reset">Reset</button>
        <button class="limited-show-answers-button" id="show" hidden>Show Answers</button>
      </main>
      <script>
        let count = 0;
        document.querySelector('#check').addEventListener('click', () => {
          count++;
          if (count === 5) document.querySelector('#show').hidden = false;
        });
        document.querySelector('#reset').addEventListener('click', () => {});
        document.querySelector('#show').addEventListener('click', event => {
          const shown = event.target.className === 'limited-show-answers-button';
          ["isn't very", 'going'].forEach((word, index) => {
            const gap = document.querySelectorAll('[id*="gap-"]')[index];
            gap.className = shown ? 'ic_draggableGapFilled-correct-answer' : 'ic_draggableGapEmpty';
            gap.textContent = shown ? word : '';
          });
          event.target.className = shown ? 'limited-hide-answers-button' : 'limited-show-answers-button';
        });
        document.querySelectorAll('.ic_sourceListItem').forEach(source => {
          source.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', source.textContent));
        });
        document.querySelectorAll('[id*="gap-"]').forEach(gap => {
          gap.addEventListener('dragover', event => event.preventDefault());
          gap.addEventListener('drop', event => {
            event.preventDefault();
            gap.textContent = event.dataTransfer.getData('text/plain');
            gap.className = 'ic_draggableGapFilled';
          });
        });
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.equal(result.plan.drops.length, 3);
    assert.deepEqual(await page.locator('[id*="gap-"]').evaluateAll(elements => elements.map(el => el.textContent)), ['isn’t very', 'going', 'example']);
    assert.equal(await page.evaluate(() => count), 6);
  } finally {
    await browser.close();
  }
});

test('reads crossing answer lines from a connection canvas', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="addon_Connection" style="display:flex;align-items:flex-start">
        <div class="connectionLeftColumn">
          <div class="connectionItem" id="connection-1" style="height:60px;width:100px">1</div>
          <div class="connectionItem" id="connection-2" style="height:60px;width:100px">2</div>
          <div class="connectionItem" id="connection-3" style="height:60px;width:100px">3</div>
        </div>
        <canvas class="connections" width="100" height="180"></canvas>
        <div class="connectionRightColumn">
          <div class="connectionItem" id="connection-a" style="height:60px;width:100px">a</div>
          <div class="connectionItem" id="connection-b" style="height:60px;width:100px">b</div>
          <div class="connectionItem" id="connection-c" style="height:60px;width:100px">c</div>
        </div>
      </div>
      <script>
        const context = document.querySelector('canvas').getContext('2d');
        context.strokeStyle = '#00dd00';
        context.lineWidth = 2;
        for (const [left, right] of [[30, 90], [90, 150], [150, 30]]) {
          context.beginPath();
          context.moveTo(0, left);
          context.lineTo(99, right);
          context.stroke();
        }
      </script>
    `);
    const pairs = await captureConnections(page.mainFrame());
    assert.deepEqual(pairs.sort((a, b) => a.from.localeCompare(b.from)), [
      { from: 'connection-1', to: 'connection-b' },
      { from: 'connection-2', to: 'connection-c' },
      { from: 'connection-3', to: 'connection-a' },
    ]);
  } finally {
    await browser.close();
  }
});
