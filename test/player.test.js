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
        <div class="video-playback-rate"><select><option value="1">1</option><option value="1.25">1.25</option></select></div>
        <p><select class="ic_inlineChoice"><option value="-">---</option><option value="playing">playing</option><option value="to play">to play</option></select></p>
        <p><select class="ic_inlineChoice"><option value="-">---</option><option value="doing">doing</option><option value="do">do</option></select></p>
        <p><select class="ic_inlineChoice"><option value="-">---</option><option value="wasnt">wasn't</option><option value="was">was</option></select></p>
        <p><select class="ic_inlineChoice"><option value="-">---</option><option value="final">the final -t is pronounced</option><option value="silent">the final -t is silent</option></select></p>
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
            ['playing', 'doing', 'wasn&apos;t', 'the final -&lt;i&gt;t&amp;nbsp;&lt;/i&gt;is pronounced'].forEach((answer, index) => {
              const marker = document.createElement('span');
              marker.className = 'ic_inlineChoice-correct-answer';
              marker.textContent = answer;
              document.querySelectorAll('select.ic_inlineChoice')[index].after(marker);
              if (index === 0) {
                const unrelated = document.createElement('span');
                unrelated.className = 'ic_inlineChoice-correct-answer';
                unrelated.textContent = 'creative activities';
                marker.before(unrelated);
              }
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
    assert.deepEqual(await page.locator('select.ic_inlineChoice').evaluateAll(elements => elements.map(el => el.value)), ['playing', 'doing', 'wasnt', 'final']);
    assert.equal(await page.locator('.video-playback-rate select').inputValue(), '1');
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

test('completes a coloring activity unlocked after a text activity on the same page', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <input id="gap" type="edit" style="width:100px;height:30px">
        <div id="Limited_Check1" class="ic_button_limited_check" role="button" style="width:40px;height:40px">Check 1</div>
        <div id="Limited_Reset1" class="ic_button_limited_reset" role="button" style="width:40px;height:40px">Reset 1</div>
        <div class="addon_Limited_Show_Answers" id="Limited_Show_Answers1" style="display:none">
          <div class="limited-show-answers-wrapper"><div class="limited-show-answers-button" style="width:40px;height:40px">Show 1</div></div>
        </div>
        <div id="Limited_Check2" class="ic_button_limited_check" role="button" style="width:40px;height:40px">Check 2</div>
        <div id="Limited_Reset2" class="ic_button_limited_reset" role="button" style="width:40px;height:40px">Reset 2</div>
        <div class="addon_Limited_Show_Answers" id="Limited_Show_Answers2" style="display:none">
          <div class="limited-show-answers-wrapper"><div class="limited-show-answers-button" style="width:40px;height:40px">Show 2</div></div>
        </div>
        <div class="addon_Text_Coloring" id="Text_Coloring1" style="display:none">
          <div class="text-coloring-color-button text-coloring-active-button" data-colorid="blue">blue</div>
          <span class="text-coloring-selectable-word" data-word-index="1">if it’s</span>
        </div>
      </main>
      <script>
        let firstChecks = 0;
        let secondChecks = 0;
        const gap = document.querySelector('#gap');
        const word = document.querySelector('.text-coloring-selectable-word');
        const first = document.querySelector('#Limited_Check1');
        const second = document.querySelector('#Limited_Check2');
        first.addEventListener('click', () => {
          firstChecks++;
          if (firstChecks >= 5) document.querySelector('#Limited_Show_Answers1').style.display = 'block';
          if (gap.value === 'if it is') document.querySelector('#Text_Coloring1').style.display = 'block';
        });
        second.addEventListener('click', () => {
          secondChecks++;
          if (secondChecks >= 5) document.querySelector('#Limited_Show_Answers2').style.display = 'block';
        });
        document.querySelector('#Limited_Reset1').addEventListener('click', () => {});
        document.querySelector('#Limited_Reset2').addEventListener('click', () => {});
        document.querySelector('#Limited_Show_Answers1 .limited-show-answers-button').addEventListener('click', event => {
          const wrapper = event.target.closest('.limited-show-answers-wrapper');
          wrapper.classList.toggle('selected');
          gap.className = wrapper.classList.contains('selected') ? 'ic_gap-correct-answer' : '';
          gap.value = wrapper.classList.contains('selected') ? 'if it is' : '';
        });
        document.querySelector('#Limited_Show_Answers2 .limited-show-answers-button').addEventListener('click', event => {
          const wrapper = event.target.closest('.limited-show-answers-wrapper');
          wrapper.classList.toggle('selected');
          word.className = wrapper.classList.contains('selected')
            ? 'text-coloring-selectable-word text-coloring-show-answers-blue'
            : 'text-coloring-selectable-word';
        });
        word.addEventListener('click', () => word.classList.add('text-coloring-colored-with-blue'));
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.equal(await page.locator('#gap').inputValue(), 'if it is');
    assert.equal(await page.locator('.text-coloring-selectable-word').getAttribute('class'),
      'text-coloring-selectable-word text-coloring-colored-with-blue');
    assert.equal(await page.evaluate(() => secondChecks), 6);
  } finally {
    await browser.close();
  }
});

test('fills fields unlocked after a drag activity on the same page', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <div class="ic_sourceListItem ui-draggable" id="source">ball</div>
        <div class="ic_draggableGapEmpty" id="drop" style="width:100px;height:30px"></div>
        <div style="height:200px"></div>
        <input type="text" id="gap" style="width:100px;height:30px">
        <div id="Limited_Check1" class="ic_button_limited_check" style="width:40px;height:40px">Check 1</div>
        <div id="Limited_Reset1" class="ic_button_limited_reset" style="width:40px;height:40px">Reset 1</div>
        <div class="addon_Limited_Show_Answers" id="Limited_Show_Answers1" style="display:none">
          <div class="limited-show-answers-wrapper"><div class="limited-show-answers-button" style="width:40px;height:40px">Show 1</div></div>
        </div>
        <div id="Limited_Check2" class="ic_button_limited_check" style="width:40px;height:40px">Check 2</div>
        <div id="Limited_Reset2" class="ic_button_limited_reset" style="width:40px;height:40px">Reset 2</div>
        <div class="addon_Limited_Show_Answers" id="Limited_Show_Answers2" style="display:none">
          <div class="limited-show-answers-wrapper"><div class="limited-show-answers-button" style="width:40px;height:40px">Show 2</div></div>
        </div>
      </main>
      <script>
        let firstChecks = 0, secondChecks = 0, selected = false;
        const drop = document.querySelector('#drop');
        const gap = document.querySelector('#gap');
        document.querySelector('#source').onclick = () => { selected = true; };
        drop.onclick = () => { if (selected) { drop.className = 'ic_draggableGapFilled'; drop.textContent = 'ball'; } };
        document.querySelector('#Limited_Check1').onclick = () => {
          if (++firstChecks >= 5) document.querySelector('#Limited_Show_Answers1').style.display = 'block';
        };
        document.querySelector('#Limited_Check2').onclick = () => {
          if (++secondChecks >= 5) document.querySelector('#Limited_Show_Answers2').style.display = 'block';
        };
        document.querySelector('#Limited_Reset1').onclick = () => {};
        document.querySelector('#Limited_Reset2').onclick = () => {};
        document.querySelector('#Limited_Show_Answers1 .limited-show-answers-button').onclick = event => {
          const wrapper = event.target.closest('.limited-show-answers-wrapper');
          wrapper.classList.toggle('selected');
          drop.className = wrapper.classList.contains('selected')
            ? 'ic_draggableGapFilled-correct-answer' : 'ic_draggableGapEmpty';
          drop.textContent = wrapper.classList.contains('selected') ? 'ball' : '';
        };
        document.querySelector('#Limited_Show_Answers2 .limited-show-answers-button').onclick = event => {
          const wrapper = event.target.closest('.limited-show-answers-wrapper');
          wrapper.classList.toggle('selected');
          gap.className = wrapper.classList.contains('selected') ? 'ic_gap-correct-answer' : '';
          gap.value = wrapper.classList.contains('selected') ? 'racquet' : '';
        };
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.equal(await page.locator('#drop').innerText(), 'ball');
    assert.equal(await page.locator('#gap').inputValue(), 'racquet');
    assert.equal(await page.evaluate(() => secondChecks), 6);
  } finally {
    await browser.close();
  }
});

test('solves an ordering activity after a separate dropdown activity', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <select id="first"><option value="-">---</option><option value="after">After that</option></select>
      <div id="Limited_Check1" class="ic_button_limited_check" style="width:40px;height:40px">Check 1</div>
      <div id="Limited_Reset1" class="ic_button_limited_reset" style="width:40px;height:40px">Reset 1</div>
      <div class="addon_Limited_Show_Answers" id="Limited_Show_Answers1" style="display:none">
        <div class="limited-show-answers-wrapper"><div class="limited-show-answers-button" style="width:40px;height:40px">Show 1</div></div>
      </div>
      <table class="ic_ordering" id="Ordering1" style="margin-top:100px"><tbody>
        <tr draggable="true" data-item="a" style="height:40px"><td><div class="ic_ordering-item">a</div></td></tr>
        <tr draggable="true" data-item="b" style="height:40px"><td><div class="ic_ordering-item">b</div></td></tr>
        <tr draggable="true" data-item="c" style="height:40px"><td><div class="ic_ordering-item">c</div></td></tr>
      </tbody></table>
      <div id="Limited_Check2" class="ic_button_limited_check" style="width:40px;height:40px">Check 2</div>
      <div id="Limited_Reset2" class="ic_button_limited_reset" style="width:40px;height:40px">Reset 2</div>
      <div class="addon_Limited_Show_Answers" id="Limited_Show_Answers2" style="display:none">
        <div class="limited-show-answers-wrapper"><div class="limited-show-answers-button" style="width:40px;height:40px">Show 2</div></div>
      </div>
      <script>
        let firstChecks = 0, secondChecks = 0;
        const first = document.querySelector('#first');
        const tbody = document.querySelector('tbody');
        const sort = ids => ids.forEach(id => tbody.append(tbody.querySelector('[data-item="' + id + '"]')));
        document.querySelector('#Limited_Check1').onclick = () => {
          if (++firstChecks >= 5) document.querySelector('#Limited_Show_Answers1').style.display = 'block';
        };
        document.querySelector('#Limited_Check2').onclick = () => {
          if (++secondChecks >= 5) document.querySelector('#Limited_Show_Answers2').style.display = 'block';
        };
        document.querySelector('#Limited_Reset1').onclick = () => {};
        document.querySelector('#Limited_Reset2').onclick = () => {};
        document.querySelector('#Limited_Show_Answers1 .limited-show-answers-button').onclick = event => {
          const wrapper = event.target.closest('.limited-show-answers-wrapper');
          wrapper.classList.toggle('selected');
          let marker = document.querySelector('.ic_inlineChoice-correct-answer');
          if (wrapper.classList.contains('selected')) {
            marker = document.createElement('span');
            marker.className = 'ic_inlineChoice-correct-answer';
            marker.textContent = 'After that';
            first.after(marker);
          } else marker?.remove();
        };
        document.querySelector('#Limited_Show_Answers2 .limited-show-answers-button').onclick = event => {
          const wrapper = event.target.closest('.limited-show-answers-wrapper');
          wrapper.classList.toggle('selected');
          sort(wrapper.classList.contains('selected') ? ['c','a','b'] : ['a','b','c']);
        };
        let dragged;
        tbody.ondragstart = event => { dragged = event.target.closest('tr'); };
        tbody.ondragover = event => event.preventDefault();
        tbody.ondrop = event => {
          event.preventDefault();
          const target = event.target.closest('tr');
          if (dragged && target) tbody.insertBefore(dragged, target);
        };
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.deepEqual(await page.locator('table.ic_ordering > tbody > tr').evaluateAll(rows => rows.map(row => row.dataset.item)),
      ['c', 'a', 'b']);
    assert.equal(await page.evaluate(() => secondChecks), 6);
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
        <p>Leave blank <span id="gap-blank" class="ic_draggableGapEmpty" style="display:inline-block;width:100px;height:30px;border:1px solid"></span></p>
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
          document.querySelector('#gap-blank').className = shown
            ? 'ic_draggableGapEmpty-correct-answer' : 'ic_draggableGapEmpty';
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
    assert.equal(result.plan.drops.length, 4);
    assert.deepEqual(await page.locator('[id*="gap-"]').evaluateAll(elements => elements.map(el => el.textContent)), ['isn’t very', 'going', 'example', '']);
    assert.equal(await page.evaluate(() => count), 6);
  } finally {
    await browser.close();
  }
});

test('fills Pearson draggable-gap targets from the revealed answer', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <div class="ic_sourceListItem ui-draggable" draggable="true">hope</div>
        <span id="Table1-1" class="draggable-gap ic_gap" style="display:inline-block;width:100px;height:30px;border:1px solid"></span>
        <button class="ic_button_check" id="check">Check</button>
        <button class="ic_button_reset" id="reset">Reset</button>
        <button class="limited-show-answers-button" id="show" hidden>Show Answers</button>
      </main>
      <script>
        let count = 0;
        const gap = document.querySelector('#Table1-1');
        document.querySelector('#check').addEventListener('click', () => {
          if (++count === 5) document.querySelector('#show').hidden = false;
        });
        document.querySelector('#show').addEventListener('click', event => {
          const shown = event.target.className === 'limited-show-answers-button';
          gap.className = shown ? 'draggable-gap ic_gap ic_gap-show-answers' : 'draggable-gap ic_gap';
          gap.textContent = shown ? 'hope' : '';
          event.target.className = shown ? 'limited-hide-answers-button' : 'limited-show-answers-button';
        });
        const source = document.querySelector('.ic_sourceListItem');
        source.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', source.textContent));
        gap.addEventListener('dragover', event => event.preventDefault());
        gap.addEventListener('drop', event => {
          event.preventDefault();
          gap.textContent = event.dataTransfer.getData('text/plain');
        });
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.deepEqual(result.plan.drops, [{ id: 'Table1-1', answer: 'hope' }]);
    assert.equal(await page.locator('#Table1-1').innerText(), 'hope');
  } finally {
    await browser.close();
  }
});

test('matches a draggable phrase split across a visual line break', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="ic_sourceListItem ui-draggable" draggable="true">How about y<br>ou?</div>
      <span id="Table2-1" class="draggable-gap ic_gap" style="display:inline-block;width:150px;height:30px"></span>
      <button class="ic_button_check" id="check">Check</button>
      <button class="ic_button_reset" id="reset">Reset</button>
      <button class="limited-show-answers-button" id="show" hidden>Show Answers</button>
      <script>
        let count = 0;
        const gap = document.querySelector('#Table2-1');
        document.querySelector('#check').onclick = () => {
          if (++count === 5) document.querySelector('#show').hidden = false;
        };
        document.querySelector('#show').onclick = event => {
          const shown = event.target.className === 'limited-show-answers-button';
          gap.className = shown ? 'draggable-gap ic_gap ic_gap-show-answers' : 'draggable-gap ic_gap';
          gap.textContent = shown ? 'How about you' : '';
          event.target.className = shown ? 'limited-hide-answers-button' : 'limited-show-answers-button';
        };
        const source = document.querySelector('.ic_sourceListItem');
        source.ondragstart = event => event.dataTransfer.setData('text/plain', source.innerText);
        gap.ondragover = event => event.preventDefault();
        gap.ondrop = event => {
          event.preventDefault();
          gap.textContent = event.dataTransfer.getData('text/plain');
        };
      </script>
    `);
    const result = await solveCurrentPage(page, 5);
    assert.equal(result.status, 'answered');
    assert.match(await page.locator('#Table2-1').innerText(), /How about y\s*ou\?/);
  } finally {
    await browser.close();
  }
});

test('reads crossing answer lines from a connection canvas', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="addon_Connection" id="Connection1" style="display:flex;align-items:flex-start">
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
      { addonId: 'Connection1', from: 'connection-1', to: 'connection-b' },
      { addonId: 'Connection1', from: 'connection-2', to: 'connection-c' },
      { addonId: 'Connection1', from: 'connection-3', to: 'connection-a' },
    ]);
  } finally {
    await browser.close();
  }
});

test('keeps duplicate connection item IDs inside their own activity', async () => {
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent([1, 2].map(index => `
      <div class="addon_Connection" id="Connection${index}" style="display:flex">
        <div class="connectionLeftColumn"><div class="connectionItem" id="connection-1" style="height:60px;width:100px">${index}</div></div>
        <canvas class="connections" width="100" height="60"></canvas>
        <div class="connectionRightColumn"><div class="connectionItem" id="connection-a" style="height:60px;width:100px">a</div></div>
      </div>`).join(''));
    await page.locator('canvas').evaluateAll(canvases => canvases.forEach(canvas => {
      const context = canvas.getContext('2d');
      context.strokeStyle = '#00dd00';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, 30);
      context.lineTo(99, 30);
      context.stroke();
    }));
    assert.deepEqual(await captureConnections(page.mainFrame()), [
      { addonId: 'Connection1', from: 'connection-1', to: 'connection-a' },
      { addonId: 'Connection2', from: 'connection-1', to: 'connection-a' },
    ]);
  } finally {
    await browser.close();
  }
});
