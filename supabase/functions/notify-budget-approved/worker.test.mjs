import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const source = stripTypeScriptTypes(readFileSync(new URL('./index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/, ''));
async function scenario({ token, enabled = true, deliveries = [], providerStatus = 200 }) {
  let handler;
  const updates = [], emails = [];
  const db = {
    rpc: async name => ({ data: name === 'budget_notification_config' ? { hook_token: 'test-token', enabled, resend_key: 'fake', from: 'sender@example.com' } : deliveries }),
    from: table => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'profiles' ? { status: 'Active' } : { enabled: true, user_ids: ['u1'] } }) }) }),
      update: data => ({ eq: async () => { updates.push(data); return {}; } }),
    }),
  };
  runInNewContext(source, {
    createClient: () => db, Deno: { env: { get: () => 'fake' }, serve: fn => { handler = fn; } },
    Response, Request, AbortSignal, Intl, Date, console,
    setTimeout: fn => { fn(); },
    fetch: async (_url, options) => { emails.push(options); return Response.json(providerStatus === 200 ? { id: 'email-id' } : {}, { status: providerStatus }); },
  });
  const response = await handler(new Request('https://example.com', { method: 'POST', headers: token ? { 'x-notification-token': token } : {} }));
  return { response, updates, emails };
}
assert.equal((await scenario({})).response.status, 401);
assert.equal((await scenario({ token: 'wrong' })).response.status, 401);
assert.equal((await scenario({ token: 'test-token', enabled: false })).response.status, 503);
assert.equal((await scenario({ token: 'test-token' })).response.status, 200);
const delivery = { id: 'd1', user_id: 'u1', recipient: 'recipient@example.com', attempts: 1, payload: { number: 'P-1', title: '<script>unsafe</script>', amount: 100, currency: 'UF', approved_at: '2026-10-05T12:00:00Z' } };
const success = await scenario({ token: 'test-token', deliveries: [delivery] });
assert.equal(success.updates[0].status, 'sent');
assert.equal(success.emails[0].headers['Idempotency-Key'], 'budget-approval/d1');
assert.ok(JSON.parse(success.emails[0].body).html.includes('&lt;script&gt;'));
assert.deepEqual(JSON.parse(success.emails[0].body).to, ['recipient@example.com']);
assert.equal((await scenario({ token: 'test-token', deliveries: [delivery], providerStatus: 429 })).updates[0].status, 'pending');
assert.equal((await scenario({ token: 'test-token', deliveries: [delivery], providerStatus: 403 })).updates[0].status, 'failed');
console.log('8 worker checks passed: authentication, pause, empty queue, send, escaping, recipient privacy, retry and permanent failure.');
