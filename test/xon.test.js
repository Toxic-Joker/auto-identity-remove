/**
 * test/xon.test.js - free XposedOrNot breach lookup (no API key)
 *
 * checkBreachesFree returns the same shape as hibp.checkBreaches so the
 * existing report and breach-fix flow work unchanged. fetch is injected;
 * these tests never hit the network.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { checkBreachesFree } = require('../lib/xon');

const CATALOG = {
  status: 'success',
  exposedBreaches: [
    { breachID: 'Adobe', domain: 'adobe.com', breachedDate: '2013-10-04T00:00:00+00:00', exposedData: ['Email addresses', 'Passwords'] },
    { breachID: 'LinkedIn', domain: 'linkedin.com', breachedDate: '2012-05-05T00:00:00+00:00', exposedData: ['Email addresses'] },
  ],
};

function fakeFetch(routes) {
  const seen = [];
  const impl = async (url) => {
    seen.push(url);
    const key = Object.keys(routes).find(k => url.includes(k));
    const { status = 200, body } = routes[key];
    return { status, json: async () => body };
  };
  impl.seen = seen;
  return impl;
}

test('xon: maps breach names to domain, date and data classes', async () => {
  const fetchImpl = fakeFetch({
    '/check-email/': { body: { breaches: [['Adobe', 'LinkedIn']] } },
    '/breaches': { body: CATALOG },
  });
  const out = await checkBreachesFree('a@b.com', { fetchImpl });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    name: 'Adobe', domain: 'adobe.com', breachDate: '2013-10-04',
    dataClasses: ['Email addresses', 'Passwords'], severity: 'high',
  });
  assert.equal(out[1].domain, 'linkedin.com');
  assert.ok(fetchImpl.seen[0].endsWith('/check-email/a%40b.com'), 'email must be URL-encoded');
});

test('xon: not found (404) means no breaches', async () => {
  const fetchImpl = fakeFetch({ '/check-email/': { status: 404, body: { Error: 'Not found' } } });
  assert.deepEqual(await checkBreachesFree('a@b.com', { fetchImpl }), []);
});

test('xon: breach missing from the catalog still listed, without a domain', async () => {
  const fetchImpl = fakeFetch({
    '/check-email/': { body: { breaches: [['Unknown']] } },
    '/breaches': { body: CATALOG },
  });
  const out = await checkBreachesFree('a@b.com', { fetchImpl });
  assert.equal(out[0].name, 'Unknown');
  assert.equal(out[0].domain, '');
});

test('xon: rate limit (429) throws a clear error', async () => {
  const fetchImpl = fakeFetch({ '/check-email/': { status: 429, body: {} } });
  await assert.rejects(checkBreachesFree('a@b.com', { fetchImpl }), /rate limited/);
});
