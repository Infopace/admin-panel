/**
 * Social module routes. Registered from server.js the same way this repo
 * keeps its registration style consistent: one place lists every route,
 * handlers stay thin, and — like every db1-db6 route already in
 * server.js — nothing here branches on platform name directly; it always
 * goes through ADAPTERS[platform] (social/adapters/index.js).
 *
 * Exports two routers rather than one — server.js mounts them on either
 * side of its own app.use(authenticateToken) line, which is what
 * actually enforces the public/protected split below (no separate
 * per-route auth check needed in this file):
 *   - publicRouter   — just /social/callback/:platform. OAuth providers
 *     redirect the user's browser here directly, so it can't require a
 *     Bearer header — CSRF is instead prevented by the signed `state`
 *     param minted in /social/connect/:platform below. Mount this BEFORE
 *     server.js's global app.use(authenticateToken).
 *   - protectedRouter — everything else. Mount this AFTER that line, same
 *     as every other authenticated route in server.js.
 */

const express = require('express');
const crypto = require('crypto');
const ADAPTERS = require('../social/adapters');
const tokenCrypto = require('../social/crypto');
const { getSocialClient } = require('../social/db');
const { getUsableAccount } = require('../social/accounts');
const socialQueue = require('../social/queue');

const STATE_MAX_AGE_MS = 15 * 60 * 1000; // OAuth round trip has 15 min to complete

function requireSocialClient(res) {
  const client = getSocialClient();
  if (!client) {
    res.status(503).json({ error: 'Social Supabase project not configured (SUPABASE_URL_SOCIAL / SUPABASE_KEY_SOCIAL in .env).' });
    return null;
  }
  return client;
}

function signState(payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'aegis-portal-super-secret-key-12345').update(b64).digest('hex');
  return `${b64}.${sig}`;
}

// This runs against whatever `state` an unauthenticated request throws at
// the public callback route below, so nothing here may throw — a
// malformed/adversarial state (wrong-length signature, garbage base64,
// non-JSON payload) must fail closed (return null → 400), not crash the
// request handler.
function verifyState(state) {
  try {
    const [b64, sig] = String(state || '').split('.');
    if (!b64 || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'aegis-portal-super-secret-key-12345').update(b64).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (!payload || typeof payload.ts !== 'number' || Date.now() - payload.ts > STATE_MAX_AGE_MS) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

// -------------------------------------------------------------
// Public router — OAuth callback only
// -------------------------------------------------------------
const publicRouter = express.Router();

publicRouter.get('/social/callback/:platform', async (req, res) => {
  const { platform } = req.params;
  const { code, error: oauthError, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';

  const adapter = ADAPTERS[platform];
  if (!adapter) return res.status(404).send(`No adapter registered for platform "${platform}".`);

  if (oauthError) {
    return res.redirect(`${frontendUrl}/?social_error=${encodeURIComponent(oauthError)}`);
  }

  const statePayload = verifyState(state);
  if (!statePayload || statePayload.platform !== platform) {
    return res.status(400).send('Invalid or expired OAuth state — restart the connect flow from Connect Accounts.');
  }

  try {
    const result = await adapter.connect.exchangeCode(code);
    const client = getSocialClient();
    if (!client) return res.status(503).send('Social Supabase project not configured.');

    const { error: insertError } = await client.from('social_accounts').insert({
      brand: statePayload.brand,
      platform,
      account_label: result.accountLabel,
      external_account_id: result.externalAccountId,
      access_token: tokenCrypto.encrypt(result.accessToken),
      refresh_token: result.refreshToken ? tokenCrypto.encrypt(result.refreshToken) : null,
      expires_at: result.expiresAt,
      status: 'active'
    });
    if (insertError) throw insertError;

    return res.redirect(`${frontendUrl}/?social_connected=${encodeURIComponent(platform)}`);
  } catch (err) {
    console.error(`[social] OAuth callback failed for ${platform}:`, err.message);
    return res.redirect(`${frontendUrl}/?social_error=${encodeURIComponent(err.message)}`);
  }
});

// -------------------------------------------------------------
// Protected router — everything else, mounted after authenticateToken
// -------------------------------------------------------------
const protectedRouter = express.Router();

protectedRouter.get('/social/accounts', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;
  const { data, error } = await client
    .from('social_accounts')
    .select('id, brand, platform, account_label, connected_at, expires_at, status')
    .order('connected_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ accounts: data });
});

protectedRouter.get('/social/connect/:platform', (req, res) => {
  const { platform } = req.params;
  const { brand } = req.query;
  if (!brand) return res.status(400).json({ error: 'brand query param is required, e.g. ?brand=infopace' });

  const adapter = ADAPTERS[platform];
  if (!adapter) return res.status(404).json({ error: `No adapter registered for platform "${platform}" yet.` });
  if (!adapter.isConfigured()) {
    return res.status(400).json({ error: `${platform} OAuth is not configured — set its client id/secret in backend/.env.` });
  }

  const state = signState({ platform, brand, ts: Date.now() });
  res.json({ url: adapter.connect.getAuthUrl(state) });
});

protectedRouter.post('/social/accounts/:id/disconnect', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;
  const { error } = await client.from('social_accounts').update({ status: 'revoked' }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

protectedRouter.post('/social/posts', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;
  const { brand, content, mediaUrls, targetPlatforms, targetAccountIds, scheduledAt } = req.body;

  if (!brand || !targetPlatforms || !targetPlatforms.length || !targetAccountIds || !targetAccountIds.length || !scheduledAt) {
    return res.status(400).json({ error: 'brand, targetPlatforms, targetAccountIds and scheduledAt are required.' });
  }

  const { data, error } = await client.from('scheduled_posts').insert({
    brand,
    content: content || '',
    media_urls: mediaUrls || [],
    target_platforms: targetPlatforms,
    target_account_ids: targetAccountIds,
    scheduled_at: scheduledAt,
    status: 'pending'
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Best-effort: the row is already durably saved either way, and
  // social/scheduler.js's reconciliation sweep will pick it up within 5
  // minutes if Redis is briefly unreachable right now.
  try {
    await socialQueue.enqueuePost(data);
  } catch (err) {
    console.error(`[social] Could not enqueue post ${data.id} immediately (will be picked up by the reconciliation sweep):`, err.message);
  }

  res.status(201).json({ post: data });
});

protectedRouter.get('/social/posts', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;
  let query = client.from('scheduled_posts').select('*').order('scheduled_at', { ascending: false });
  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.brand) query = query.eq('brand', req.query.brand);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ posts: data });
});

protectedRouter.delete('/social/posts/:id', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;

  const { data: existing, error: fetchError } = await client.from('scheduled_posts').select('*').eq('id', req.params.id).single();
  if (fetchError || !existing) return res.status(404).json({ error: 'Post not found.' });
  if (existing.status !== 'pending') return res.status(400).json({ error: `Cannot cancel a post with status "${existing.status}".` });

  await socialQueue.cancelPost(existing).catch(err => console.error(`[social] Could not cancel queued jobs for post ${existing.id}:`, err.message));

  const { error } = await client.from('scheduled_posts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Resolves social_accounts.id list matching optional brand/platform
// filters, for the mentions/inbox/analytics routes below (those tables
// only carry platform + social_account_id, not brand, directly).
async function resolveAccountIds(client, { brand, platform }) {
  if (!brand && !platform) return null; // no filter needed
  let query = client.from('social_accounts').select('id');
  if (brand) query = query.eq('brand', brand);
  if (platform) query = query.eq('platform', platform);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(r => r.id);
}

protectedRouter.get('/social/mentions', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;
  try {
    const accountIds = await resolveAccountIds(client, req.query);
    let query = client.from('mentions').select('*').order('captured_at', { ascending: false }).limit(200);
    if (accountIds) query = query.in('social_account_id', accountIds);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ mentions: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

protectedRouter.get('/social/inbox', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;
  try {
    const accountIds = await resolveAccountIds(client, req.query);
    let query = client.from('inbox_messages').select('*').order('received_at', { ascending: false }).limit(200);
    if (accountIds) query = query.in('social_account_id', accountIds);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ messages: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

protectedRouter.post('/social/inbox/:id/reply', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required.' });

  const { data: thread, error: fetchError } = await client.from('inbox_messages').select('*').eq('id', req.params.id).single();
  if (fetchError || !thread) return res.status(404).json({ error: 'Message not found.' });

  try {
    const usable = await getUsableAccount(thread.social_account_id);
    if (!usable) return res.status(404).json({ error: 'Connected account for this message no longer exists.' });
    const { account, adapter } = usable;
    if (typeof adapter.sendReply !== 'function') {
      return res.status(400).json({ error: `${account.platform} adapter does not support sending replies.` });
    }

    await adapter.sendReply(account, thread.external_thread_id, message);
    await client.from('inbox_messages').update({ status: 'replied' }).eq('id', req.params.id);
    await client.from('inbox_messages').insert({
      social_account_id: thread.social_account_id,
      platform: thread.platform,
      external_thread_id: thread.external_thread_id,
      external_message_id: `outbound-${Date.now()}`,
      sender: 'admin',
      message,
      direction: 'outbound',
      status: 'read'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

protectedRouter.get('/social/analytics', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;
  try {
    const { platform, metric, startDate, endDate, accountId } = req.query;
    let query = client.from('analytics_snapshots').select('*').order('captured_date', { ascending: true });
    if (platform) query = query.eq('platform', platform);
    if (metric) query = query.eq('metric', metric);
    if (accountId) query = query.eq('social_account_id', accountId);
    if (startDate) query = query.gte('captured_date', startDate);
    if (endDate) query = query.lte('captured_date', endDate);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ snapshots: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { publicRouter, protectedRouter };
