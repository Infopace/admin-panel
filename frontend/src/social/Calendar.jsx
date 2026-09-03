import React, { useEffect, useState } from 'react';
import { RefreshCw, X, Calendar as CalendarIcon } from 'lucide-react';
import { SOCIAL_API_BASE, PLATFORM_LABELS } from './api';

// List view, not a grid calendar — this repo has no calendar/date-grid
// library installed (just recharts, for the analytics charts elsewhere),
// and the build spec explicitly allows "calendar/list view" for this
// component. Grouped by scheduled date, newest first, same ordering
// convention as every other feed in this app (mentions, activity, etc).
const STATUS_STYLE = {
  pending: { color: 'var(--text-secondary)', label: 'Pending' },
  publishing: { color: 'var(--accent-warning)', label: 'Publishing' },
  published: { color: 'var(--accent-success)', label: 'Published' },
  failed: { color: 'var(--accent-danger)', label: 'Failed' }
};

function groupByDate(posts) {
  const groups = {};
  posts.forEach(p => {
    const key = new Date(p.scheduled_at).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    (groups[key] = groups[key] || []).push(p);
  });
  return groups;
}

function Calendar({ authFetch }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const res = await authFetch(`${SOCIAL_API_BASE}/posts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load scheduled posts.');
      setPosts((data.posts || []).sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)));
    } catch (err) {
      setError(err.message);
      setPosts([]);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async (id) => {
    if (!confirm('Cancel this pending post?')) return;
    try {
      const res = await authFetch(`${SOCIAL_API_BASE}/posts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not cancel post.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const groups = posts ? groupByDate(posts) : {};

  return (
    <div>
      <div className="header-container">
        <div className="title-area">
          <h1>Calendar</h1>
          <p>Every scheduled, publishing, published, and failed post, newest first.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }}>{error}</p>}

      {posts === null ? (
        <div className="trend-chart-empty">Loading scheduled posts...</div>
      ) : posts.length === 0 ? (
        <div className="trend-chart-empty">No posts scheduled yet — write one in Compose.</div>
      ) : (
        Object.entries(groups).map(([date, datePosts]) => (
          <div className="panel" key={date} style={{ marginBottom: '1.25rem' }}>
            <div className="panel-header">
              <h2><CalendarIcon size={16} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />{date}</h2>
            </div>
            {datePosts.map(post => {
              const status = STATUS_STYLE[post.status] || STATUS_STYLE.pending;
              return (
                <div key={post.id} style={{ padding: '0.85rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        {post.content ? (post.content.length > 140 ? `${post.content.slice(0, 140)}…` : post.content) : '(no text content)'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {new Date(post.scheduled_at).toLocaleTimeString()} · {post.brand} · {(post.target_platforms || []).map(p => PLATFORM_LABELS[p] || p).join(', ')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ color: status.color, fontWeight: 700, fontSize: '0.8rem' }}>{status.label}</span>
                      {post.status === 'pending' && (
                        <div>
                          <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.4rem' }} onClick={() => cancel(post.id)}>
                            <X size={12} /> Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {post.platform_results && Object.keys(post.platform_results).length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
                      {Object.entries(post.platform_results).map(([key, result]) => (
                        <div key={key} style={{ color: result.status === 'failed' ? 'var(--accent-danger)' : 'var(--text-secondary)' }}>
                          {PLATFORM_LABELS[key] || key}: {result.status}
                          {result.error ? ` — ${result.error}` : ''}
                          {result.url ? ` — ${result.url}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

export default Calendar;
