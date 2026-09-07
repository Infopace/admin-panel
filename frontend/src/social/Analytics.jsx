import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SOCIAL_API_BASE, PLATFORM_LABELS } from './api';

// Zoho's "Brand Health" panel, adapted to this app's table shell —
// one row per connected account: total followers, followers gained in
// the window, posts published in the window, reach, engagement.
// social/pollers.js's sweepAnalytics() (backend) is what actually keeps
// the underlying numbers current, every 6 hours; this page just reads
// GET /social/analytics/summary and renders it.
function formatMetric(value) {
  if (value === null || value === undefined) return 'NA';
  return value.toLocaleString();
}

function Analytics({ authFetch }) {
  const [summary, setSummary] = useState(null);
  const [brand, setBrand] = useState('infopace');
  const [windowDays, setWindowDays] = useState(30);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (brand) params.set('brand', brand);
      const res = await authFetch(`${SOCIAL_API_BASE}/analytics/summary?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load analytics.');
      setSummary(data.summary || []);
      setWindowDays(data.windowDays || 30);
    } catch (err) {
      setError(err.message);
      setSummary([]);
    }
  };

  useEffect(() => { load(); }, [brand]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="header-container">
        <div className="title-area">
          <h1>Analytics</h1>
          <p>Channel overview for the past {windowDays} days.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }}>{error}</p>}

      <div className="form-group" style={{ maxWidth: 320, marginBottom: '1.5rem' }}>
        <label>Brand</label>
        <input type="text" className="form-control" value={brand} onChange={(e) => setBrand(e.target.value)} />
      </div>

      <div className="table-section">
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Total Followers</th>
                <th>New Followers</th>
                <th>No. of Posts</th>
                <th>Reach</th>
                <th>Engagement</th>
              </tr>
            </thead>
            <tbody>
              {summary === null ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No connected accounts for this brand yet — connect one in Connect Accounts.</td></tr>
              ) : (
                summary.map(row => (
                  <tr key={row.accountId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.accountLabel || row.accountId}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{PLATFORM_LABELS[row.platform] || row.platform}</div>
                    </td>
                    <td>{formatMetric(row.followers)}</td>
                    <td style={{ color: row.newFollowers > 0 ? 'var(--accent-success)' : row.newFollowers < 0 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
                      {row.newFollowers === null ? 'NA' : (row.newFollowers > 0 ? `+${row.newFollowers}` : row.newFollowers)}
                    </td>
                    <td>{row.posts}</td>
                    <td>{formatMetric(row.reach)}</td>
                    <td>{formatMetric(row.engagement)}</td>
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

export default Analytics;
