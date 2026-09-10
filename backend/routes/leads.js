/**
 * Leads routes — all protected (mounted after server.js's global
 * authenticateToken, same as routes/social.js's protectedRouter; there's
 * no public/unauthenticated endpoint here since, unlike OAuth callbacks,
 * nothing external ever calls into this file directly — backend/leads/poller.js
 * is what talks to Meta).
 */

const express = require('express');
const { getSocialClient } = require('../social/db');
const { listUsers } = require('../lib/users');

const router = express.Router();

const STATUS_VALUES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

function requireSocialClient(res) {
  const client = getSocialClient();
  if (!client) {
    res.status(503).json({ error: 'Social Supabase project not configured (SUPABASE_URL_SOCIAL / SUPABASE_KEY_SOCIAL in .env).' });
    return null;
  }
  return client;
}

router.get('/leads', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;

  try {
    const { status, assignedTo, campaignId, search, startDate, endDate, limit, offset } = req.query;
    let query = client.from('leads').select('*', { count: 'exact' }).order('created_time', { ascending: false });

    if (status) query = query.eq('status', status);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);
    if (campaignId) query = query.eq('campaign_id', campaignId);
    if (startDate) query = query.gte('created_time', startDate);
    if (endDate) query = query.lte('created_time', endDate);
    if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

    const pageLimit = Math.min(Number(limit) || 100, 500);
    const pageOffset = Number(offset) || 0;
    query = query.range(pageOffset, pageOffset + pageLimit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ leads: data, total: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Distinct campaigns, for the filter dropdown — leads is the only table
// that knows about campaigns (scheduled_posts/mentions don't), so this
// reads straight off it rather than a separate campaigns table.
router.get('/leads/campaigns', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;

  const { data, error } = await client.from('leads').select('campaign_id, campaign_name').not('campaign_id', 'is', null);
  if (error) return res.status(500).json({ error: error.message });

  const seen = new Map();
  for (const row of data || []) seen.set(row.campaign_id, row.campaign_name);
  res.json({ campaigns: Array.from(seen, ([id, name]) => ({ id, name })) });
});

// Status-pipeline counts + a today/conversion headline — the KPI strip
// at the top of the Leads page. One query per status is simpler and
// plenty fast at this table's size rather than a single grouped query
// via Supabase's more awkward .group() support.
router.get('/leads/summary', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalResult, todayResult, ...statusResults] = await Promise.all([
      client.from('leads').select('id', { count: 'exact', head: true }),
      client.from('leads').select('id', { count: 'exact', head: true }).gte('captured_at', todayStart.toISOString()),
      ...STATUS_VALUES.map(status => client.from('leads').select('id', { count: 'exact', head: true }).eq('status', status))
    ]);

    const byStatus = {};
    STATUS_VALUES.forEach((status, i) => { byStatus[status] = statusResults[i].count || 0; });

    const total = totalResult.count || 0;
    const won = byStatus.won || 0;
    const lost = byStatus.lost || 0;
    const decided = won + lost;

    res.json({
      total,
      newToday: todayResult.count || 0,
      byStatus,
      conversionRate: decided > 0 ? Math.round((won / decided) * 1000) / 10 : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/leads/:id', async (req, res) => {
  const client = requireSocialClient(res);
  if (!client) return;

  const { status, assignedTo, notes } = req.body;
  if (status !== undefined && !STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(', ')}` });
  }

  const update = {};
  if (status !== undefined) update.status = status;
  if (assignedTo !== undefined) update.assigned_to = assignedTo || null;
  if (notes !== undefined) update.notes = notes;
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nothing to update — pass status, assignedTo and/or notes.' });

  const { data, error } = await client.from('leads').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Lead not found.' });
  res.json({ lead: data });
});

// Reuses the same admin-accounts roster as the Inbox's assignee dropdown
// (routes/social.js's GET /social/team) — this repo's own login users,
// not a separate team table.
router.get('/leads/team', (req, res) => {
  res.json({ users: listUsers() });
});

module.exports = router;
