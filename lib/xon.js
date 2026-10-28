/**
 * lib/xon.js
 *
 * Free breach lookup via XposedOrNot (https://xposedornot.com) - no API key.
 * Used by --breach-check / --breach-fix when no HIBP key is configured.
 *
 *   checkBreachesFree(email, { fetchImpl }) -> same shape as hibp.checkBreaches:
 *     [{ name, domain, breachDate, dataClasses, severity }]
 *
 * Two documented endpoints: /v1/check-email/{email} gives breach names, and
 * /v1/breaches (the public catalog) gives each breach's domain and data.
 * Free tier limit is 25 email checks per hour per IP.
 */

'use strict';

const { severityOf } = require('./hibp');

const XON_BASE = 'https://api.xposedornot.com/v1';

async function getJson(doFetch, url) {
  const res = await doFetch(url, { method: 'GET', headers: { 'User-Agent': 'auto-identity-remove' } });
  if (res.status === 404) return null;
  if (res.status === 429) throw new Error('XposedOrNot: rate limited (429) - try again in an hour');
  if (res.status < 200 || res.status >= 300) throw new Error(`XposedOrNot: unexpected status ${res.status}`);
  return res.json();
}

async function checkBreachesFree(email, opts = {}) {
  const doFetch = opts.fetchImpl || fetch;

  const hit = await getJson(doFetch, `${XON_BASE}/check-email/${encodeURIComponent(email)}`);
  // Response: { breaches: [["Adobe", "LinkedIn"]] }; not found is 404 / { Error }.
  const names = (hit && Array.isArray(hit.breaches) ? hit.breaches.flat() : []).filter(Boolean);
  if (names.length === 0) return [];

  const catalog = await getJson(doFetch, `${XON_BASE}/breaches`);
  const byId = new Map(((catalog && catalog.exposedBreaches) || []).map(b => [b.breachID, b]));

  return names.map(name => {
    const b = byId.get(name) || {};
    const dataClasses = Array.isArray(b.exposedData) ? b.exposedData : [];
    return {
      name,
      domain: b.domain || '',
      breachDate: (b.breachedDate || '').slice(0, 10),
      dataClasses,
      severity: severityOf(dataClasses),
    };
  });
}

module.exports = { checkBreachesFree, XON_BASE };
