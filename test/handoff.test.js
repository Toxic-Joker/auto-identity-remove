/**
 * test/handoff.test.js - --handoff human-in-the-loop CAPTCHA pause
 *
 * waitForHuman brings the broker page to the front, prompts on the given
 * output stream, and resolves 'done' on Enter or 'skip' when the user types s.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const { waitForHuman } = require('../lib/handoff');

function makePage() {
  const page = { fronted: false, bringToFront: async () => { page.fronted = true; } };
  return page;
}

function run(answer) {
  const input = new PassThrough();
  const output = new PassThrough();
  let prompt = '';
  output.on('data', d => { prompt += d; });
  const page = makePage();
  const result = waitForHuman(page, { name: 'Spokeo' }, { input, output });
  setImmediate(() => input.write(answer + '\n'));
  return result.then(r => ({ r, page, prompt }));
}

test('handoff: Enter resolves done and brings the page to the front', async () => {
  const { r, page, prompt } = await run('');
  assert.equal(r, 'done');
  assert.ok(page.fronted, 'page must be brought to the front');
  assert.match(prompt, /Spokeo/, 'prompt should name the broker');
});

test('handoff: "s" resolves skip', async () => {
  const { r } = await run('s');
  assert.equal(r, 'skip');
});

test('handoff: "skip" in any case resolves skip', async () => {
  const { r } = await run('  SKIP ');
  assert.equal(r, 'skip');
});
