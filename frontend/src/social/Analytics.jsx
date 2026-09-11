import React, { useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, ThumbsUp, MessageCircle, Share2 } from 'lucide-react';
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

function formatPostDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function Analytics({ authFetch }) {
  const [summary, setSummary] = useState(null);
  const [brand, setBrand] = useState('infopace');
  const [windowDays, setWindowDays] = useState(30);
  const [error, setError] = useState(null);
  // accountId -> { posts } | { loading: true } | { error }, filled in lazily
  // when a row is expanded — /social/analytics/summary's aggregate numbers
  // don't include per-post likes/comments, so this is a separate fetch.
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [postsByAccount, setPostsByAccount] = useState({});

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

  const togglePosts = async (accountId) => {
    if (expandedAccountId === accountId) {
      setExpandedAccountId(null);
      return;
    }
    setExpandedAccountId(accountId);
    if (postsByAccount[accountId]) return; // already fetched — expand from cache

    setPostsByAccount(prev => ({ ...prev, [accountId]: { loading: true } }));
    try {
      const res = await authFetch(`${SOCIAL_API_BASE}/accounts/${accountId}/posts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load posts.');
      setPostsByAccount(prev => ({ ...prev, [accountId]: { posts: data.posts || [] } }));
    } catch (err) {
      setPostsByAccount(prev => ({ ...prev, [accountId]: { error: err.message } }));
    }
  };

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
                <th></th>
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
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No connected accounts for this brand yet — connect one in Connect Accounts.</td></tr>
              ) : (
                summary.map(row => {
                  const expanded = expandedAccountId === row.accountId;
                  const postsState = postsByAccount[row.accountId];
                  return (
                    <React.Fragment key={row.accountId}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => togglePosts(row.accountId)}>
                        <td style={{ width: 24, color: 'var(--text-secondary)' }}>
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>
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
                      {expanded && (
                        <tr>
                          <td></td>
                          <td colSpan="6" style={{ padding: '0.75rem 1rem 1.25rem', background: 'var(--bg-secondary)' }}>
                            {!postsState || postsState.loading ? (
                              <span style={{ color: 'var(--text-muted)' }}>Loading recent posts…</span>
                            ) : postsState.error ? (
                              <span style={{ color: 'var(--accent-danger)' }}>{postsState.error}</span>
                            ) : postsState.posts.length === 0 ? (
                              <span style={{ color: 'var(--text-muted)' }}>No posts found.</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {postsState.posts.map(post => (
                                  <div key={post.externalPostId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.6rem' }}>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{
                                        overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                                      }}>
                                        {post.permalinkUrl ? (
                                          <a href={post.permalinkUrl} target="_blank" rel="noreferrer">{post.message || post.permalinkUrl}</a>
                                        ) : (post.message || '(no text)')}
                                      </div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatPostDate(post.createdTime)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', flexShrink: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ThumbsUp size={14} /> {post.likes}</span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MessageCircle size={14} /> {post.comments}</span>
                                      {post.shares !== null && post.shares !== undefined && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Share2 size={14} /> {post.shares}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
