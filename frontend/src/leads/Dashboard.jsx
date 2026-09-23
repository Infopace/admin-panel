import React, { useEffect, useState } from 'react';
import { RefreshCw, Target, TrendingUp, Activity, CheckCircle2, XCircle, Percent, Mail, Phone, Users } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Cell, LabelList, AreaChart, Area
} from 'recharts';
import { LEADS_API_BASE, STATUS_OPTIONS, STATUS_COLOR } from './api';

// Leads' own "30-second glance," redesigned as a CRM/sales dashboard
// (HubSpot/Salesforce/Zoho-style): a pipeline funnel, a leads-over-time
// trend, a lead-source ranking, and a per-rep leaderboard, on top of the
// KPI strip and recent-activity table every other dashboard in this app
// already has. /leads/summary gives exact pipeline counts (real Supabase
// count queries); the trend/source/rep breakdowns below are computed
// client-side from the most recent leads (capped at 500, same cap the
// Leads list itself uses), so they're labelled "most recent" rather than
// claimed as an all-time total.
const LEADS_SAMPLE_LIMIT = 500;
const TREND_DAYS = 14;

// Ordinal ramp (one hue, monotone lightness — dataviz skill's rule for an
// ordered sequence like funnel stages) — validated with
// scripts/validate_palette.js "<ramp>" --mode light --ordinal (all checks
// pass: monotone L, >=0.06 adjacent gaps, light end 2.06:1 on surface).
// Literal hex, not var(--accent-primary) — same reason CHART_COLORS in
// App.jsx hardcodes hex: some browsers don't resolve var() inside SVG
// presentation attributes.
const FUNNEL_COLORS = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
const CHART_TOOLTIP_STYLE = { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12, boxShadow: 'var(--shadow-md)' };

// Real campaign names (Meta Lead Ads form/ad names) run 40-60+ characters —
// recharts' default category-axis tick wraps long labels onto multiple
// lines instead of clipping, and at this chart's row height that wrapped
// text overlaps the row above/below it. A single-line, ellipsis-truncated
// tick avoids the wrap entirely; the bar's own hover tooltip (labelled by
// the untruncated category value) is where the full name still shows.
function TruncatedYAxisTick({ x, y, payload, maxChars = 24 }) {
  const raw = String(payload.value || '');
  const text = raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="var(--text-secondary)">
      {text}
      {raw.length > maxChars && <title>{raw}</title>}
    </text>
  );
}

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

function KpiTile({ icon: Icon, color, label, value, sub }) {
  return (
    <div className="kpi-card">
      <div className="kpi-card-icon" style={{ background: color }}><Icon size={17} /></div>
      <div className="kpi-card-label">{label}</div>
      <div className="kpi-card-value">{value}</div>
      {sub && <div className="kpi-card-footer"><span className="kpi-card-sub">{sub}</span></div>}
    </div>
  );
}

// "YYYY-MM-DD" in local time, for grouping/bucketing by calendar day.
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatShortDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Dashboard({ authFetch, setCurrentView }) {
  const [summary, setSummary] = useState(null);
  const [sampleLeads, setSampleLeads] = useState(null);
  const [total, setTotal] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const [summaryRes, leadsRes, usersRes] = await Promise.all([
        authFetch(`${LEADS_API_BASE}/summary`),
        authFetch(`${LEADS_API_BASE}?limit=${LEADS_SAMPLE_LIMIT}`),
        authFetch(`${LEADS_API_BASE}/team`)
      ]);
      const summaryData = await summaryRes.json();
      if (!summaryRes.ok) throw new Error(summaryData.error || 'Could not load leads summary.');
      setSummary(summaryData);

      const leadsData = await leadsRes.json();
      if (!leadsRes.ok) throw new Error(leadsData.error || 'Could not load leads.');
      setSampleLeads(leadsData.leads || []);
      setTotal(leadsData.total ?? (leadsData.leads || []).length);

      const usersData = await usersRes.json();
      if (usersRes.ok) setUsers(usersData.users || []);
    } catch (err) {
      setError(err.message);
      setSummary({ total: 0, newToday: 0, byStatus: {}, conversionRate: null });
      setSampleLeads([]);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = summary === null;
  const truncated = total !== null && sampleLeads !== null && total > sampleLeads.length;

  // ---- Pipeline funnel (exact counts from the summary endpoint) ----
  const FUNNEL_STAGES = STATUS_OPTIONS.filter(o => o.value !== 'lost');
  const funnelTopValue = summary ? (summary.byStatus[FUNNEL_STAGES[0].value] || 0) : 0;
  const funnelData = FUNNEL_STAGES.map((o, i) => {
    const value = summary ? (summary.byStatus[o.value] || 0) : 0;
    return { name: o.label, value, fill: FUNNEL_COLORS[i], pct: funnelTopValue > 0 ? Math.round((value / funnelTopValue) * 100) : 0 };
  });
  const lostCount = summary ? (summary.byStatus.lost || 0) : 0;
  const lostPct = summary && summary.total > 0 ? Math.round((lostCount / summary.total) * 100) : 0;

  // ---- Lead source ranking (client-side, from the sample) ----
  const campaignCounts = {};
  (sampleLeads || []).forEach(l => {
    const key = l.campaign_name || 'Unattributed';
    campaignCounts[key] = (campaignCounts[key] || 0) + 1;
  });
  const topCampaigns = Object.entries(campaignCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ---- Leads captured per day, last 14 days (client-side, from the sample) ----
  const trendCounts = {};
  (sampleLeads || []).forEach(l => {
    if (!l.created_time) return;
    const key = dayKey(l.created_time);
    trendCounts[key] = (trendCounts[key] || 0) + 1;
  });
  const trendData = Array.from({ length: TREND_DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (TREND_DAYS - 1 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, date: formatShortDate(key), count: trendCounts[key] || 0 };
  });

  // ---- Rep leaderboard (client-side, from the sample) ----
  const userEmailById = {};
  users.forEach(u => { userEmailById[u.id] = u.email; });
  const repStats = {};
  (sampleLeads || []).forEach(l => {
    const key = l.assigned_to || '__unassigned';
    if (!repStats[key]) repStats[key] = { id: key, name: key === '__unassigned' ? 'Unassigned' : (userEmailById[key] || key), leads: 0, won: 0 };
    repStats[key].leads += 1;
    if (l.status === 'won') repStats[key].won += 1;
  });
  const repRows = Object.values(repStats).sort((a, b) => b.leads - a.leads);

  const recentLeads = (sampleLeads || []).slice(0, 8);

  return (
    <div>
      <div className="header-container">
        <div className="title-area">
          <h1>Leads Dashboard</h1>
          <p>Pipeline health across every Meta Lead Ads campaign, at a glance.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }}>{error}</p>}

      <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
        <KpiTile icon={Target} color="#2a78d6" label="Total Leads" value={loading ? '—' : fmt(summary.total)} />
        <KpiTile icon={TrendingUp} color="#1baf7a" label="New Today" value={loading ? '—' : fmt(summary.newToday)} />
        <KpiTile
          icon={Activity}
          color="#eda100"
          label="In Progress"
          value={loading ? '—' : fmt((summary.byStatus.contacted || 0) + (summary.byStatus.qualified || 0) + (summary.byStatus.proposal || 0))}
        />
        <KpiTile icon={CheckCircle2} color="#0ca30c" label="Won" value={loading ? '—' : fmt(summary.byStatus.won || 0)} />
        <KpiTile icon={XCircle} color="#d03b3b" label="Lost" value={loading ? '—' : fmt(summary.byStatus.lost || 0)} />
        <KpiTile
          icon={Percent}
          color="#4a3aa7"
          label="Conversion Rate"
          value={loading ? '—' : (summary.conversionRate === null ? '—' : `${summary.conversionRate}%`)}
          sub="won / (won + lost)"
        />
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Sales Funnel</h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>exact pipeline counts</span>
        </div>
        {loading ? (
          <div className="trend-chart-empty">Loading…</div>
        ) : (
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 420px', minWidth: 320 }}>
              <ResponsiveContainer width="100%" height={Math.max(funnelData.length * 46, 160)}>
                <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <RTooltip
                    formatter={(value, name, props) => [`${value} leads (${props.payload.pct}% of ${FUNNEL_STAGES[0].label})`, props.payload.name]}
                    contentStyle={CHART_TOOLTIP_STYLE}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={26}>
                    {funnelData.map(d => <Cell key={d.name} fill={d.fill} />)}
                    <LabelList dataKey="value" position="right" style={{ fontSize: 12, fontWeight: 700, fill: 'var(--text-primary)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: '0 0 180px', textAlign: 'center', padding: '1rem', borderRadius: 'var(--radius-md)', background: 'rgba(208,59,59,0.06)', border: '1px solid rgba(208,59,59,0.2)' }}>
              <XCircle size={20} style={{ color: 'var(--accent-danger)', marginBottom: '0.4rem' }} />
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-danger)' }}>{fmt(lostCount)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Lost</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{lostPct}% of all leads</div>
            </div>
          </div>
        )}
      </div>

      <div className="split-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Leads Over Time</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>last {TREND_DAYS} days{truncated ? `, latest ${sampleLeads.length}` : ''}</span>
          </div>
          {sampleLeads === null ? (
            <div className="trend-chart-empty">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#2a78d6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="date" interval={2} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border-color)' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} />
                <RTooltip formatter={(value) => [`${value} lead${value === 1 ? '' : 's'}`, 'Captured']} contentStyle={CHART_TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="count" stroke="#2a78d6" strokeWidth={2} fill="url(#leadsTrendFill)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Lead Sources</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{truncated ? `latest ${sampleLeads.length}` : 'all leads'}</span>
          </div>
          {sampleLeads === null ? (
            <div className="trend-chart-empty">Loading…</div>
          ) : topCampaigns.length === 0 ? (
            <div className="trend-chart-empty">No campaign data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(topCampaigns.length * 38, 140)}>
              <BarChart data={topCampaigns} layout="vertical" margin={{ top: 4, right: 28, left: 0, bottom: 4 }}>
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="name" width={150} tick={<TruncatedYAxisTick maxChars={22} />} axisLine={false} tickLine={false} interval={0} />
                <RTooltip formatter={(value) => [`${value} lead${value === 1 ? '' : 's'}`, 'Captured']} contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#2a78d6" radius={[0, 4, 4, 0]} barSize={16}>
                  <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2><Users size={16} style={{ marginRight: '0.4rem', verticalAlign: -3 }} />Rep Performance</h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{truncated ? `latest ${sampleLeads.length} leads` : 'all leads'}</span>
        </div>
        {sampleLeads === null ? (
          <div className="trend-chart-empty">Loading…</div>
        ) : repRows.length === 0 ? (
          <div className="trend-chart-empty">No leads to attribute yet.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table custom-table-compact">
              <thead>
                <tr>
                  <th>Assignee</th>
                  <th style={{ textAlign: 'right' }}>Leads</th>
                  <th style={{ textAlign: 'right' }}>Won</th>
                  <th style={{ textAlign: 'right' }}>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {repRows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ textAlign: 'right' }}>{r.leads}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent-success)', fontWeight: 700 }}>{r.won}</td>
                    <td style={{ textAlign: 'right' }}>{r.leads > 0 ? `${Math.round((r.won / r.leads) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Recent Leads</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setCurrentView('leads')}>Open All Leads →</span>
        </div>
        {sampleLeads === null ? (
          <div className="trend-chart-empty">Loading…</div>
        ) : recentLeads.length === 0 ? (
          <div className="trend-chart-empty">No leads captured yet.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table custom-table-compact">
              <thead>
                <tr>
                  <th>Captured</th>
                  <th>Lead</th>
                  <th>Campaign</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map(lead => (
                  <tr key={lead.id}>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {lead.created_time ? new Date(lead.created_time).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{lead.full_name || 'Unnamed lead'}</div>
                      <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {lead.email && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Mail size={11} /> {lead.email}</span>}
                        {lead.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Phone size={11} /> {lead.phone}</span>}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{lead.campaign_name || '—'}</td>
                    <td>
                      <span className="tier-pill-table" style={{ background: `${STATUS_COLOR[lead.status]}22`, color: STATUS_COLOR[lead.status] }}>
                        {(STATUS_OPTIONS.find(o => o.value === lead.status) || {}).label || lead.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
