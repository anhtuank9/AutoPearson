// AutoPearson — Copyright (c) 2026 anhtuank9. All rights reserved.
// Non-commercial use only. Copying or using this code for profit requires
// prior written permission: https://github.com/anhtuank9. See LICENSE.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CHECK = '.ic_button_check:not(.disabled):visible, .ic_button_limited_check:not(.disabled):visible, .limited-check-button:visible, button:visible:text-matches("^Check( Answers)?$", "i")';
const UNCHECK = '.ic_button_uncheck:not(.disabled):visible, .ic_button_limited_uncheck:not(.disabled):visible, .limited-uncheck-button:visible, button:visible:text-matches("^Uncheck( Answers)?$", "i")';
const RESET = '.ic_button_reset:not(.disabled):visible, .ic_button_limited_reset:not(.disabled):visible, button:visible:text-matches("^Reset$", "i")';
const SHOW = '.limited-show-answers-button:visible, [class*="limited-show-answers"]:visible, button:visible:has-text("Show Answers")';
const HIDE = '.limited-hide-answers-button:visible, [class*="limited-hide-answers"]:visible, button:visible:has-text("Hide Answers")';
const NEXT = '.ic_button_nextpage:not([class*="disabled"]):visible, button:visible:has-text("Next"), a:visible:has-text("Next"), .next-page-button:visible, [aria-label="Next page"]:visible';
const DONE = 'button:visible:text-is("Done"), a:visible:text-is("Done"), [role="button"]:visible:text-is("Done"), :visible:text-is("Done")';
const SAVE_EXIT = 'button:visible:text-matches("^Save & Exit$", "i"), a:visible:text-matches("^Save & Exit$", "i")';

const FIELD_SELECTOR = 'input[type="text"]:not([role="presentation"]):not(.pageNumberInput):not([tabindex="-1"]), input[type="edit"]:not([tabindex="-1"]), input:not([type]):not([role="presentation"]):not(.pageNumberInput):not([tabindex="-1"]), textarea, select:not(.textaudio-playback-rate select), [contenteditable="true"]';
const CHOICE_SELECTOR = 'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], .ic_choice, .addon_Text_Selection .selectable';

function normalizeAnswerText(value) {
  return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

async function firstVisible(scope, selector) {
  const items = scope.locator(selector);
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function checkControl(scope) {
  return await firstVisible(scope, '.ic_button_check:not(.disabled):visible') ||
    await firstVisible(scope, CHECK);
}

async function clickCheck(check) {
  try {
    await check.click({ force: true, timeout: 5000 });
  } catch (error) {
    if (!/outside of the viewport/i.test(error.message) || !await check.isVisible().catch(() => false)) throw error;
    await check.evaluate(element => {
      if (element.classList.contains('disabled') || element.getAttribute('aria-disabled') === 'true') {
        throw new Error('Check became disabled before it could be clicked');
      }
      element.click();
    });
  }
}

async function clickAllChecks(scope) {
  const seen = new Set();
  for (let attempt = 0; attempt < 30; attempt++) {
    const check = await checkControl(scope);
    if (!check) return;
    const key = await check.evaluate(element => element.id || element.outerHTML.slice(0, 300));
    if (seen.has(key)) return;
    seen.add(key);
    await clickCheck(check);
  }
  throw new Error('More than 30 Check controls appeared on one page');
}

async function resetControl(scope) {
  return await firstVisible(scope, '.ic_button_reset:not(.disabled):visible') ||
    await firstVisible(scope, RESET);
}

async function clickReset(scope, reset) {
  await reset.click();
  const dialog = scope.getByText(/Are you sure you want to reset your activity\?/i).first();
  if (!await dialog.isVisible().catch(() => false)) return;
  const confirmations = scope.getByText(/^Yes$/i);
  for (let i = 0; i < await confirmations.count(); i++) {
    const yes = confirmations.nth(i);
    if (await yes.isVisible().catch(() => false)) {
      await yes.click();
      await dialog.waitFor({ state: 'hidden', timeout: 5000 });
      return;
    }
  }
  throw new Error('Reset confirmation appeared without a visible Yes control');
}

async function playerScope(page) {
  const candidates = page.frames().filter(frame => !frame.isDetached());
  const lessonFrame = candidates.find(frame => /\/lesson\/player\.html(?:\?|$)/.test(frame.url()));
  if (lessonFrame) return lessonFrame;
  let best = page.mainFrame();
  let bestScore = -1;
  for (const frame of candidates) {
    const score =
      (await frame.locator(SHOW).count().catch(() => 0)) * 20 +
      (await frame.locator(CHECK).count().catch(() => 0)) * 10 +
      (await frame.locator(DONE).count().catch(() => 0)) * 5 +
      (await frame.locator(NEXT).count().catch(() => 0));
    if (score > bestScore) { bestScore = score; best = frame; }
  }
  return best;
}

async function pageSignature(scope) {
  return scope.evaluate(() => {
    const root = document.querySelector('.ic_page, .ic-player, #player, main') || document.body;
    const text = (root?.innerText || '').replace(/\s+/g, ' ').trim();
    const inputs = [...root.querySelectorAll('input,select,textarea')].length;
    return `${location.href}|${text.slice(0, 800)}|${inputs}`;
  });
}

async function captureFields(scope) {
  return scope.evaluate(({fieldSelector, choiceSelector}) => {
    const visible = element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    };
    const box = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    };
    const fields = [...document.querySelectorAll(fieldSelector)].filter(visible).map((element, index) => ({
      index, tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type') || '',
      value: element.isContentEditable ? element.innerText : element.value,
      options: element.tagName === 'SELECT' ? [...element.options].map(o => ({ value: o.value, text: o.text })) : [],
      ...box(element),
    }));
    const choices = [...document.querySelectorAll(choiceSelector)].filter(visible).map((element, index) => ({
      index, text: (element.closest('label') || element).innerText?.trim() || element.getAttribute('aria-label') || '',
      checked: !!element.checked || element.getAttribute('aria-checked') === 'true',
      ...box(element),
    }));
    const drops = [...document.querySelectorAll('.ic_draggableGapEmpty, .ic_draggableGapFilled')]
      .filter(visible).map((element, index) => ({ index, id: element.id,
        text: (element.innerText || '').trim(), ...box(element) }));
    return { fields, choices, drops };
  }, { fieldSelector: FIELD_SELECTOR, choiceSelector: CHOICE_SELECTOR });
}

async function captureOverlay(scope) {
  return scope.evaluate(({fieldSelector, choiceSelector}) => {
    const visible = element => {
      const r = element.getBoundingClientRect();
      const s = getComputedStyle(element);
      return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };
    const center = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const markerPattern = /correct-answer|show-answers|show_answers|showanswers/i;
    const visibleChoices = [...document.querySelectorAll(choiceSelector)].filter(visible);
    const visibleFields = [...document.querySelectorAll(fieldSelector)].filter(visible);
    const markers = [...document.querySelectorAll('[class]')].filter(element => {
      const own = String(element.className || '');
      if (!markerPattern.test(own) || !visible(element)) return false;
      if (element.closest('.progress-box') || /(?:wrapper|container|button|hidden)/i.test(own)) return false;
      if (element.closest('.limited-show-answers-button, .show-answers-button, .show-answers-wrapper')) return false;
      if ([...element.children].some(child => markerPattern.test(String(child.className || '')) && visible(child))) return false;
      return true;
    }).map(element => ({
      text: (element.value || element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
      className: String(element.className || ''),
      id: element.id || '',
      ...center(element),
      fieldIndex: visibleFields.indexOf(
        element.matches(fieldSelector) ? element :
        element.previousElementSibling?.matches(fieldSelector) ? element.previousElementSibling :
        null
      ),
      choiceIndex: visibleChoices.indexOf(element.closest(choiceSelector)),
    })).filter(marker => marker.text || marker.choiceIndex >= 0);
    const fields = visibleFields.map(element => ({
      value: element.isContentEditable ? element.innerText : element.value,
      ...center(element),
    }));
    const choices = visibleChoices.map(element => ({
      checked: !!element.checked || element.getAttribute('aria-checked') === 'true',
      className: String(element.className || ''),
      text: (element.closest('label') || element).innerText?.trim() || '',
    }));
    const coloring = [...document.querySelectorAll('.addon_Text_Coloring .text-coloring-selectable-word')]
      .filter(element => visible(element) && /text-coloring-show-answers-/.test(element.className))
      .map(element => ({ addonId: element.closest('.addon_Text_Coloring')?.id || '',
        wordIndex: element.getAttribute('data-word-index'), text: element.textContent?.trim() || '' }));
    const tableRadio = [...document.querySelectorAll('tr:has(> td.tf_radio_image)')]
      .filter(visible).flatMap((row, rowIndex) =>
        [...row.querySelectorAll(':scope > td.tf_radio_image')]
          .filter(cell => /correct-answer/.test(cell.className))
          .map(cell => ({ rowIndex,
            cellIndex: [...row.querySelectorAll(':scope > td.tf_radio_image')].indexOf(cell) })));
    const tableCheckbox = [...document.querySelectorAll('tr:has(> td.tf_checkbox_image)')]
      .filter(visible).flatMap((row, rowIndex) =>
        [...row.querySelectorAll(':scope > td.tf_checkbox_image')]
          .filter(cell => /correct-answer/.test(cell.className))
          .map(cell => ({ rowIndex,
            cellIndex: [...row.querySelectorAll(':scope > td.tf_checkbox_image')].indexOf(cell) })));
    const ordering = [...document.querySelectorAll('table.ic_ordering[id]')].filter(visible)
      .map(table => ({ id: table.id,
        items: [...table.querySelectorAll('tbody > tr .ic_ordering-item')]
          .map(item => (item.innerText || '').replace(/\s+/g, ' ').trim()) }));
    const multigap = [...document.querySelectorAll('.addon_multiplegap[id]')].filter(visible)
      .map(addon => ({ id: addon.id,
        answers: [...addon.querySelectorAll('.placeholder-show-answers')]
          .map(item => (item.innerText || '').replace(/\s+/g, ' ').trim()) }));
    return { markers, fields, choices, coloring, tableRadio, tableCheckbox, ordering, multigap };
  }, { fieldSelector: FIELD_SELECTOR, choiceSelector: CHOICE_SELECTOR });
}

async function captureConnections(scope) {
  return scope.evaluate(() => {
    const addon = [...document.querySelectorAll('.addon_Connection')]
      .find(element => element.getBoundingClientRect().width > 0);
    if (!addon) return [];
    const canvas = addon.querySelector('canvas.connections');
    const left = [...addon.querySelectorAll('.connectionLeftColumn .connectionItem')];
    const right = [...addon.querySelectorAll('.connectionRightColumn .connectionItem')];
    if (!canvas || !left.length || !right.length) {
      throw new Error('Connection columns are incomplete');
    }
    const context = canvas.getContext('2d');
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    let points = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      if (green > 130 && green > red + 70 && green > blue + 70) points.push({ x, y });
    }
    const lines = [];
    let seed = 17;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let lineIndex = 0; lineIndex < left.length; lineIndex++) {
      let best = null;
      for (let attempt = 0; attempt < 1000; attempt++) {
        if (points.length < 20) break;
        const first = points[Math.floor(random() * points.length)];
        const second = points[Math.floor(random() * points.length)];
        if (Math.abs(first.x - second.x) < 50) continue;
        const slope = (second.y - first.y) / (second.x - first.x);
        if (Math.abs(slope) > 5) continue;
        const intercept = first.y - slope * first.x;
        const inliers = points.filter(point => Math.abs(point.y - slope * point.x - intercept) < 2.2);
        if (!best || inliers.length > best.length) best = inliers;
      }
      if (!best || best.length < 35) break;
      const n = best.length;
      const sx = best.reduce((sum, point) => sum + point.x, 0);
      const sy = best.reduce((sum, point) => sum + point.y, 0);
      const sxx = best.reduce((sum, point) => sum + point.x * point.x, 0);
      const sxy = best.reduce((sum, point) => sum + point.x * point.y, 0);
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const intercept = (sy - slope * sx) / n;
      lines.push({ slope, intercept, count: n });
      points = points.filter(point => Math.abs(point.y - slope * point.x - intercept) >= 2.8);
    }
    if (lines.length !== left.length) {
      throw new Error(`Found ${lines.length}/${left.length} answer lines on connection canvas`);
    }
    const canvasTop = canvas.getBoundingClientRect().top;
    const centerY = element => {
      const box = element.getBoundingClientRect();
      return box.top + box.height / 2 - canvasTop;
    };
    const closest = (items, y) => items.map(element => ({
      id: element.id, distance: Math.abs(centerY(element) - y),
    })).sort((a, b) => a.distance - b.distance)[0];
    const pairs = lines.map(line => {
      const from = closest(left, line.intercept);
      const to = closest(right, line.slope * (width - 1) + line.intercept);
      if (from.distance > 25 || to.distance > 25) {
        throw new Error(`Connection line misses an item (${from.distance.toFixed(1)}, ${to.distance.toFixed(1)})`);
      }
      return { from: from.id, to: to.id };
    });
    if (new Set(pairs.map(pair => pair.from)).size !== left.length) {
      throw new Error(`Connection lines do not cover each prompt: ${JSON.stringify(pairs)}`);
    }
    return pairs;
  });
}

function buildAnswerPlan(before, overlay) {
  const fields = [];
  const usedMarkers = new Set();
  for (const field of before.fields) {
    const candidates = overlay.markers.map((marker, index) => {
      const distance = marker.fieldIndex === field.index ? -1 : Math.hypot(marker.x - field.x, marker.y - field.y);
      return { marker, index, distance };
    }).filter(item => item.marker.text && item.distance < 150 && !usedMarkers.has(item.index));
    candidates.sort((a, b) => a.distance - b.distance);
    const selected = candidates[0];
    let answer = selected?.marker.text || '';
    if (selected) usedMarkers.add(selected.index);
    if (!answer && overlay.fields[field.index] && overlay.fields[field.index].value !== field.value) {
      answer = overlay.fields[field.index].value;
    }
    if (answer) fields.push({ index: field.index, tag: field.tag, answer, options: field.options });
    else if (field.tag === 'select') {
      const candidates = field.options.filter(option => option.text.trim() !== '---');
      if (candidates.length === 2) {
        fields.push({ index: field.index, tag: 'select', answer: candidates[0].text,
          options: field.options, guessed: true });
      }
    }
  }
  const choices = new Set();
  for (const marker of overlay.markers) {
    if (marker.choiceIndex >= 0) choices.add(marker.choiceIndex);
  }
  for (let i = 0; i < before.choices.length; i++) {
    const after = overlay.choices[i];
    if (after && after.checked && !before.choices[i].checked) choices.add(i);
    if (after && /correct-answer/i.test(after.className)) choices.add(i);
  }
  const drops = [];
  const usedDropMarkers = new Set();
  for (const drop of before.drops) {
    const candidates = overlay.markers.map((marker, index) => ({ marker, index,
      distance: Math.hypot(marker.x - drop.x, marker.y - drop.y),
    })).filter(item => /draggableGapFilled-correct-answer/.test(item.marker.className) &&
      item.marker.text && item.distance < 100 && !usedDropMarkers.has(item.index));
    candidates.sort((a, b) => a.distance - b.distance);
    if (candidates[0]) {
      drops.push({ id: drop.id, answer: candidates[0].marker.text });
      usedDropMarkers.add(candidates[0].index);
    } else if (drop.text) {
      drops.push({ id: drop.id, answer: drop.text, preserve: true });
    }
  }
  const options = overlay.markers.filter(marker => marker.id &&
    /ic_[sm]option/.test(marker.className) && /correct-answer/.test(marker.className))
    .map(marker => ({ id: marker.id, choiceIndex: marker.choiceIndex }));
  return { fields, choices: [...choices], options, drops,
    coloring: overlay.coloring || [], tableRadio: overlay.tableRadio || [],
    tableCheckbox: overlay.tableCheckbox || [],
    ordering: overlay.ordering || [], multigap: overlay.multigap || [] };
}

async function fillAnswerPlan(scope, plan) {
  const fields = scope.locator(FIELD_SELECTOR).filter({ visible: true });
  for (const field of plan.fields) {
    const locator = fields.nth(field.index);
    if (field.tag === 'select') {
      const matchIndex = field.options.findIndex(option => option.text.trim() === field.answer.trim());
      if (matchIndex < 0) throw new Error(`No dropdown option matches revealed answer: ${field.answer}`);
      await locator.selectOption({ index: matchIndex });
    } else {
      await locator.fill(field.answer);
      if (field.tag === 'input') {
        const prefix = await locator.getAttribute('placeholder') || '';
        const actual = await locator.inputValue();
        if (prefix && field.answer.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()) &&
            actual.toLocaleLowerCase() === (prefix + field.answer).toLocaleLowerCase()) {
          await locator.fill(field.answer.slice(prefix.length));
        }
      }
    }
  }
  const choices = scope.locator(CHOICE_SELECTOR).filter({ visible: true });
  for (const index of plan.choices) {
    if (plan.options.some(option => option.choiceIndex === index)) continue;
    const locator = choices.nth(index);
    const checked = await locator.evaluate(element => !!element.checked || element.getAttribute('aria-checked') === 'true');
    if (!checked) await locator.click();
  }
  for (const option of plan.options) {
    if (!/^[A-Za-z0-9_-]+$/.test(option.id)) throw new Error(`Unexpected choice option ID: ${option.id}`);
    await scope.locator(`[id="${option.id}"]`).click();
  }
  for (const radio of plan.tableRadio) {
    await scope.locator('tr:has(> td.tf_radio_image)').nth(radio.rowIndex)
      .locator(':scope > td.tf_radio_image').nth(radio.cellIndex).click();
  }
  const checkboxRows = scope.locator('tr:has(> td.tf_checkbox_image)');
  for (let rowIndex = 0; rowIndex < await checkboxRows.count(); rowIndex++) {
    const cells = checkboxRows.nth(rowIndex).locator(':scope > td.tf_checkbox_image');
    for (let cellIndex = 0; cellIndex < await cells.count(); cellIndex++) {
      const cell = cells.nth(cellIndex);
      const selected = await cell.evaluate(element => element.classList.contains('down'));
      const expected = plan.tableCheckbox.some(answer => answer.rowIndex === rowIndex && answer.cellIndex === cellIndex);
      if (selected !== expected) await cell.click();
    }
  }
  for (const order of plan.ordering) {
    if (!/^[A-Za-z0-9_-]+$/.test(order.id)) throw new Error(`Unexpected ordering table ID: ${order.id}`);
    const table = scope.locator(`[id="${order.id}"]`);
    for (let desired = 0; desired < order.items.length; desired++) {
      const rows = table.locator('tbody > tr');
      const current = await rows.evaluateAll(elements => elements.map(row =>
        (row.innerText || '').replace(/\s+/g, ' ').trim()));
      if (current[desired] === order.items[desired]) continue;
      const sourceIndex = current.findIndex((item, index) => index > desired && item === order.items[desired]);
      if (sourceIndex < 0) throw new Error(`Ordering answer not found: ${order.items[desired]}`);
      await rows.nth(sourceIndex).dragTo(rows.nth(desired),
        { targetPosition: { x: 30, y: 2 } });
      const updated = await rows.evaluateAll(elements => elements.map(row =>
        (row.innerText || '').replace(/\s+/g, ' ').trim()));
      if (updated[desired] !== order.items[desired]) {
        throw new Error(`Ordering drag did not move ${order.items[desired]} to position ${desired + 1}: ${JSON.stringify(updated)}`);
      }
    }
  }
  for (const group of plan.multigap) {
    if (!/^[A-Za-z0-9_-]+$/.test(group.id)) throw new Error(`Unexpected multiple-gap ID: ${group.id}`);
    const target = scope.locator(`[id="${group.id}"] .multiplegap_container.ui-droppable`);
    for (const answer of group.answers) {
      const sources = scope.locator('.ic_sourceListItem.ui-draggable');
      let source = null;
      for (let i = 0; i < await sources.count(); i++) {
        const candidate = sources.nth(i);
        if (normalizeAnswerText(await candidate.innerText()) === normalizeAnswerText(answer) &&
            await candidate.isVisible()) { source = candidate; break; }
      }
      if (!source) throw new Error(`Missing multiple-gap draggable answer: ${answer}`);
      await source.dragTo(target);
      const actual = await target.locator('.placeholder').allInnerTexts();
      if (!actual.some(text => normalizeAnswerText(text) === normalizeAnswerText(answer))) {
        throw new Error(`Multiple-gap ${group.id} did not accept ${answer}`);
      }
    }
  }
  for (const drop of plan.drops) {
    if (drop.preserve) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(drop.id)) throw new Error(`Unexpected drop target ID: ${drop.id}`);
    const normalized = normalizeAnswerText;
    const sources = scope.locator('.ic_sourceListItem.ui-draggable');
    let source = null;
    for (let i = 0; i < await sources.count(); i++) {
      const candidate = sources.nth(i);
      if (normalized(await candidate.innerText()) === normalized(drop.answer) && await candidate.isVisible()) {
        source = candidate;
        break;
      }
    }
    if (!source) throw new Error(`Missing draggable answer: ${drop.answer}`);
    const target = scope.locator(`[id="${drop.id}"]`);
    const readTarget = async () => (await target.innerText()).trim();
    // Pearson's jQuery UI activities accept click-source/click-target and are
    // more reliable that way when the lesson is inside a scrolled iframe.
    await source.click();
    await target.click();
    let actual = await readTarget();
    if (normalized(actual) !== normalized(drop.answer)) {
      source = null;
      for (let i = 0; i < await sources.count(); i++) {
        const candidate = sources.nth(i);
        if (normalized(await candidate.innerText()) === normalized(drop.answer) && await candidate.isVisible()) {
          source = candidate;
          break;
        }
      }
      if (!source) throw new Error(`Missing draggable answer after click attempt: ${drop.answer}`);
      await source.scrollIntoViewIfNeeded();
      await target.scrollIntoViewIfNeeded();
      await source.dragTo(target);
      actual = await readTarget();
    }
    if (normalized(actual) !== normalized(drop.answer) && source) {
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (sourceBox && targetBox) {
        const mouse = scope.page().mouse;
        await mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
        await mouse.down();
        await mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 25 });
        await mouse.up();
        actual = await readTarget();
      }
    }
    if (normalized(actual) !== normalized(drop.answer)) throw new Error(`Drop target ${drop.id} contains ${actual || '(empty)'} after dragging ${drop.answer}`);
  }
  for (const word of plan.coloring) {
    if (!/^[A-Za-z0-9_-]+$/.test(word.addonId) || !/^\d+$/.test(word.wordIndex)) {
      throw new Error(`Unexpected text coloring target: ${JSON.stringify(word)}`);
    }
    await scope.locator(`[id="${word.addonId}"] .text-coloring-selectable-word[data-word-index="${word.wordIndex}"]`).click();
  }
  for (const pair of plan.connections) {
    const source = scope.locator(`[id="${pair.from}"]`);
    const target = scope.locator(`[id="${pair.to}"]`);
    const sourceIcon = source.locator('.iconWrapper');
    const targetIcon = target.locator('.iconWrapper');
    const canvas = scope.locator('.addon_Connection:visible canvas.connections').first();
    const hasLine = () => canvas.evaluate((element, ids) => {
      const from = document.getElementById(ids.from)?.querySelector('.iconWrapper');
      const to = document.getElementById(ids.to)?.querySelector('.iconWrapper');
      if (!from || !to) return false;
      const rect = element.getBoundingClientRect();
      const centerY = item => {
        const box = item.getBoundingClientRect();
        return (box.top + box.height / 2 - rect.top) * element.height / rect.height;
      };
      const fromY = centerY(from), toY = centerY(to);
      const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
      let hits = 0;
      for (const fraction of [0.12, 0.28, 0.44, 0.6, 0.76, 0.9]) {
        const x = Math.round((element.width - 1) * fraction);
        const y = Math.round(fromY + (toY - fromY) * fraction);
        let found = false;
        for (let dy = -3; dy <= 3 && !found; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= element.width || yy >= element.height) continue;
          const offset = (yy * element.width + xx) * 4;
          const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
          if (pixels[offset + 3] && red < 130 && green > 90 && blue > 100 &&
              green > red + 35 && blue > red + 35) { found = true; break; }
        }
        if (found) hits++;
      }
      return hits >= 5;
    }, pair);
    if (await hasLine()) continue;
    await sourceIcon.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' }));
    await targetIcon.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' }));
    await source.click({ force: true, timeout: 3000 }).catch(() => {});
    await target.click({ force: true, timeout: 3000 }).catch(() => {});
    await scope.page().waitForTimeout(150);
    if (await hasLine()) continue;
    await source.dragTo(target, { timeout: 5000 }).catch(() => {});
    await scope.page().waitForTimeout(150);
    if (!await hasLine()) {
      const from = await sourceIcon.boundingBox();
      const to = await targetIcon.boundingBox();
      if (from && to) {
        const mouse = scope.page().mouse;
        await mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await mouse.down();
        await mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
        await mouse.up();
        await scope.page().waitForTimeout(150);
      }
    }
    if (!await hasLine()) {
      await sourceIcon.dragTo(targetIcon, { timeout: 5000 }).catch(() => {});
      await scope.page().waitForTimeout(150);
    }
    if (!await hasLine()) {
      await sourceIcon.click({ force: true, timeout: 3000 }).catch(() => {});
      await targetIcon.click({ force: true, timeout: 3000 }).catch(() => {});
      await scope.page().waitForTimeout(150);
    }
    if (!await hasLine()) {
      await targetIcon.dragTo(sourceIcon, { force: true, timeout: 5000 }).catch(() => {});
      await scope.page().waitForTimeout(150);
    }
    if (!await hasLine()) {
      await targetIcon.click({ force: true, timeout: 3000 }).catch(() => {});
      await sourceIcon.click({ force: true, timeout: 3000 }).catch(() => {});
      await scope.page().waitForTimeout(150);
    }
    if (!await hasLine()) {
      await source.dragTo(target, { force: true, timeout: 5000 }).catch(() => {});
      await scope.page().waitForTimeout(150);
    }
    if (!await hasLine()) {
      const file = path.join(process.cwd(), 'diagnostics', `connection-after-${Date.now()}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await canvas.screenshot({ path: file, timeout: 5000 }).catch(() => {});
      const layout = await scope.evaluate(ids => {
        const describe = id => {
          const item = document.getElementById(id);
          const element = item?.querySelector('.iconWrapper');
          const box = element?.getBoundingClientRect();
          if (!box) return null;
          const x = box.left + box.width / 2, y = box.top + box.height / 2;
          const hit = document.elementFromPoint(x, y);
          const jquery = window.jQuery || window.$;
          return { x, y, width: box.width, height: box.height,
            hit: hit?.outerHTML.slice(0, 350) || '',
            item: item?.outerHTML.slice(0, 900) || '',
            events: jquery?._data ? Object.keys(jquery._data(item, 'events') || {}) : [] };
        };
        return { from: describe(ids.from), to: describe(ids.to) };
      }, pair);
      const htmlFile = path.join(process.cwd(), 'diagnostics', `connection-dom-${Date.now()}.html`);
      fs.writeFileSync(htmlFile, await scope.evaluate(() =>
        document.querySelector('.addon_Connection')?.outerHTML || ''));
      throw new Error(`Pearson did not draw connection ${pair.from} -> ${pair.to}; ${JSON.stringify(layout)}; ${file}; ${htmlFile}`);
    }
  }
}

async function revealAnswers(scope, checkLimit) {
  let show = await firstVisible(scope, SHOW);
  if (show) console.log('Show Answers was already available before new checks.');
  for (let attempt = 0; !show && attempt < checkLimit; attempt++) {
    let check = await checkControl(scope);
    if (!check) {
      const reset = await resetControl(scope);
      if (reset) await clickReset(scope, reset);
      check = await checkControl(scope);
    }
    if (!check) throw new Error('Could not find the Check control');
    await clickCheck(check);
    show = await firstVisible(scope, SHOW);
    if (!show) {
      const reset = await resetControl(scope);
      const uncheck = await firstVisible(scope, UNCHECK);
      if (reset) await clickReset(scope, reset);
      else if (uncheck) await uncheck.click();
      else throw new Error('Check was used, but no Reset or Uncheck control appeared');
    }
  }
  if (!show) throw new Error(`Show Answers did not appear after ${checkLimit} checks`);
  const reset = await resetControl(scope);
  if (reset) {
    await clickReset(scope, reset);
    show = await firstVisible(scope, SHOW);
  }
  if (!show) throw new Error('Show Answers disappeared after Reset');
  await show.click();
  const limitedButtons = scope.locator('.limited-show-answers-button:visible');
  for (let i = 0; i < await limitedButtons.count(); i++) {
    const button = limitedButtons.nth(i);
    const selected = await button.evaluate(element =>
      !!element.closest('.limited-show-answers-wrapper')?.classList.contains('selected') ||
      element.classList.contains('selected'));
    if (!selected) await button.click({ force: true });
  }
}

async function hideAnswers(scope) {
  const limitedButtons = scope.locator('.limited-show-answers-button:visible');
  if (await limitedButtons.count()) {
    for (let i = 0; i < await limitedButtons.count(); i++) {
      const button = limitedButtons.nth(i);
      const selected = await button.evaluate(element =>
        !!element.closest('.limited-show-answers-wrapper')?.classList.contains('selected') ||
        element.classList.contains('selected'));
      if (selected) await button.click({ force: true });
    }
    const globalSelected = scope.locator('.addon_Show_Answers:visible .show-answers-wrapper.selected').first();
    if (await globalSelected.isVisible().catch(() => false)) await globalSelected.click();
    return;
  }
  const hide = await firstVisible(scope, HIDE) || await firstVisible(scope, SHOW);
  if (!hide) throw new Error('Could not find Hide Answers control');
  await hide.click();
}

async function solveCurrentPage(page, checkLimit) {
  const scope = await playerScope(page);
  const done = await firstVisible(scope, DONE);
  if (done) { await done.click(); return { status: 'done', scope }; }
  const existingResult = await scope.locator('body').innerText().catch(() => '');
  if (/Result\s*\|\s*100%/i.test(existingResult)) return { status: 'already-complete', scope };
  const before = await captureFields(scope);
  const hasCheck = !!await firstVisible(scope, CHECK);
  const hasShow = !!await firstVisible(scope, SHOW);
  const text = await scope.locator('body').innerText().catch(() => '');
  if (!hasCheck && !hasShow &&
      (before.fields.length + before.choices.length + before.drops.length === 0 || /^Reference\b/i.test(text.trim()))) {
    return { status: 'information', scope };
  }
  await revealAnswers(scope, checkLimit);
  let overlay = await captureOverlay(scope);
  let plan = buildAnswerPlan(before, overlay);
  if (plan.drops.length < before.drops.length || plan.fields.length < before.fields.length) {
    const globalShow = await firstVisible(scope, '.addon_Show_Answers:visible .show-answers-button');
    if (globalShow) {
      await globalShow.click();
      const alternateOverlay = await captureOverlay(scope);
      const alternatePlan = buildAnswerPlan(before, alternateOverlay);
      if (alternatePlan.drops.length + alternatePlan.fields.length >
          plan.drops.length + plan.fields.length) {
        overlay = alternateOverlay;
        plan = alternatePlan;
      } else if (plan.drops.length < before.drops.length) {
        const file = path.join(process.cwd(), 'diagnostics', `global-show-${Date.now()}.html`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, await scope.evaluate(() => document.body.innerHTML));
        console.error(`Global Show Answers inspection saved: ${file}`);
      }
    }
  }
  const trace = process.env.PEARSON_TRACE_ANSWERS === '1'
    ? { before, overlay, plan, shownHtml: await scope.evaluate(() => document.body.innerHTML) }
    : null;
  if (plan.fields.length + plan.choices.length + plan.options.length + plan.drops.length +
      plan.coloring.length + plan.tableRadio.length + plan.tableCheckbox.length + plan.ordering.length + plan.multigap.length === 0 &&
      !await scope.locator('.addon_Connection:visible canvas.connections').count()) {
    const file = path.join(process.cwd(), 'diagnostics', `unmapped-overlay-${Date.now()}.html`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await scope.evaluate(() => document.body.innerHTML));
    console.error(`Unmapped answer overlay saved: ${file}`);
  }
  if (plan.drops.length !== before.drops.length) {
    const shown = await scope.evaluate(() => {
      const visible = element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      return {
        answerControls: [...document.querySelectorAll('[class*="show-answers" i], [class*="check" i]')]
          .filter(visible).slice(0, 60).map(element => ({ id: element.id,
            className: String(element.className || ''), text: (element.innerText || '').trim().slice(0, 80) })),
        dragGaps: [...document.querySelectorAll('[class*="draggableGap" i]')]
          .filter(visible).map(element => ({ id: element.id, className: String(element.className || ''),
            text: (element.innerText || '').trim() })),
      };
    });
    const file = path.join(process.cwd(), 'diagnostics', `partial-answers-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ before, overlay, plan, shown }, null, 2));
    console.error(`Partial answer overlay saved: ${file}`);
  }
  plan.connections = [];
  if (await scope.locator('.addon_Connection:visible canvas.connections').count()) {
    try { plan.connections = await captureConnections(scope); }
    catch (error) {
      const canvas = scope.locator('.addon_Connection:visible canvas.connections').first();
      const file = path.join(process.cwd(), 'diagnostics', `connections-shown-${Date.now()}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await canvas.screenshot({ path: file, timeout: 5000 }).catch(() => {});
      throw new Error(`${error.message}; canvas saved to ${file}`);
    }
  }
  await hideAnswers(scope);
  const reset = await resetControl(scope);
  if (reset) await clickReset(scope, reset);
  if (before.fields.length + before.choices.length + before.drops.length > 0 &&
      plan.fields.length + plan.choices.length + plan.options.length + plan.drops.length +
      plan.coloring.length + plan.tableRadio.length + plan.tableCheckbox.length + plan.ordering.length +
      plan.multigap.length + plan.connections.length === 0) {
    throw new Error('Answers were shown, but no supported answer markers could be mapped to controls');
  }
  if (plan.fields.length !== before.fields.length) {
    throw new Error(`Mapped ${plan.fields.length}/${before.fields.length} text or dropdown answers`);
  }
  if (plan.drops.length !== before.drops.length) {
    throw new Error(`Mapped ${plan.drops.length}/${before.drops.length} drag answers`);
  }
  if (plan.fields.length + plan.choices.length + plan.options.length + plan.drops.length +
    plan.coloring.length + plan.tableRadio.length + plan.tableCheckbox.length + plan.ordering.length +
      plan.multigap.length + plan.connections.length === 0) {
    console.error('Unmapped controls:', JSON.stringify({
      fields: before.fields, choices: before.choices, drops: before.drops,
      markers: overlay.markers.slice(0, 30),
    }));
    throw new Error('This exercise type needs an answer adapter; no answers were mapped');
  }
  await fillAnswerPlan(scope, plan);
  await clickAllChecks(scope);
  const wrongFieldIndices = await scope.evaluate(fieldSelector => {
    const visible = element => {
      const box = element.getBoundingClientRect();
      return box.width > 1 && box.height > 1;
    };
    return [...document.querySelectorAll(fieldSelector)].filter(visible)
      .map((element, index) => /(?:wrong|incorrect)/i.test(element.className) ? index : -1)
      .filter(index => index >= 0);
  }, FIELD_SELECTOR);
  if (wrongFieldIndices.length) {
    const retryReset = await resetControl(scope);
    if (retryReset) {
      console.log(`Retrying ${wrongFieldIndices.length} field(s) Pearson marked wrong.`);
      await clickReset(scope, retryReset);
      await fillAnswerPlan(scope, plan);
      const fields = scope.locator(FIELD_SELECTOR).filter({ visible: true });
      for (const index of wrongFieldIndices) {
        const field = plan.fields.find(entry => entry.index === index);
        if (!field?.answer) continue;
        if (field.tag === 'select') {
          const alternatives = field.options
            .map((option, optionIndex) => ({ ...option, optionIndex }))
            .filter(option => option.text.trim() !== '---' &&
              option.text.trim() !== field.answer.trim());
          if (alternatives.length === 1) {
            await fields.nth(index).selectOption({ index: alternatives[0].optionIndex });
            continue;
          }
        }
        await fields.nth(index).evaluate((element, value) => {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.value = value;
        }, field.answer);
      }
      await clickAllChecks(scope);
    }
  }
  if (trace) {
    trace.after = await captureFields(scope);
    trace.afterText = await scope.locator('body').innerText();
    trace.afterHtml = await scope.evaluate(() => document.body.innerHTML);
    const file = path.join(process.cwd(), 'diagnostics', `answer-trace-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(trace, null, 2));
    console.log(`Answer trace saved: ${file}`);
  }
  return { status: 'answered', scope, plan };
}

async function advance(page, previousSignature) {
  const scope = await playerScope(page);
  const next = await firstVisible(scope, NEXT) || await firstVisible(page, NEXT);
  if (!next) return false;
  await next.click();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(300);
    const newScope = await playerScope(page);
    const signature = await pageSignature(newScope).catch(() => '');
    const content = await newScope.locator('body').innerText().catch(() => '');
    const activityText = await newScope.evaluate(() => {
      const root = document.querySelector('.ic_page, .ic-player, #player, main') || document.body;
      return (root?.innerText || '').replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
        .replace(/\s+/g, ' ').trim();
    }).catch(() => '');
    const ready = content.trim().length >= 100 ||
      !!await firstVisible(newScope, CHECK) ||
      !!await firstVisible(newScope, SHOW) ||
      !!await firstVisible(newScope, DONE);
    if (!ready || activityText.length < 10 || !signature || signature === previousSignature) continue;
    await page.waitForTimeout(400);
    if (await pageSignature(await playerScope(page)).catch(() => '') === signature) return true;
  }
  throw new Error('Next did not load a different lesson page within 30 seconds');
}

async function saveAndExit(page) {
  const scope = await playerScope(page);
  const courseExit = page.locator('.save-and-logo-container button.back-button').first();
  if (await courseExit.isVisible().catch(() => false)) return clickSaveAndExit(page, courseExit);
  const matches = page.getByText(/^SAVE\s*&\s*EXIT$/i);
  for (let i = 0; i < await matches.count(); i++) {
    const exit = matches.nth(i);
    if (await exit.isVisible().catch(() => false)) return clickSaveAndExit(page, exit);
  }
  const fallback = await firstVisible(page, SAVE_EXIT) || await firstVisible(scope, SAVE_EXIT);
  if (fallback) return clickSaveAndExit(page, fallback);
  const nodes = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter(element => element.textContent?.trim() === 'SAVE & EXIT')
    .slice(0, 5).map(element => element.outerHTML.slice(0, 300)));
  throw new Error(`Could not find Save & Exit; candidates: ${JSON.stringify(nodes)}`);
}

async function clickSaveAndExit(page, exit) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const returned = Promise.any([
      page.waitForURL(url => url.hostname === 'englishconnect.pearson.com' &&
        ((url.pathname.startsWith('/assignments-v2/assignment/') &&
          url.pathname.includes('/assignment-student-details/')) ||
          /^\/courses\/\d+\/next\//.test(url.pathname)), { timeout: 45_000 }),
      page.waitForEvent('close', { timeout: 45_000 }),
    ]);
    await exit.click({ timeout: 10_000 }).catch(() => {});
    try {
      await returned;
      return;
    } catch {
      if (page.isClosed()) return;
      if (attempt < 3) {
        console.log(`Save & Exit has not returned; retrying (${attempt}/3).`);
        exit = page.getByText(/^SAVE\s*&\s*EXIT$/i).filter({ visible: true }).first();
      }
    }
  }
  const error = new Error('Save & Exit did not return to the assignment or course after 3 attempts');
  error.saveExitTimeout = true;
  throw error;
}

module.exports = { playerScope, pageSignature, solveCurrentPage, advance, saveAndExit, firstVisible, captureConnections };
