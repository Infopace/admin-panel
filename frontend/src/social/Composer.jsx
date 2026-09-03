import React, { useEffect, useState } from 'react';
import { Send, AlertTriangle } from 'lucide-react';
import { SOCIAL_API_BASE, PLATFORM_LABELS } from './api';

// Per-platform limits this composer actually warns about — kept to what
// the connected adapters really enforce, not a guessed list for
// platforms this app can't publish to yet (Facebook feed posts cap at
// 63,206 chars, high enough that it's not worth a warning here).
const CHAR_LIMITS = {
  youtube: { field: 'title', limit: 100, note: 'YouTube has no text-only post — this becomes a video title (truncated to 100 chars) plus description; a video file is required.' },
  google_business: { field: 'Local Post summary', limit: 1500, note: 'Google Business Profile Local Posts cap at 1500 characters.' },
  instagram: { field: 'caption', limit: 2200, note: 'Instagram has no text-only post — attach an image or video URL; captions cap at 2200 characters.' }
};

function Composer({ authFetch }) {
  const [accounts, setAccounts] = useState(null);
  const [brand, setBrand] = useState('infopace');
  const [content, setContent] = useState('');
  const [mediaUrlsText, setMediaUrlsText] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    authFetch(`${SOCIAL_API_BASE}/accounts`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load connected accounts.');
        setAccounts((data.accounts || []).filter(a => a.status === 'active'));
      })
      .catch(err => { setResult({ type: 'error', text: err.message }); setAccounts([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAccount = (id) => {
    setSelectedAccountIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedPlatforms = Array.from(new Set(
    (accounts || []).filter(a => selectedAccountIds.includes(a.id)).map(a => a.platform)
  ));

  const mediaUrls = mediaUrlsText.split('\n').map(s => s.trim()).filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    if (selectedAccountIds.length === 0) {
      setResult({ type: 'error', text: 'Select at least one connected account to post to.' });
      return;
    }
    if (!scheduledAt) {
      setResult({ type: 'error', text: 'Pick a schedule date/time (use now for an immediate post).' });
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const res = await authFetch(`${SOCIAL_API_BASE}/posts`, {
        method: 'POST',
        body: JSON.stringify({
          brand,
          content,
          mediaUrls,
          targetPlatforms: selectedPlatforms,
          targetAccountIds: selectedAccountIds,
          scheduledAt: new Date(scheduledAt).toISOString()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not schedule post.');
      setResult({ type: 'success', text: 'Post scheduled — check Calendar for its status.' });
      setContent('');
      setMediaUrlsText('');
      setSelectedAccountIds([]);
      setScheduledAt('');
    } catch (err) {
      setResult({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="header-container">
        <div className="title-area">
          <h1>Compose</h1>
          <p>Write once, schedule to every connected account you pick below.</p>
        </div>
      </div>

      {accounts !== null && accounts.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          No accounts connected yet — go to Connect Accounts first.
        </p>
      )}

      <form className="panel" onSubmit={submit}>
        <div className="form-group">
          <label>Brand</label>
          <input type="text" className="form-control" style={{ maxWidth: 320 }} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Content</label>
          <textarea
            className="form-control"
            rows={5}
            placeholder="What do you want to say?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        {selectedPlatforms.map(p => CHAR_LIMITS[p] && content.length > CHAR_LIMITS[p].limit && (
          <p key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-warning)', fontSize: '0.82rem' }}>
            <AlertTriangle size={14} /> {PLATFORM_LABELS[p]}: {content.length}/{CHAR_LIMITS[p].limit} chars — {CHAR_LIMITS[p].note}
          </p>
        ))}
        {selectedPlatforms.filter(p => CHAR_LIMITS[p]).map(p => (
          <p key={`note-${p}`} style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{CHAR_LIMITS[p].note}</p>
        ))}

        <div className="form-group">
          <label>Media URL(s) — one per line (required for YouTube and Instagram; optional elsewhere)</label>
          <textarea
            className="form-control"
            rows={2}
            placeholder="https://example.com/my-video.mp4"
            value={mediaUrlsText}
            onChange={(e) => setMediaUrlsText(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Post to</label>
          {(accounts || []).length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>—</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {accounts.map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedAccountIds.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                  {PLATFORM_LABELS[a.platform] || a.platform} — {a.account_label || a.id} <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>({a.brand})</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Schedule</label>
          <input
            type="datetime-local"
            className="form-control"
            style={{ maxWidth: 260 }}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>

        {result && (
          <p style={{ color: result.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{result.text}</p>
        )}

        <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
          <Send size={14} /> {submitting ? 'Scheduling...' : 'Schedule Post'}
        </button>
      </form>
    </div>
  );
}

export default Composer;
