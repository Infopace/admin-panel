/**
 * One-off: activates the connected phone number for Cloud API messaging by
 * calling POST /{phone-number-id}/register with a two-step-verification PIN.
 *
 * This is the step whatsapp.js's connect.exchangeCode()/completeEmbeddedSignup()
 * never perform — OAuth + subscribed_apps alone insert a social_accounts row
 * and subscribe this app to the WABA's events, but the phone number itself
 * stays inactive for Cloud API traffic until it's explicitly registered here.
 *
 * WARNING: if the number is currently logged into the regular WhatsApp
 * Business App on a phone, this call displaces it — that app gets logged
 * out and stops receiving messages for this number. From this point on,
 * only the Cloud API (this backend) receives its messages. This is the
 * intended one-time migration, but it's effectively irreversible without
 * re-registering the number back in the consumer app, so only run this
 * once you're sure you want the admin panel to own this number's messaging.
 *
 * Usage: node scripts/register-whatsapp-number.js <6-digit-pin>
 *   <6-digit-pin> is any PIN you choose for WhatsApp's two-step
 *   verification on this number — pick one and remember it, it isn't
 *   stored anywhere else by this app.
 * Run from the backend/ directory so .env loads correctly.
 */

require('dotenv').config();
const { getSocialClient } = require('../social/db');
const tokenCrypto = require('../social/crypto');
const metaOAuth = require('../social/adapters/_meta-oauth');

async function main() {
  const pin = process.argv[2];
  if (!pin || !/^\d{6}$/.test(pin)) {
    console.error('Usage: node scripts/register-whatsapp-number.js <6-digit-pin>');
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

  console.log(`Registering phone number ${row.account_label || row.external_account_id} (${row.external_account_id}) for Cloud API messaging...`);
  const accessToken = tokenCrypto.decrypt(row.access_token);

  try {
    const result = await metaOAuth.graphPostJson(`/${row.external_account_id}/register`, accessToken, {
      messaging_product: 'whatsapp',
      pin
    });
    console.log('Success:', JSON.stringify(result));
    console.log('The number is now Cloud-API-active. If it was logged into the WhatsApp Business App on a phone, that session has been displaced.');
  } catch (err) {
    console.error('Failed:', err.message);
    if (err.graphErrorCode) console.error('Graph error code:', err.graphErrorCode);
    process.exit(1);
  }
}

main();
