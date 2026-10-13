// Copyright (c) 2026 anhtuank9. See LICENSE for non-commercial terms.
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadConfig } = require('../src/config');
const { browserLaunchOptions } = require('../src/index');

const CONFIG_KEYS = [
  'PEARSON_USERNAME',
  'PEARSON_PASSWORD',
  'PEARSON_START_URL',
  'PEARSON_BROWSER',
  'PEARSON_HEADLESS',
  'CODESPACES',
  'PEARSON_VIEWPORT_HEIGHT',
  'PEARSON_MAX_ASSIGNMENTS',
  'PEARSON_MAX_PAGES',
  'PEARSON_CHECK_LIMIT',
  'PEARSON_ASSIGNMENT_FILTER',
  'PEARSON_LESSON_FILTER',
];

function withEnvironment(overrides, callback) {
  const previous = Object.fromEntries(CONFIG_KEYS.map(key => [key, process.env[key]]));
  for (const key of CONFIG_KEYS) process.env[key] = '';
  Object.assign(process.env, overrides);
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('loads a safe configuration without credentials', () => {
  withEnvironment({
    PEARSON_START_URL: 'https://englishconnect.pearson.com/',
    PEARSON_BROWSER: 'chromium',
    PEARSON_VIEWPORT_HEIGHT: '900',
    PEARSON_MAX_ASSIGNMENTS: '100',
    PEARSON_MAX_PAGES: '300',
    PEARSON_CHECK_LIMIT: '5',
  }, () => {
    const config = loadConfig();
    assert.equal(config.browser, 'chromium');
    assert.equal(config.headless, false);
    assert.equal(config.username, '');
    assert.equal(config.checkLimit, 5);
  });
});

test('requires username and password together', () => {
  withEnvironment({ PEARSON_USERNAME: 'student', PEARSON_PASSWORD: '' }, () => {
    assert.throws(loadConfig, /Set both PEARSON_USERNAME and PEARSON_PASSWORD/);
  });
});

test('rejects a non-Pearson start URL', () => {
  withEnvironment({
    PEARSON_START_URL: 'https://example.com/',
    PEARSON_USERNAME: '',
    PEARSON_PASSWORD: '',
  }, () => assert.throws(loadConfig, /PEARSON_START_URL/));
});

test('rejects invalid loop limits', () => {
  withEnvironment({
    PEARSON_USERNAME: '',
    PEARSON_PASSWORD: '',
    PEARSON_MAX_PAGES: '0',
  }, () => assert.throws(loadConfig, /PEARSON_MAX_PAGES must be a positive integer/));
});

test('launches bundled Chromium without a channel', () => {
  assert.deepEqual(browserLaunchOptions({ browser: 'chromium', headless: true }), {
    headless: true,
    args: ['--disable-save-password-bubble', '--disable-dev-shm-usage'],
  });
  assert.deepEqual(browserLaunchOptions({ browser: 'chromium', headless: false }), {
    headless: false,
    args: ['--disable-save-password-bubble', '--disable-dev-shm-usage'],
  });
  assert.equal(browserLaunchOptions({ browser: 'chrome', headless: false }).channel, 'chrome');
});

test('uses headless Chromium automatically in Codespaces', () => {
  withEnvironment({
    CODESPACES: 'true',
    PEARSON_USERNAME: 'student',
    PEARSON_PASSWORD: 'password',
  }, () => {
    const config = loadConfig();
    assert.equal(config.browser, 'chromium');
    assert.equal(config.headless, true);
  });
});

test('requires credentials in headless mode', () => {
  withEnvironment({
    PEARSON_HEADLESS: '1',
    PEARSON_USERNAME: '',
    PEARSON_PASSWORD: '',
  }, () => assert.throws(loadConfig, /Headless mode requires both/));
});
