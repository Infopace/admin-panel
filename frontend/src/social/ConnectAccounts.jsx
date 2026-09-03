import React, { useEffect, useState } from 'react';
import { RefreshCw, Link2, Unlink } from 'lucide-react';
import { SOCIAL_API_BASE, PLATFORM_LABELS, AVAILABLE_PLATFORMS } from './api';

// Mirrors the Supabase Connection Manager panel's UX (App.jsx's
// currentView === 'settings' block) — same header-container/config-grid/
// config-card shapes, just OAuth-connect instead of paste-a-key.
function ConnectAccounts({ authFetch }) {
  const [accounts, setAccounts] = useState(null);
  const [brand, setBrand] = useState('infopace');
  const [connectingPlatform, setConnectingPlatform] = useState(null);
  const [banner, setBanner] = useState(null);

  const loadAccounts = async () => {
    try {
      const res = await authFetch(`${SOCIAL_API_BASE}/accounts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load connected accounts.');
      setAccounts(data.accounts || []);
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      setAccounts([]);
    }
  };

  // OAuth callback lands the browser back on '/', carrying
  // ?social_connected=<platform> or ?social_error=<message> — surface it
  // once, then strip it from the URL so a refresh doesn't reshow it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('social_connected');
    const error = params.get('social_error');
    if (connected) setBanner({ type: 'success', text: `${PLATFORM_LABELS[connected] || connected} connected.` });
    if (error) setBanner({ type: 'error', text: error });
    if (connected || error) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (platform) => {
    if (!brand.trim()) {
      setBanner({ type: 'error', text: 'Enter a brand before connecting an account.' });
      return;
    }
    setConnectingPlatform(platform);
    try {
      const res = await authFetch(`${SOCIAL_API_BASE}/connect/${platform}?brand=${encodeURIComponent(brand.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start the connect flow.');
      window.location.href = data.url; // leaves the app for the platform's OAuth consent screen
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      setConnectingPlatform(null);
    }
  };

  const disconnect = async (accountId) => {
    if (!confirm('Disconnect this account? Scheduled posts already targeting it will fail until reconnected.')) return;
    try {
      const res = await authFetch(`${SOCIAL_API_BASE}/accounts/${accountId}/disconnect`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not disconnect account.');
      loadAccounts();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const accountsByPlatform = {};
  (accounts || []).forEach(a => {
    if (a.status !== 'active') return;
    (accountsByPlatform[a.platform] = accountsByPlatform[a.platform] || []).push(a);
  });

  return (
    <div>
      <div className="header-container">
        <div className="title-area">
          <h1>Connect Accounts</h1>
          <p>Connect real platform accounts to publish, monitor, and reply from this dashboard.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadAccounts}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {banner && (
        <p style={{ color: banner.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)', marginBottom: '1rem' }}>
          {banner.text}
        </p>
      )}

      <div className="form-group" style={{ maxWidth: 320, marginBottom: '1.5rem' }}>
        <label>Brand</label>
        <input
          type="text"
          className="form-control"
          placeholder="e.g. infopace"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
      </div>

      {accounts === null ? (
        <div className="trend-chart-empty">Loading connected accounts...</div>
      ) : (
        <div className="config-grid">
          {AVAILABLE_PLATFORMS.map(platform => {
            const connected = accountsByPlatform[platform] || [];
            return (
              <div className="config-card" key={platform}>
                <div className="config-header">
                  <h3>{PLATFORM_LABELS[platform]}</h3>
                  <span className={`mode-badge ${connected.length > 0 ? 'live' : 'mock'}`}>
                    {connected.length > 0 ? `${connected.length} connected` : 'not connected'}
                  </span>
                </div>

                {connected.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.account_label || a.id}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Brand: {a.brand}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => disconnect(a.id)}>
                      <Unlink size={14} /> Disconnect
                    </button>
                  </div>
                ))}

                <div style={{ marginTop: '1rem' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={connectingPlatform === platform}
                    onClick={() => connect(platform)}
                  >
                    <Link2 size={14} /> {connectingPlatform === platform
                      ? 'Redirecting...'
                      : connected.length > 0 ? `Connect another ${PLATFORM_LABELS[platform]} account` : `Connect ${PLATFORM_LABELS[platform]}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ConnectAccounts;
