/**
 * Shared OAuth + Graph API helper for the two Meta-family adapters
 * (facebook.js, instagram.js) — same role as _google-oauth.js for
 * youtube.js/google-business.js: one Meta App (META_APP_ID/SECRET)
 * covers both, since Instagram publishing/reading goes through the same
 * Graph API using the linked Facebook Page's access token, not a
 * separate Instagram-specific OAuth app.
 *
 * Meta has no refresh_token the way Google does. Instead:
 *   1. The OAuth code exchanges for a short-lived user token (~1-2h).
 *   2. That's immediately exchanged for a long-lived user token (~60d).
 *   3. The long-lived user token is used to fetch a Page access token,
 *      which inherits that ~60d validity and is what gets stored as
 *      social_accounts.access_token — Graph API calls for a Page (and
 *      its linked Instagram Business Account) use the Page token
 *      directly, not the user token.
 * "Refreshing" here means re-running step 2 on the still-valid long-lived
 * user token before it expires, then re-deriving a fresh Page token —
 * see refreshAccessToken() in facebook.js/instagram.js. If the user
 * token has already fully expired, this fails and the account needs a
 * fresh OAuth connect (same as any platform whose refresh window is
 * missed entirely).
 *
 * Meta App Review note (build spec section 6, Phase 2): pages_manage_posts
 * and instagram_content_publish require App Review before they work for
 * anyone other than the app's own Meta developer/testers in Development
 * Mode. This code is written and worth testing against your own
 * dev-mode Page/Instagram Business Account now; it won't work for real
 * third-party users until that review is approved.
 */

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function redirectUriFor(platform) {
  const base = process.env.BACKEND_PUBLIC_URL || 'http://localhost:5000';
  return `${base}/api/social/callback/${platform}`;
}

function isConfigured() {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function requireConfigured() {
  if (!isConfigured()) throw new Error('META_APP_ID / META_APP_SECRET are not set in backend/.env.');
}

function buildAuthUrl(platform, scopes, state) {
  requireConfigured();
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: redirectUriFor(platform),
    state,
    scope: scopes.join(','),
    response_type: 'code'
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function graphFetch(path, params = {}) {
  const url = `${GRAPH_BASE}${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) {
    throw new Error(`Meta Graph API error on ${path}: ${(body.error && body.error.message) || res.status}`);
  }
  return body;
}

/** Same as graphFetch but POST, params as form body — Graph API accepts either. */
async function graphPost(path, params = {}) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const body = await res.json();
  if (!res.ok || body.error) {
    throw new Error(`Meta Graph API error on ${path}: ${(body.error && body.error.message) || res.status}`);
  }
  return body;
}

/** Short-lived code -> short-lived user token -> long-lived user token. */
async function exchangeCodeForLongLivedUserToken(platform, code) {
  requireConfigured();
  const short = await graphFetch('/oauth/access_token', {
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: redirectUriFor(platform),
    code
  });

  const long = await graphFetch('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: short.access_token
  });

  return {
    userAccessToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null
  };
}

/** Re-exchanges a still-valid long-lived user token for a fresh one. */
async function refreshLongLivedUserToken(userAccessToken) {
  requireConfigured();
  const long = await graphFetch('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: userAccessToken
  });
  return {
    userAccessToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null
  };
}

/** Every Page (+ linked Instagram Business Account, if any) this user token can manage. */
async function listPages(userAccessToken) {
  const data = await graphFetch('/me/accounts', {
    access_token: userAccessToken,
    fields: 'id,name,access_token,instagram_business_account'
  });
  return data.data || [];
}

module.exports = {
  GRAPH_BASE,
  isConfigured,
  buildAuthUrl,
  exchangeCodeForLongLivedUserToken,
  refreshLongLivedUserToken,
  listPages,
  graphFetch,
  graphPost
};
