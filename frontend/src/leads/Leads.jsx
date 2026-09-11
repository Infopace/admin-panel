import React, { useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Target, Mail, Phone, Megaphone } from 'lucide-react';
import { LEADS_API_BASE, STATUS_OPTIONS, STATUS_COLOR } from './api';

// Meta Lead Ads capture — backend/leads/poller.js pulls new Instant Form
// leads every 5 min into the `leads` table; this page reads/updates them.
// Same table-section/table-header/custom-table shell as social/Inbox.jsx
// (and every other data table in this app), not a new look, plus a
// summary strip and an expandable row for the full form answers.
function Leads({ authFetch }) {
  const [leads, setLeads] = useState(null);
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ status: '', campaignId: '', assignedTo: '', search: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const [leadsRes, summaryRes] = await Promise.all([
        authFetch(`${LEADS_API_BASE}?${params.toString()}`),
        authFetch(`${LEADS_API_BASE}/summary`)
      ]);
      const leadsData = await leadsRes.json();
      if (!leadsRes.ok) throw new Error(leadsData.error || 'Could not load leads.');
      setLeads(leadsData.leads || []);

      const summaryData = await summaryRes.json();
      if (summaryRes.ok) setSummary(summaryData);
    } catch (err) {
      setError(err.message);
      setLeads([]);
    }
  };

  useEffect(() => {
    authFetch(`${LEADS_API_BASE}/campaigns`).then(res => res.json()).then(data => setCampaigns(data.campaigns || [])).catch(() => {});
    authFetch(`${LEADS_API_BASE}/team`).then(res => res.json()).then(data => setUsers(data.users || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const patch = async (lead, body) => {
    setSavingId(lead.id);
    try {
      const res = await authFetch(`${LEADS_API_BASE}/${lead.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update this lead.');
      setLeads(prev => prev.map(l => (l.id === lead.id ? data.lead : l)));
      if (body.status !== undefined) load(); // status moved — refresh the pipeline counts too
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const toggleExpand = (lead) => {
    if (expandedId === lead.id) {
      setExpandedId(null);
    } else {
      setExpandedId(lead.id);
      setNotesDraft(lead.notes || '');
    }
  };

  return (
    <div>
      <div className="header-container">
        <div className="title-area">
          <h1>Leads</h1>
          <p>Instant Form leads captured from Meta (Facebook/Instagram) campaigns, synced every 5 minutes.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }}>{error}</p>}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.8rem', marginBottom: '1.2rem' }}>
          <div className="panel" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>New Today</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{summary.newToday}</div>
          </div>
          <div className="panel" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Total Leads</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{summary.total}</div>
          </div>
          <div className="panel" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Won</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: STATUS_COLOR.won }}>{summary.byStatus.won || 0}</div>
          </div>
          <div className="panel" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Conversion Rate</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{summary.conversionRate === null ? '—' : `${summary.conversionRate}%`}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Won / (Won + Lost)</div>
          </div>
        </div>
      )}

      <div className="table-section">
        <div className="table-header">
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-control"
              style={{ maxWidth: 220 }}
              placeholder="Search name/email/phone"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
            <select className="tool-select" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="tool-select" value={filters.campaignId} onChange={(e) => setFilter('campaignId', e.target.value)}>
              <option value="">All campaigns</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
            </select>
            <select className="tool-select" value={filters.assignedTo} onChange={(e) => setFilter('assignedTo', e.target.value)}>
              <option value="">Anyone assigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {leads === null ? 'Loading…' : `${leads.length} lead${leads.length === 1 ? '' : 's'}`}
          </div>
        </div>

        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Captured</th>
                <th>Lead</th>
                <th>Campaign / Ad</th>
                <th>Status</th>
                <th>Assignee</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads === null ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No leads yet — connected Facebook Page(s) are synced every 5 minutes.</td></tr>
              ) : (
                leads.map(lead => (
                  <React.Fragment key={lead.id}>
                    <tr>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {lead.created_time ? new Date(lead.created_time).toLocaleDateString() : '—'}<br />
                        {lead.created_time ? new Date(lead.created_time).toLocaleTimeString() : ''}
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <div style={{ fontWeight: 600 }}>{lead.full_name || 'Unnamed lead'}</div>
                        {lead.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            <Mail size={12} /> {lead.email}
                          </div>
                        )}
                        {lead.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            <Phone size={12} /> {lead.phone}
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 200, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Megaphone size={12} /> {lead.campaign_name || '—'}</div>
                        {lead.ad_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lead.ad_name}</div>}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{lead.form_name}</div>
                      </td>
                      <td>
                        <select
                          className="tool-select"
                          value={lead.status}
                          disabled={savingId === lead.id}
                          style={{ color: STATUS_COLOR[lead.status], fontWeight: 700 }}
                          onChange={(e) => patch(lead, { status: e.target.value })}
                        >
                          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="tool-select"
                          value={lead.assigned_to || ''}
                          disabled={savingId === lead.id}
                          onChange={(e) => patch(lead, { assignedTo: e.target.value })}
                        >
                          <option value="">Unassigned</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleExpand(lead)}>
                          {expandedId === lead.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Details
                        </button>
                      </td>
                    </tr>
                    {expandedId === lead.id && (
                      <tr>
                        <td colSpan="6" style={{ background: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', padding: '0.8rem 0.4rem' }}>
                            <div style={{ flex: '1 1 280px' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Target size={12} /> Form Answers
                              </div>
                              {(lead.field_data || []).length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No additional answers captured.</div>
                              ) : (
                                <table style={{ width: '100%', fontSize: '0.82rem' }}>
                                  <tbody>
                                    {lead.field_data.map((f, i) => (
                                      <tr key={i}>
                                        <td style={{ color: 'var(--text-secondary)', paddingRight: '1rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{f.name}</td>
                                        <td>{(f.values || []).join(', ')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                            <div style={{ flex: '1 1 280px' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Notes</div>
                              <textarea
                                className="form-control"
                                rows={4}
                                value={notesDraft}
                                onChange={(e) => setNotesDraft(e.target.value)}
                                placeholder="Follow-up notes for this lead…"
                              />
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ marginTop: '0.5rem' }}
                                disabled={savingId === lead.id}
                                onClick={() => patch(lead, { notes: notesDraft })}
                              >
                                Save Notes
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Leads;
