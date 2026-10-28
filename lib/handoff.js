/**
 * lib/handoff.js
 *
 * Human-in-the-loop CAPTCHA handling (--handoff). Instead of sending the
 * challenge to a paid solver, bring the broker page to the front of the
 * headed browser and wait for the user to solve it there. The run then
 * continues and submits the form as usual.
 */

const readline = require('readline');

/**
 * @param {import('playwright').Page} page
 * @param {{ name: string }} broker
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, task?: 'captcha'|'login' }} [io]
 * @returns {Promise<'done'|'skip'>}
 */
const TASKS = {
  captcha: 'solve the CAPTCHA in the browser window, then press Enter to submit',
  login:   'your listing was found - log in (or create an account) in the browser window, then press Enter to continue',
  breach:  'your email leaked here - log in, then change the password (and anywhere you reused it) or delete the account; press Enter when done',
};

async function waitForHuman(page, broker, { input = process.stdin, output = process.stdout, task = 'captcha' } = {}) {
  await page.bringToFront().catch(() => {});
  const rl = readline.createInterface({ input, output, terminal: false });
  try {
    const answer = await new Promise(resolve =>
      rl.question(`\n  🙋 ${broker.name}: ${TASKS[task]} (s + Enter to skip): `, resolve)
    );
    return /^s(kip)?$/i.test(answer.trim()) ? 'skip' : 'done';
  } finally {
    rl.close();
  }
}

module.exports = { waitForHuman };
