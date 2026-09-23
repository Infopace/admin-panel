import React, { useEffect, useState } from 'react';
import { RefreshCw, Target, TrendingUp, CheckCircle2, Megaphone, Mail, Phone } from 'lucide-react';
import { LEADS_API_BASE, STATUS_OPTIONS, STATUS_COLOR } from './api';

// Leads' own "30-second glance" — same role Social's Dashboard and the
// assessment-tool Overview play elsewhere in this app. /leads/summary
// gives exact pipeline counts (real Supabase count queries); the campaign
// breakdown below is computed client-side from the most recent leads
// (capped at 500, same cap the Leads list itself uses), so it's labelled
// "most recent" rather than claimed as an all-time total.
const LEADS_SAMPLE_LIMIT = 500;

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

function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 40px', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-surface-hover)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: color }} />
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: 700, textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  );
}

function Dashboard({ authFetch, setCurrentView }) {
  const [summary, setSummary] = useState(null);
  const [sampleLeads, setSampleLeads] = useState(null);
  const [total, setTotal] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const [summaryRes, leadsRes] = await Promise.all([
        authFetch(`${LEADS_API_BASE}/summary`),
        authFetch(`${LEADS_API_BASE}?limit=${LEADS_SAMPLE_LIMIT}`)
      ]);
      const summaryData = await summaryRes.json();
      if (!summaryRes.ok) throw new Error(summaryData.error || 'Could not load leads summary.');
      setSummary(summaryData);

      const leadsData = await leadsRes.json();
      if (!leadsRes.ok) throw new Error(leadsData.error || 'Could not load leads.');
      setSampleLeads(leadsData.leads || []);
      setTotal(leadsData.total ?? (leadsData.leads || []).length);
    } catch (err) {
      setError(err.message);
      setSummary({ total: 0, newToday: 0, byStatus: {}, conversionRate: null });
      setSampleLeads([]);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = summary === null;

  const campaignCounts = {};
  (sampleLeads || []).forEach(l => {
    const key = l.campaign_name || 'Unattributed';
    campaignCounts[key] = (campaignCounts[key] || 0) + 1;
  });
  const topCampaigns = Object.entries(campaignCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCampaign = Math.max(1, ...topCampaigns.map(([, c]) => c));
  const truncated = total !== null && sampleLeads !== null && total > sampleLeads.length;

  const maxStatus = Math.max(1, ...STATUS_OPTIONS.map(o => (summary && summary.byStatus[o.value]) || 0));
  const recentLeads = (sampleLeads || []).slice(0, 6);

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
        <KpiTile icon={TrendingUp} color="#0d8f73" label="New Today" value={loading ? '—' : fmt(summary.newToday)} />
        <KpiTile icon={CheckCircle2} color="#0ca30c" label="Won" value={loading ? '—' : fmt(summary.byStatus.won || 0)} />
        <KpiTile
          icon={Megaphone}
          color="#b8690a"
          label="Conversion Rate"
          value={loading ? '—' : (summary.conversionRate === null ? '—' : `${summary.conversionRate}%`)}
          sub="won / (won + lost)"
        />
      </div>

      <div className="split-grid">
        <div className="panel">
          <div className="panel-header"><h2>Pipeline by Stage</h2></div>
          {loading ? (
            <div className="trend-chart-empty">Loading…</div>
          ) : (
            STATUS_OPTIONS.map(o => (
              <BarRow
                key={o.value}
                label={o.label}
                value={summary.byStatus[o.value] || 0}
                max={maxStatus}
                color={STATUS_COLOR[o.value]}
              />
            ))
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Top Campaigns</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {truncated ? `among latest ${sampleLeads.length} leads` : 'all leads'}
            </span>
          </div>
          {sampleLeads === null ? (
            <div className="trend-chart-empty">Loading…</div>
          ) : topCampaigns.length === 0 ? (
            <div className="trend-chart-empty">No campaign data yet.</div>
          ) : (
            topCampaigns.map(([name, count]) => (
              <BarRow key={name} label={name} value={count} max={maxCampaign} color="var(--accent-primary)" />
            ))
          )}
        </div>
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
