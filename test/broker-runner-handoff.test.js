/**
 * test/broker-runner-handoff.test.js - --handoff in processBroker
 *
 * With handoff: true, a captchaLikely broker pauses for the user instead of
 * calling the CapSolver path, submits when they finish, and logs 'manual'
 * when they skip. Dry-run never prompts.
 *
 * Uses Module._load interception pattern from broker-runner-preview.test.js.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const Module = require('module');
const originalLoad = Module._load.bind(Module);

const logged = [];
const calls = { solver: 0, handoff: 0, submit: 0 };
let handoffAnswer = 'done';
let listingUrl = null;
const handoffTasks = [];

const configMock = {
  shouldSkip: () => null,
  recordSuccess: () => {},
  recordPendingConfirmation: () => {},
  recordFailure: () => {},
  saveCheckpoint: () => {},
  stateKey: (brokerName) => brokerName,
};

function patchedLoad(request, parent, isMain) {
  if (!parent?.filename?.includes('broker-runner')) return originalLoad(request, parent, isMain);
  if (request === './config') return configMock;
  if (request === './logger') return { logResult: (name, status, detail) => logged.push({ name, status, detail }) };
  if (request === './forms') return { fillForm: async () => {}, findListingUrl: async () => listingUrl };
  if (request === './captcha') return { detectAndSolveCaptcha: async () => { calls.solver++; return true; } };
  if (request === './handoff') return { waitForHuman: async (_p, _b, opts = {}) => { calls.handoff++; handoffTasks.push(opts.task || 'captcha'); return handoffAnswer; } };
  if (request === './confirm') return { detectConfirmationRequired: async () => ({ pending: false, snippet: '' }) };
  if (request === './timing') return { jitterSleep: async () => {} };
  return originalLoad(request, parent, isMain);
}

Module._load = patchedLoad;
const brokerRunnerPath = require.resolve('../lib/broker-runner');
delete require.cache[brokerRunnerPath];
const { configure, processBroker } = require('../lib/broker-runner');
Module._load = originalLoad;

function makeContext() {
  return {
    newPage: async () => ({
      goto: async () => ({}),
      evaluate: async () => 'Your opt-out request has been received',
      locator: () => ({
        first: () => ({
          fill: async () => {},
          count: async () => 1,
          isVisible: async () => true,
          click: async () => { calls.submit++; },
        }),
      }),
      close: async () => {},
    }),
  };
}

const BROKER = {
  name: 'TestHandoffBroker',
  method: 'direct-form',
  optOutUrl: 'https://example.com/optout',
  submitSelector: 'button',
  captchaLikely: true,
};

function reset(answer = 'done') {
  logged.length = 0;
  calls.solver = calls.handoff = calls.submit = 0;
  handoffAnswer = answer;
  listingUrl = null;
  handoffTasks.length = 0;
}

test('handoff: pauses for the user and never calls the solver', async () => {
  reset('done');
  configure({ dryRun: false, preview: false, handoff: true, noCapsolver: true, person: { country: 'US' } });
  await processBroker(makeContext(), BROKER);
  assert.equal(calls.handoff, 1, 'must hand off once');
  assert.equal(calls.solver, 0, 'must not call CapSolver');
  assert.equal(calls.submit, 1, 'must submit after the user finishes');
});

test('handoff: skip logs manual and does not submit', async () => {
  reset('skip');
  configure({ dryRun: false, preview: false, handoff: true, person: { country: 'US' } });
  await processBroker(makeContext(), BROKER);
  assert.equal(calls.submit, 0, 'must not submit after skip');
  assert.ok(logged.find(l => l.status === 'manual'), 'must log manual');
});

test('handoff: dry-run does not prompt', async () => {
  reset('done');
  configure({ dryRun: true, preview: false, handoff: true, person: { country: 'US' } });
  await processBroker(makeContext(), BROKER);
  assert.equal(calls.handoff, 0, 'must not prompt in dry-run');
  assert.equal(calls.submit, 0, 'must not submit in dry-run');
});

const ACCOUNT_BROKER = {
  name: 'TestAccountBroker',
  method: 'search-form',
  searchUrl: 'https://example.com/search',
  optOutUrl: 'https://example.com/optout',
  submitSelector: 'button',
  needsAccount: true,
};

test('needsAccount: no listing found -> never asks to log in', async () => {
  reset('done');
  configure({ dryRun: false, preview: false, handoff: true, person: { country: 'US' } });
  await processBroker(makeContext(), ACCOUNT_BROKER);
  assert.equal(calls.handoff, 0, 'must not ask for a login when not listed');
  assert.ok(logged.find(l => l.status === 'notFound'));
});

test('needsAccount: listing found with --handoff -> asks to log in, then submits', async () => {
  reset('done');
  listingUrl = 'https://example.com/people/jane-doe';
  configure({ dryRun: false, preview: false, handoff: true, person: { country: 'US' } });
  await processBroker(makeContext(), ACCOUNT_BROKER);
  assert.deepEqual(handoffTasks, ['login'], 'must ask for a login once');
  assert.equal(calls.submit, 1, 'must submit after the user logs in');
});

test('needsAccount: listing found without --handoff -> manual, no submit', async () => {
  reset('done');
  listingUrl = 'https://example.com/people/jane-doe';
  configure({ dryRun: false, preview: false, handoff: false, person: { country: 'US' } });
  await processBroker(makeContext(), ACCOUNT_BROKER);
  assert.equal(calls.submit, 0, 'must not submit without a login');
  const m = logged.find(l => l.status === 'manual');
  assert.ok(m && /listing/i.test(m.detail), 'manual entry should say a listing was found');
});
