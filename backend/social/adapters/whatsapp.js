/**
 * WhatsApp Business Platform (Cloud API) adapter. Same Meta App as
 * facebook.js/instagram.js (META_APP_ID/SECRET) — WhatsApp Business
 * scopes are requested from the same OAuth dialog, no separate app.
 *
 * WhatsApp has no "posts" the way Facebook/Instagram do — it's a
 * messaging-only channel, so unlike those adapters this one has no
 * publish/fetchAnalytics/fetchPostCount/fetchPosts. That's fine: queue.js's
 * processJob and routes/social.js's postCountForAccount/analytics summary
 * already check `typeof adapter.X === 'function'` before calling, so an
 * account connected here just won't show up as a Composer target or in
 * Analytics' per-post view — Composer.jsx additionally filters whatsapp
 * out of its account picker explicitly, since "schedule a broadcast post"
 * isn't a real WhatsApp Business operation the way it is for the other
 * platforms (outbound messages here are either a reply within an open
 * customer conversation, or a pre-approved template message, which this
 * adapter doesn't build).
 *
 * What this adapter does provide is conversation messaging: sendReply()
 * for outbound, and inbound messages land via a webhook (see
 * routes/social.js's /social/webhook/whatsapp), not a poll — the Cloud
 * API has no "list all conversations" endpoint the way Messenger's
 * /page-id/conversations does, so fetchInbox() here is a stub (same
 * reasoning as instagram.js's for Instagram DMs) and pollers.js's sweep
 * never actually finds new messages this way; the webhook is what
 * populates inbox_messages for whatsapp, in real time as messages arrive.
 *
 * Setup: on the same Meta App as Facebook/Instagram, add the "WhatsApp"
 * product, with a WhatsApp Business Account (WABA) that already has at
 * least one verified phone number set up in Meta Business Suite (this
 * adapter connects to an existing WABA/number — it doesn't run Meta's
 * Embedded Signup flow to create one). Add this redirect URI:
 *   {BACKEND_PUBLIC_URL}/api/social/callback/whatsapp
 * and, under the app's WhatsApp > Configuration > Webhook settings:
 *   Callback URL: {BACKEND_PUBLIC_URL}/api/social/webhook/whatsapp
 *   Verify token: WHATSAPP_WEBHOOK_VERIFY_TOKEN (.env)
 *   Subscribe to: messages
 */

const metaOAuth = require('./_meta-oauth');

const PLATFORM = 'whatsapp';
const SCOPES = ['whatsapp_business_management', 'whatsapp_business_messaging', 'business_management'];

function isConfigured() {
  return metaOAuth.isConfigured();
}

const connect = {
  getAuthUrl(state) {
    return metaOAuth.buildAuthUrl(PLATFORM, SCOPES, state);
  },

  /**
   * Same "first eligible one, run OAuth again for another" limitation as
   * facebook.js's Page auto-pick — picks the first WhatsApp Business
   * Account the granted token can manage (per /debug_token's
   * granular_scopes, the same lookup listPages() uses for Pages) and the
   * first phone number registered under it.
   */
  async exchangeCode(code) {
    const { userAccessToken, expiresAt } = await metaOAuth.exchangeCodeForLongLivedUserToken(PLATFORM, code);
    const wabaIds = await metaOAuth.grantedTargetIds(userAccessToken, 'whatsapp_business_management');
    if (wabaIds.length === 0) {
      throw new Error('WhatsApp OAuth succeeded but this token has no WhatsApp Business Account scoped to it — make sure a WABA is set up in Meta Business Suite and this app is granted access to it there.');
    }

    const phoneNumbers = await metaOAuth.graphFetch(`/${wabaIds[0]}/phone_numbers`, { access_token: userAccessToken });
    const phone = (phoneNumbers.data || [])[0];
    if (!phone) throw new Error(`WhatsApp Business Account ${wabaIds[0]} has no phone number registered yet — add and verify one in Meta Business Suite first.`);

    return {
      // Cloud API messaging calls use the user/system token directly —
      // unlike Facebook Pages there's no separate derived "phone number
      // token" to fetch.
      accessToken: userAccessToken,
      refreshToken: userAccessToken,
      expiresAt,
      externalAccountId: phone.id, // the phone_number_id every /messages call targets
      accountLabel: phone.verified_name ? `${phone.verified_name} (${phone.display_phone_number})` : phone.display_phone_number
    };
  }
};

async function refreshAccessToken(refreshToken) {
  const { userAccessToken, expiresAt } = await metaOAuth.refreshLongLivedUserToken(refreshToken);
  return { accessToken: userAccessToken, refreshToken: userAccessToken, expiresAt };
}

/**
 * Sends a free-form text message — valid only within the 24h customer
 * service window since the customer's last inbound message (WhatsApp's
 * own platform rule, not this app's); outside that window the Cloud API
 * rejects it and a pre-approved template message would be needed
 * instead, which this adapter doesn't build. externalId here is
 * inbox_messages.external_thread_id, which the webhook sets to the
 * customer's wa_id (phone number) — see routes/social.js's webhook
 * handler.
 */
async function sendReply(account, externalId, message) {
  const data = await metaOAuth.graphPostJson(`/${account.externalAccountId}/messages`, account.accessToken, {
    messaging_product: 'whatsapp',
    to: externalId,
    type: 'text',
    text: { body: message }
  });
  return { externalId: (data.messages && data.messages[0] && data.messages[0].id) || null };
}

// The Cloud API has no endpoint to list past conversations/messages —
// inbound messages only ever arrive via the webhook (see
// routes/social.js's /social/webhook/whatsapp), which upserts directly
// into inbox_messages. pollers.js's typeof check skips this cleanly.
async function fetchInbox() {
  return [];
}

module.exports = {
  isConfigured,
  connect,
  sendReply,
  fetchInbox,
  refreshAccessToken,
  metadata: {
    name: 'WhatsApp',
    platform: PLATFORM,
    description: 'Customer conversation messaging via the WhatsApp Business Platform (Cloud API) — inbound messages via webhook, outbound replies from the Inbox. No post publishing.'
  }
};
