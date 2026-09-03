/**
 * Shared helpers for reading a social_accounts row as something an
 * adapter can actually use: decrypted tokens, refreshed if the stored
 * access token is near/past expiry. Used by both routes/social.js
 * (publish-now / reply actions triggered from the UI) and
 * social/scheduler.js (the background publish poller) so token refresh
 * logic lives in exactly one place.
 */

const tokenCrypto = require('./crypto');
const ADAPTERS = require('./adapters');
const { getSocialClient } = require('./db');

const REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before actual expiry

/** Decrypts a raw social_accounts row into { ...row, accessToken, refreshToken }. */
function decryptAccount(row) {
  return {
    ...row,
    accessToken: tokenCrypto.decrypt(row.access_token),
    refreshToken: row.refresh_token ? tokenCrypto.decrypt(row.refresh_token) : null,
    externalAccountId: row.external_account_id
  };
}

/**
 * Loads a social_accounts row by id, decrypts it, and refreshes the
 * access token first if it's expired or about to be — persisting the new
 * token back (still encrypted) so the next call doesn't have to refresh
 * again. Returns null if the account doesn't exist.
 */
async function getUsableAccount(accountId) {
  const client = getSocialClient();
  if (!client) throw new Error('Social Supabase project not configured (SUPABASE_URL_SOCIAL / SUPABASE_KEY_SOCIAL).');

  const { data: row, error } = await client.from('social_accounts').select('*').eq('id', accountId).single();
  if (error || !row) return null;

  let account = decryptAccount(row);
  const adapter = ADAPTERS[account.platform];
  if (!adapter) throw new Error(`No adapter registered for platform "${account.platform}".`);

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const needsRefresh = expiresAt !== null && expiresAt - Date.now() < REFRESH_SKEW_MS;

  if (needsRefresh && account.refreshToken && typeof adapter.refreshAccessToken === 'function') {
    const refreshed = await adapter.refreshAccessToken(account.refreshToken);
    account.accessToken = refreshed.accessToken;
    await client
      .from('social_accounts')
      .update({ access_token: tokenCrypto.encrypt(refreshed.accessToken), expires_at: refreshed.expiresAt })
      .eq('id', accountId);
  }

  return { account, adapter };
}

module.exports = { decryptAccount, getUsableAccount };
