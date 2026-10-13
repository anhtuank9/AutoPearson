// AutoPearson — Copyright (c) 2026 anhtuank9. All rights reserved.
// Non-commercial use only. Copying or using this code for profit requires
// prior written permission: https://github.com/anhtuank9. See LICENSE.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function positiveInt(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function booleanValue(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (/^(?:1|true|yes)$/i.test(raw)) return true;
  if (/^(?:0|false|no)$/i.test(raw)) return false;
  throw new Error(`${name} must be 1/0, true/false, or yes/no`);
}

function loadConfig() {
  const root = path.resolve(__dirname, '..');
  readEnvFile(path.join(root, '.env'));
  const startUrl = process.env.PEARSON_START_URL || 'https://englishconnect.pearson.com/';
  const url = new URL(startUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'englishconnect.pearson.com') {
    throw new Error('PEARSON_START_URL must be https://englishconnect.pearson.com/');
  }
  const username = process.env.PEARSON_USERNAME || '';
  const password = process.env.PEARSON_PASSWORD || '';
  if (Boolean(username) !== Boolean(password)) {
    throw new Error('Set both PEARSON_USERNAME and PEARSON_PASSWORD, or leave both empty for manual sign-in');
  }
  const inCodespaces = /^true$/i.test(process.env.CODESPACES || '');
  const headless = booleanValue('PEARSON_HEADLESS', inCodespaces);
  if (headless && (!username || !password)) {
    throw new Error('Headless mode requires both PEARSON_USERNAME and PEARSON_PASSWORD');
  }
  const browser = (process.env.PEARSON_BROWSER || (inCodespaces ? 'chromium' : 'chrome')).trim();
  if (!/^(?:chromium|chrome(?:-(?:beta|dev|canary))?|msedge(?:-(?:beta|dev|canary))?)$/.test(browser)) {
    throw new Error('PEARSON_BROWSER must be chromium, chrome, msedge, or a supported beta/dev/canary channel');
  }
  return {
    root,
    startUrl,
    username,
    password,
    browser,
    headless,
    viewportHeight: positiveInt('PEARSON_VIEWPORT_HEIGHT', 900),
    maxAssignments: positiveInt('PEARSON_MAX_ASSIGNMENTS', 100),
    maxPages: positiveInt('PEARSON_MAX_PAGES', 300),
    checkLimit: positiveInt('PEARSON_CHECK_LIMIT', 5),
    assignmentFilter: (process.env.PEARSON_ASSIGNMENT_FILTER || '').trim().toLocaleLowerCase(),
    lessonFilter: (process.env.PEARSON_LESSON_FILTER || '').trim().toLocaleLowerCase(),
    diagnosticsDir: path.join(root, 'diagnostics'),
  };
}

module.exports = { loadConfig };
