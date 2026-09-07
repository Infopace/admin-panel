import React, { useEffect, useState } from 'react';
import { RefreshCw, AtSign, MessageSquare, ExternalLink } from 'lucide-react';
import { SOCIAL_API_BASE, PLATFORM_LABELS, AVAILABLE_PLATFORMS } from './api';

// Unified "all queries and leads in one place" view — mentions (comments,
// reviews) and inbox_messages (DMs) merged server-side into one list by
// GET /social/interactions, so this page never branches on which table a
// row came from beyond the "MENTION"/"MESSAGE" badge. Mirrors the
// table-section/table-header/custom-table shell every other data table in
// this app already uses (see App.jsx's candidates table), not a new look.
const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'closed', label: 'Closed' }
];
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
];
const STATUS_COLOR = { open: 'var(--accent-warning)', under_review: 'var(--accent-primary)', closed: 'var(--accent-success)' };
const PRIORITY_COLOR = { high: 'var(--accent-danger)', medium: 'var(--accent-warning)', low: 'var(--text-secondary)' };

function Inbox({ authFetch }) {
  const [interactions, setInteractions] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ platform: '', type: '', priority: '', status: '', assignedTo: '' });
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await authFetch(`${SOCIAL_API_BASE}/interactions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load interactions.');
      setInteractions(data.interactions || []);
    } catch (err) {
      setError(err.message);
      setInteractions([]);
    }
  };

  useEffect(() => {
    authFetch(`${SOCIAL_API_BASE}/team`)
      .then(res => res.json())
      .then(data => setUsers(data.users || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (item, body) => {
    setSavingId(item.id);
    try {
      const res = await authFetch(`${SOCIAL_API_BASE}/interactions/${item.source}/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update this interaction.');
      setInteractions(prev => prev.map(i => (i.id === item.id && i.source === item.source ? { ...i, ...body } : i)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="header-container">
        <div className="title-area">
          <h1>Inbox</h1>
          <p>Every comment, review, and message from every connected account, in one place.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }}>{error}</p>}

      <div className="table-section">
        <div className="table-header">
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <select className="tool-select" value={filters.platform} onChange={(e) => setFilter('platform', e.target.value)}>
              <option value="">All platforms</option>
              {AVAILABLE_PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
            <select className="tool-select" value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
              <option value="">All types</option>
              <option value="mention">Mentions</option>
              <option value="message">Messages</option>
            </select>
            <select className="tool-select" value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)}>
              <option value="">All priorities</option>
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="tool-select" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="tool-select" value={filters.assignedTo} onChange={(e) => setFilter('assignedTo', e.target.value)}>
              <option value="">Anyone assigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {interactions === null ? 'Loading…' : `${interactions.length} interaction${interactions.length === 1 ? '' : 's'}`}
          </div>
        </div>

        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Interaction</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {interactions === null ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : interactions.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Nothing here yet — connected accounts are synced every 10 minutes.</td></tr>
              ) : (
                interactions.map(item => (
                  <tr key={`${item.source}-${item.id}`}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      {new Date(item.date).toLocaleDateString()}<br />{new Date(item.date).toLocaleTimeString()}
                    </td>
                    <td style={{ whiteSpace: 'normal', minWidth: 320 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                        {item.author || 'Unknown'}
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          {PLATFORM_LABELS[item.platform] || item.platform}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', margin: '0.2rem 0' }}>{item.text}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {item.source === 'mention' ? <AtSign size={12} /> : <MessageSquare size={12} />}
                        {item.source === 'mention' ? 'MENTION' : 'MESSAGE'}
                        {item.brand ? ` · ${item.brand}` : ''}
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            <ExternalLink size={12} /> View
                          </a>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        className="tool-select"
                        value={item.priority}
                        disabled={savingId === item.id}
                        style={{ color: PRIORITY_COLOR[item.priority], fontWeight: 700 }}
                        onChange={(e) => patch(item, { priority: e.target.value })}
                      >
                        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        className="tool-select"
                        value={item.assignedTo || ''}
                        disabled={savingId === item.id}
                        onChange={(e) => patch(item, { assignedTo: e.target.value })}
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        className="tool-select"
                        value={item.interactionStatus}
                        disabled={savingId === item.id}
                        style={{ color: STATUS_COLOR[item.interactionStatus], fontWeight: 700 }}
                        onChange={(e) => patch(item, { interactionStatus: e.target.value })}
                      >
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Inbox;
