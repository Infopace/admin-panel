import React, { useEffect, useRef, useState } from 'react';
import { Send, AlertTriangle, UploadCloud, Film, X, Link2 } from 'lucide-react';
import { SOCIAL_API_BASE, PLATFORM_LABELS } from './api';

// Per-platform limits this composer actually warns about — kept to what
// the connected adapters really enforce, not a guessed list for
// platforms this app can't publish to yet (Facebook feed posts cap at
// 63,206 chars, high enough that it's not worth a warning here).
const CHAR_LIMITS = {
  youtube: { field: 'title', limit: 100, note: 'YouTube has no text-only post — this becomes a video title (truncated to 100 chars) plus description; a video file is required.' },
  google_business: { field: 'Local Post summary', limit: 1500, note: 'Google Business Profile Local Posts cap at 1500 characters.' },
  instagram: { field: 'caption', limit: 2200, note: 'Instagram has no text-only post — attach an image or video URL; captions cap at 2200 characters.' },
  linkedin: { field: 'commentary', limit: 3000, note: 'LinkedIn posts (personal profile only) cap at 3000 characters.' }
};

let mediaItemSeq = 0;

function Composer({ authFetch }) {
  const [accounts, setAccounts] = useState(null);
  const [brand, setBrand] = useState('infopace');
  const [content, setContent] = useState('');
  // Uploaded/attached media — { id, url, previewSrc, mediaType, uploading, error }.
  // Kept separate from the pasted-URL fallback field so an in-flight upload
  // never silently drops a URL someone was mid-typing, and vice versa.
  const [mediaItems, setMediaItems] = useState([]);
  const [pastedUrl, setPastedUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    authFetch(`${SOCIAL_API_BASE}/accounts`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load connected accounts.');
        // whatsapp has no publish() — it's messaging-only (see
        // backend/social/adapters/whatsapp.js) — so it's excluded here
        // rather than offered as a broadcast-post target that would just
        // fail when the queue tries to publish to it.
        setAccounts((data.accounts || []).filter(a => a.status === 'active' && a.platform !== 'whatsapp'));
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

  const uploadFiles = (files) => {
    Array.from(files).forEach(file => {
      if (!/^image\/|^video\//.test(file.type)) {
        setResult({ type: 'error', text: `${file.name} isn't an image or video — skipped.` });
        return;
      }
      const id = ++mediaItemSeq;
      const previewSrc = URL.createObjectURL(file);
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      setMediaItems(prev => [...prev, { id, previewSrc, mediaType, uploading: true, url: null, error: null }]);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('brand', brand);

      authFetch(`${SOCIAL_API_BASE}/media/upload`, { method: 'POST', body: formData })
        .then(async res => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Upload failed.');
          setMediaItems(prev => prev.map(m => (m.id === id ? { ...m, uploading: false, url: data.url } : m)));
        })
        .catch(err => {
          setMediaItems(prev => prev.map(m => (m.id === id ? { ...m, uploading: false, error: err.message } : m)));
        });
    });
  };

  const removeMediaItem = (id) => setMediaItems(prev => prev.filter(m => m.id !== id));

  const addPastedUrl = () => {
    const url = pastedUrl.trim();
    if (!url) return;
    const mediaType = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) ? 'video' : 'image';
    setMediaItems(prev => [...prev, { id: ++mediaItemSeq, previewSrc: url, mediaType, uploading: false, url, error: null }]);
    setPastedUrl('');
  };

  const mediaUrls = mediaItems.filter(m => m.url).map(m => m.url);
  const mediaUploading = mediaItems.some(m => m.uploading);

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
    if (mediaUploading) {
      setResult({ type: 'error', text: 'Still uploading media — wait for it to finish before scheduling.' });
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
      setResult({ type: 'success', text: 'Post scheduled — check Posts for its status.' });
      setContent('');
      setMediaItems([]);
      setPastedUrl('');
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
          <label>Photo / Video (required for YouTube and Instagram; optional elsewhere)</label>

          <div
            className={`media-upload-zone ${dragOver ? 'dragover' : ''}`}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
          >
            <UploadCloud size={22} style={{ color: 'var(--accent-primary)', marginBottom: '0.4rem' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Click to upload, or drag and drop</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Images or videos, up to 50MB each</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files && e.target.files.length) uploadFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {mediaItems.length > 0 && (
            <div className="media-chip-row">
              {mediaItems.map(m => (
                <div className="media-chip" key={m.id}>
                  {m.mediaType === 'video' ? (
                    <video src={m.previewSrc} muted />
                  ) : (
                    <img src={m.previewSrc} alt="" />
                  )}
                  {m.mediaType === 'video' && (
                    <span style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(15,18,30,0.65)', color: '#fff', borderRadius: 4, padding: '1px 4px', display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.62rem' }}>
                      <Film size={10} /> video
                    </span>
                  )}
                  {m.uploading && <div className="media-chip-uploading">Uploading…</div>}
                  {m.error && <div className="media-chip-uploading" style={{ color: 'var(--accent-danger)' }} title={m.error}>Failed</div>}
                  <button type="button" className="media-chip-remove" onClick={() => removeMediaItem(m.id)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
            <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              className="form-control"
              placeholder="…or paste an already-hosted media URL"
              value={pastedUrl}
              onChange={(e) => setPastedUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPastedUrl(); } }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addPastedUrl}>Add</button>
          </div>
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

        <button type="submit" className="btn btn-primary btn-sm" disabled={submitting || mediaUploading}>
          <Send size={14} /> {submitting ? 'Scheduling...' : mediaUploading ? 'Uploading media…' : 'Schedule Post'}
        </button>
      </form>
    </div>
  );
}

export default Composer;
