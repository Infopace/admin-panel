/**
 * One-off: settles "is the app actually subscribed" definitively by
 * calling Meta's own GET /{waba-id}/subscribed_apps — the same edge
 * subscribe-whatsapp-webhook.js POSTs to — and printing exactly which
 * app(s) it returns, cross-checked against this backend's own
 * META_APP_ID. subscribed_apps having a 200/success response at POST
 * time doesn't by itself prove events will flow if, e.g., a stale token
 * or a different underlying app got subscribed by mistake — this reads
 * back the actual state instead of inferring it.
 *
 * Usage: node scripts/check-whatsapp-subscription.js <waba-id>
 * Run from the backend/ directory so .env loads correctly.
 */

require('dotenv').config();
const { getSocialClient } = require('../social/db');
const tokenCrypto = require('../social/crypto');
const metaOAuth = require('../social/adapters/_meta-oauth');

async function main() {
  const wabaId = process.argv[2];
  if (!wabaId) {
    console.error('Usage: node scripts/check-whatsapp-subscription.js <waba-id>');
    process.exit(1);
  }

  const client = getSocialClient();
  if (!client) {
    console.error('SUPABASE_URL_SOCIAL / SUPABASE_KEY_SOCIAL not set in backend/.env');
    process.exit(1);
  }

  const { data: row, error } = await client
    .from('social_accounts')
    .select('*')
    .eq('platform', 'whatsapp')
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('Supabase query failed:', error.message);
    process.exit(1);
  }
  if (!row) {
    console.error('No active whatsapp row found in social_accounts.');
    process.exit(1);
  }

  console.log(`This backend's META_APP_ID: ${process.env.META_APP_ID}`);
  console.log(`Connected account: ${row.account_label || row.external_account_id}`);
  const accessToken = tokenCrypto.decrypt(row.access_token);

  try {
    const result = await metaOAuth.graphFetch(`/${wabaId}/subscribed_apps`, { access_token: accessToken });
    const apps = result.data || [];
    if (apps.length === 0) {
      console.log('\nNo apps are subscribed to this WABA at all — the subscribe step never actually took effect.');
      process.exit(0);
    }
    console.log(`\n${apps.length} app(s) subscribed to WABA ${wabaId}:`);
    for (const app of apps) {
      const isThisApp = String(app.whatsapp_business_api_data && app.whatsapp_business_api_data.id) === String(process.env.META_APP_ID);
      console.log(`  - ${JSON.stringify(app)}${isThisApp ? '  <-- this is this backend\'s app' : ''}`);
    }
  } catch (err) {
    console.error('Failed:', err.message);
    if (err.graphErrorCode) console.error('Graph error code:', err.graphErrorCode);
    process.exit(1);
  }
}

main();
