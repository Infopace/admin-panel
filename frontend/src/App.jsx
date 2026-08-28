import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Database,
  Settings,
  Download,
  Search,
  User,
  Mail,
  Calendar,
  Award,
  X,
  Check,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  BookOpen,
  Phone,
  TrendingUp,
  TrendingDown,
  Minus,
  FileCheck2,
  AlertTriangle,
  HeartPulse,
  BarChart3
} from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

const TREND_RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' }
];

// "2 min ago" / "3 hours ago" style relative time for the activity feed.
function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (isNaN(diffMs)) return '';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isToday(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
}

// Live Activity "Today's Snapshot" (doc section 6) — derived client-side
// from the already-fetched activity feed rather than a new endpoint.
// Active Sessions / Currently Processing have no real value: reports
// generate synchronously (never queued), so those are always 0 — shown
// with a note rather than omitted, since the doc explicitly asks for them.
function TodaySnapshot({ activityData }) {
  const todays = activityData.filter(e => isToday(e.timestamp));
  const completedToday = todays.filter(e => e.type === 'assessment_completed').length;
  const reportsGeneratedToday = todays.filter(e => e.type === 'report_generated').length;
  const reportsFailedToday = todays.filter(e => e.type === 'report_failed').length;

  return (
    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
      <span>Completed today: <strong>{completedToday}</strong></span>
      <span>Reports generated today: <strong>{reportsGeneratedToday}</strong></span>
      <span>Reports failed today: <strong>{reportsFailedToday}</strong></span>
      <span title="No session queue exists — every report request completes synchronously">Currently processing: <strong>0</strong></span>
      <span title="No session-tracking data exists yet — needs source-app instrumentation">Active sessions: <strong>N/A</strong></span>
    </div>
  );
}

// Real Tool Availability — pings the tool's actual public website,
// separate from the DB-query health pill next to it. A tool can be
// "healthy" on DB queries while its public site is suspended.
function AvailabilityPill({ availability }) {
  if (!availability) return null;
  const labels = { up: 'Site Up', suspended: 'Site Suspended', down: 'Site Down' };
  const classes = { up: 'healthy', suspended: 'critical', down: 'critical' };
  return (
    <span className={`health-status-pill ${classes[availability.status] || 'unknown'}`} title={availability.url}>
      {labels[availability.status] || 'Unknown'}
    </span>
  );
}

function TrendIndicator({ trend }) {
  if (!trend) return null;
  const { direction, changePercent } = trend;
  if (direction === 'up') {
    return <span className="trend-indicator up"><TrendingUp size={14} /> {changePercent}%</span>;
  }
  if (direction === 'down') {
    return <span className="trend-indicator down"><TrendingDown size={14} /> {Math.abs(changePercent)}%</span>;
  }
  return <span className="trend-indicator flat"><Minus size={14} /> Flat</span>;
}

// "2026-08-21" -> "Aug 21"
function formatShortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Minimal dependency-free bar chart for the usage trend panel. Built with
// flexbox columns (not raw SVG scaling) so bars stay proportioned and a
// baseline + date labels make it read as a chart even when only one or
// two days have activity. Hovering or clicking a bar shows a per-tool
// breakdown for that day (toolNames maps dbId -> display name).
function TrendChart({ series, toolNames }) {
  const [activeIndex, setActiveIndex] = useState(null);

  if (!series || series.length === 0) {
    return <div className="trend-chart-empty">No activity data for this range.</div>;
  }

  const maxVal = Math.max(...series.map(p => p.completed), 1);
  // Thin out date labels on longer ranges so they don't collide. The
  // last date is always shown (today); skip the nearest regular tick
  // if it would land right next to it.
  const labelEvery = Math.max(1, Math.ceil(series.length / 9));
  const lastIndex = series.length - 1;
  const lastRegularTick = Math.floor(lastIndex / labelEvery) * labelEvery;
  const suppressLastRegularTick = lastIndex - lastRegularTick > 0 && lastIndex - lastRegularTick < labelEvery / 2;

  return (
    <div className="trend-chart">
      <div className="trend-chart-bars">
        {series.map((point, i) => {
          const byToolEntries = point.byTool
            ? Object.entries(point.byTool).sort((a, b) => b[1] - a[1])
            : [];
          return (
            <div
              className="trend-bar-col"
              key={point.date}
              style={{ position: 'relative' }}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(prev => (prev === i ? null : prev))}
              onClick={() => setActiveIndex(prev => (prev === i ? null : i))}
            >
              {point.completed > 0 && (
                <span className="trend-bar-value">{point.completed}</span>
              )}
              <div
                className="trend-bar"
                style={{ height: point.completed > 0 ? `${Math.max((point.completed / maxVal) * 100, 4)}%` : '0%' }}
              />
              {activeIndex === i && (
                <div className="trend-bar-tooltip">
                  <div className="trend-bar-tooltip-header">
                    {formatShortDate(point.date)} — {point.completed} total
                  </div>
                  {byToolEntries.length > 1 ? (
                    <ul className="trend-bar-tooltip-list">
                      {byToolEntries.map(([dbId, count]) => (
                        <li key={dbId}>
                          <span>{(toolNames && toolNames[dbId]) || dbId}</span>
                          <strong>{count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : point.completed === 0 ? (
                    <div className="trend-bar-tooltip-empty">No activity</div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="trend-chart-axis">
        {series.map((point, i) => {
          const isRegularTick = i % labelEvery === 0 && !(suppressLastRegularTick && i === lastRegularTick);
          if (!isRegularTick && i !== lastIndex) return null;
          const leftPct = series.length > 1 ? (i / (series.length - 1)) * 100 : 50;
          return (
            <span className="trend-chart-label" key={point.date} style={{ left: `${leftPct}%` }}>
              {formatShortDate(point.date)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  // Authentication State
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [userEmail, setUserEmail] = useState(localStorage.getItem('userEmail') || '');
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Navigation State: 'overview', 'analytics', 'db1'-'db5', 'settings'
  const [currentView, setCurrentView] = useState('overview');
  const [dbStatuses, setDbStatuses] = useState(null);
  const [overviewData, setOverviewData] = useState([]);
  const [summaryData, setSummaryData] = useState(null);

  // Analytics page: 'all' or a specific dbId to drill into
  const [analyticsTool, setAnalyticsTool] = useState('all');

  // Usage trend, live activity, alerts, system health, reports — all
  // live on the Analytics page now
  const [trendRange, setTrendRange] = useState('7d');
  const [trendSeries, setTrendSeries] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [activityData, setActivityData] = useState([]);
  const [alertsData, setAlertsData] = useState([]);
  const [healthData, setHealthData] = useState(null);
  const [reportsSummary, setReportsSummary] = useState(null);
  const [entitySummary, setEntitySummary] = useState(null);

  // Assessment Details State
  const [candidates, setCandidates] = useState([]);
  const [assessmentName, setAssessmentName] = useState('');
  const [assessmentMode, setAssessmentMode] = useState('mock');
  const [searchQuery, setSearchQuery] = useState('');

  // Organization / User / Dimension monitoring for the selected tool
  const [orgBreakdown, setOrgBreakdown] = useState({ supported: false, organizations: [] });
  const [userBreakdown, setUserBreakdown] = useState({ supported: false, totalUniqueUsers: 0, averageAttemptsPerUser: 0, users: [] });
  const [dimensionData, setDimensionData] = useState({ supported: false, dimensions: [] });
  const [paymentData, setPaymentData] = useState({ supported: false });

  // Selected Candidate Drawer State
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [candidateDetails, setCandidateDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Settings State
  const [configForms, setConfigForms] = useState({
    db1: { url: '', key: '' },
    db2: { url: '', key: '' },
    db3: { url: '', key: '' },
    db4: { url: '', key: '' },
    db5: { url: '', key: '' }
  });

  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState(false);
  const [saveMessages, setSaveMessages] = useState({});

  // Auth Handlers
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    setToken('');
    setUserEmail('');
    setCurrentView('overview');
  };

  // Helper fetch function that automatically injects auth token
  const authFetch = async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        throw new Error('Session expired or unauthorized. Please log in again.');
      }
      return res;
    } catch (err) {
      if (err.message.includes('Session expired')) {
        throw err;
      }
      console.error('Fetch error:', err);
      throw err;
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!authForm.email || !authForm.password) {
      setAuthError('Email and password are required.');
      return;
    }

    if (authMode === 'register' && authForm.password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setAuthLoading(true);
    try {
      const url = `${API_BASE}/auth/${authMode}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication request failed.');
      }

      if (authMode === 'register') {
        setAuthSuccess('Registration successful! You can now log in.');
        setAuthMode('login');
        setAuthForm(prev => ({ ...prev, password: '' }));
      } else {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userEmail', data.email);
        setToken(data.token);
        setUserEmail(data.email);
        setAuthForm({ email: '', password: '' });
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // 1. Initial Load: Fetch API Status and Overview (used by sidebar nav
  // and the Overview landing page)
  const loadInitialData = async () => {
    if (!token) return;
    setLoading(true);
    setBackendError(false);
    try {
      const statusRes = await authFetch(`${API_BASE}/status`);
      if (!statusRes.ok) throw new Error('API server error');
      const statusData = await statusRes.json();
      setDbStatuses(statusData);

      const overviewRes = await authFetch(`${API_BASE}/overview`);
      const overviewData = await overviewRes.json();
      setOverviewData(overviewData);

      const summaryRes = await authFetch(`${API_BASE}/overview/summary`);
      const summaryData = await summaryRes.json();
      setSummaryData(summaryData);
    } catch (err) {
      console.error('Error connecting to backend:', err);
      if (!err.message.includes('Session expired')) {
        setBackendError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadInitialData();
    }
  }, [token]);

  // Analytics — cross-tool signals (health, alerts, report monitoring)
  // fetched once whenever the Analytics page is opened; these aren't
  // scoped per-tool, the alerts/health panels just filter client-side.
  useEffect(() => {
    if (!token || currentView !== 'analytics') return;
    const fetchAnalyticsCrossTool = async () => {
      try {
        const [healthRes, alertsRes, reportsRes, entitiesRes] = await Promise.all([
          authFetch(`${API_BASE}/health`),
          authFetch(`${API_BASE}/alerts`),
          authFetch(`${API_BASE}/reports/summary`),
          authFetch(`${API_BASE}/overview/entities`)
        ]);
        setHealthData(await healthRes.json());
        setAlertsData((await alertsRes.json()).alerts || []);
        setReportsSummary(await reportsRes.json());
        setEntitySummary(await entitiesRes.json());
      } catch (err) {
        console.error('Error fetching analytics cross-tool data:', err);
      }
    };
    fetchAnalyticsCrossTool();
  }, [token, currentView]);

  // Analytics — usage trend, scoped to the selected tool (or all tools).
  useEffect(() => {
    if (!token || currentView !== 'analytics') return;
    const fetchTrend = async () => {
      setTrendLoading(true);
      try {
        const dbParam = analyticsTool !== 'all' ? `&dbId=${analyticsTool}` : '';
        const res = await authFetch(`${API_BASE}/overview/trend?range=${trendRange}${dbParam}`);
        const data = await res.json();
        setTrendSeries(data.series || []);
      } catch (err) {
        console.error('Error fetching trend:', err);
      } finally {
        setTrendLoading(false);
      }
    };
    fetchTrend();
  }, [token, currentView, trendRange, analyticsTool]);

  // Analytics — live activity feed, scoped to the selected tool.
  useEffect(() => {
    if (!token || currentView !== 'analytics') return;
    const fetchActivity = async () => {
      try {
        const dbParam = analyticsTool !== 'all' ? `&dbId=${analyticsTool}` : '';
        const res = await authFetch(`${API_BASE}/activity?limit=15${dbParam}`);
        const data = await res.json();
        setActivityData(data.events || []);
      } catch (err) {
        console.error('Error fetching activity:', err);
      }
    };
    fetchActivity();
  }, [token, currentView, analyticsTool]);

  // Analytics — dimensions / organization / user / payment breakdowns
  // for the selected tool (only meaningful once a specific tool is picked).
  useEffect(() => {
    if (!token || currentView !== 'analytics') return;
    if (analyticsTool === 'all') {
      setOrgBreakdown({ supported: false, organizations: [] });
      setUserBreakdown({ supported: false, totalUniqueUsers: 0, averageAttemptsPerUser: 0, users: [] });
      setDimensionData({ supported: false, dimensions: [] });
      setPaymentData({ supported: false });
      return;
    }
    const fetchBreakdowns = async () => {
      try {
        const [orgRes, userRes, dimRes, paymentRes] = await Promise.all([
          authFetch(`${API_BASE}/assessments/${analyticsTool}/organizations`),
          authFetch(`${API_BASE}/assessments/${analyticsTool}/users`),
          authFetch(`${API_BASE}/assessments/${analyticsTool}/dimensions`),
          authFetch(`${API_BASE}/assessments/${analyticsTool}/payments`)
        ]);
        setOrgBreakdown(await orgRes.json());
        setUserBreakdown(await userRes.json());
        setDimensionData(await dimRes.json());
        setPaymentData(await paymentRes.json());
      } catch (err) {
        console.error('Error fetching org/user/dimension/payment breakdowns:', err);
      }
    };
    fetchBreakdowns();
  }, [token, currentView, analyticsTool]);

  // 2. Fetch candidates when switching to a tool's candidate-management view
  useEffect(() => {
    if (token && currentView.startsWith('db')) {
      const fetchCandidates = async () => {
        setLoading(true);
        try {
          const res = await authFetch(`${API_BASE}/assessments/${currentView}/candidates`);
          const data = await res.json();
          setCandidates(data.candidates || []);
          setAssessmentName(data.assessmentName || 'Assessment Tool');
          setAssessmentMode(data.mode || 'mock');
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      fetchCandidates();
      setSelectedCandidate(null);
      setCandidateDetails(null);
      setSearchQuery('');
    }
  }, [currentView, token]);

  // 3. Fetch details for Candidate Drawer
  const handleSelectCandidate = async (candidate) => {
    setSelectedCandidate(candidate);
    setDetailsLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/assessments/${currentView}/candidates/${candidate.id}`);
      const data = await res.json();
      setCandidateDetails(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  // 4. Download PDF report
  const downloadPdf = async (candidateId, name) => {
    setPdfLoading(true);
    try {
      const response = await authFetch(`${API_BASE}/assessments/${currentView}/candidates/${candidateId}/pdf`);
      if (!response.ok) throw new Error('PDF Generation Failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/\s+/g, '_')}_Result.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error generating PDF: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

  // 5. Update individual Supabase configuration
  const handleConfigChange = (dbId, field, value) => {
    setConfigForms(prev => ({
      ...prev,
      [dbId]: {
        ...prev[dbId],
        [field]: value
      }
    }));
  };

  const saveConfig = async (dbId) => {
    const { url, key } = configForms[dbId];
    if (!url || !key) {
      setSaveMessages(prev => ({ ...prev, [dbId]: { type: 'error', text: 'URL and Key are required.' } }));
      return;
    }

    try {
      const res = await authFetch(`${API_BASE}/config`, {
        method: 'POST',
        body: JSON.stringify({ dbId, url, key })
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessages(prev => ({ ...prev, [dbId]: { type: 'success', text: 'Connected successfully!' } }));
        // Refresh statuses
        loadInitialData();
      } else {
        setSaveMessages(prev => ({ ...prev, [dbId]: { type: 'error', text: data.error || 'Failed' } }));
      }
    } catch (err) {
      setSaveMessages(prev => ({ ...prev, [dbId]: { type: 'error', text: err.message || 'Connection failed' } }));
    }
  };

  const resetAllConfigs = async () => {
    if (!confirm('Are you sure you want to reset all connections?')) return;
    try {
      const res = await authFetch(`${API_BASE}/config/reset`, { method: 'POST' });
      await res.json();
      // Clear forms
      setConfigForms({
        db1: { url: '', key: '' },
        db2: { url: '', key: '' },
        db3: { url: '', key: '' },
        db4: { url: '', key: '' },
        db5: { url: '', key: '' }
      });
      setSaveMessages({});
      loadInitialData();
    } catch (err) {
      alert(err.message || 'Reset failed');
    }
  };

  // Filters
  const filteredCandidates = candidates.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // dbId -> display name, for the trend chart's per-tool tooltip breakdown
  const toolNames = Object.fromEntries(overviewData.map(t => [t.id, t.name]));

  // Helper score range styling class
  const getScoreClass = (score, max) => {
    const pct = (score / max) * 100;
    if (pct >= 85) return 'high';
    if (pct >= 60) return 'medium';
    return 'low';
  };

  if (backendError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1.5rem', padding: '2rem', textAlign: 'center' }}>
        <ShieldAlert size={64} color="#ef4444" />
        <h1 style={{ fontSize: '2rem', fontWeight: '800' }}>Backend Server Offline</h1>
        <p style={{ color: '#94a3b8', maxWidth: '500px' }}>
          We could not connect to the Express server running on port 5000. Please start the backend server using `npm start` in the `backend` folder first.
        </p>
        <button className="btn btn-primary" onClick={loadInitialData}>
          <RefreshCw size={18} /> Retry Connection
        </button>
      </div>
    );
  }

  // Auth Screen check
  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <LayoutDashboard size={28} />
            </div>
            <h1 className="auth-title">Infopace Admin Panel</h1>
            <p className="auth-subtitle">
              {authMode === 'login' ? 'Log in to your admin account' : 'Create an admin account'}
            </p>
          </div>

          <div className="auth-body">
            {authError && (
              <div className="alert-auth">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="alert-auth-success">
                <Check size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{authSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="form-control-wrap">
                  <Mail size={16} className="form-control-icon" />
                  <input
                    type="email"
                    className="form-control"
                    placeholder="admin@example.com"
                    value={authForm.email}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="form-control-wrap">
                  <ShieldAlert size={16} className="form-control-icon" />
                  <input
                    type="password"
                    className="form-control"
                    placeholder="••••••••"
                    value={authForm.password}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary auth-btn"
                disabled={authLoading}
              >
                {authLoading ? (
                  <RefreshCw className="animate-spin" size={18} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  authMode === 'login' ? 'Log In' : 'Register Account'
                )}
              </button>
            </form>

            <div className="auth-footer">
              {authMode === 'login' ? (
                <span>
                  Don't have an account?{' '}
                  <span className="auth-toggle-link" onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }}>
                    Register
                  </span>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <span className="auth-toggle-link" onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}>
                    Log In
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="logo-container" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
          <img src="/favicon.png" alt="Infopace Logo" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'contain', backgroundColor: 'white', padding: '3px' }} />
          <span className="logo-text" style={{ fontSize: '1.15rem' }}>Admin Panel</span>
        </div>

        <div className="menu-section">
          <div className="menu-title">Main Dashboard</div>
          <ul className="menu-list">
            <li className="menu-item">
              <div
                className={`menu-link ${currentView === 'overview' ? 'active' : ''}`}
                onClick={() => setCurrentView('overview')}
              >
                <LayoutDashboard size={18} /> Overview
              </div>
            </li>
            <li className="menu-item">
              <div
                className={`menu-link ${currentView === 'analytics' ? 'active' : ''}`}
                onClick={() => setCurrentView('analytics')}
              >
                <BarChart3 size={18} /> Analytics
              </div>
            </li>
            <li className="menu-item">
              <div
                className={`menu-link ${currentView === 'settings' ? 'active' : ''}`}
                onClick={() => setCurrentView('settings')}
              >
                <Settings size={18} /> Supabase Settings
              </div>
            </li>
          </ul>
        </div>

        <div className="menu-section">
          <div className="menu-title">Assessment Tools</div>
          <ul className="menu-list">
            {dbStatuses && Object.keys(dbStatuses).map(dbId => (
              <li className="menu-item" key={dbId}>
                <div
                  className={`menu-link ${currentView === dbId ? 'active' : ''}`}
                  onClick={() => setCurrentView(dbId)}
                >
                  <Database size={18} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dbStatuses[dbId].name}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* User profile & Logout */}
        <div className="sidebar-user-profile">
          <div className="user-profile-details">
            <div className="user-profile-avatar">
              {userEmail ? userEmail[0].toUpperCase() : 'A'}
            </div>
            <div className="user-profile-email" title={userEmail}>
              {userEmail || 'Admin User'}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN VIEW */}
      <main className="main-content">

        {/* VIEW: OVERVIEW — lightweight landing page; deep monitoring lives on Analytics */}
        {currentView === 'overview' && (
          <div>
            <div className="header-container">
              <div className="title-area">
                <h1>Overview Portal</h1>
                <p>Quick summary across all 5 databases — see Analytics for full monitoring.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={loadInitialData}>
                  <RefreshCw size={14} /> Refresh Data
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setCurrentView('analytics')}>
                  <BarChart3 size={14} /> Open Analytics
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 1rem auto', animation: 'spin 1s linear infinite' }} />
                Loading aggregated stats...
              </div>
            ) : (
              <div className="stats-grid">
                {overviewData.map((item, idx) => (
                  <div
                    className={`stat-card db${idx + 1}`}
                    key={item.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setCurrentView(item.id)}
                  >
                    <div>
                      <span className="stat-label">{item.name}</span>
                      <div className="stat-value">{item.totalTestTakers}</div>
                      <span className="stat-desc">Candidates — click to manage</span>
                    </div>
                    <div className="stat-icon">
                      <Award size={20} color={`var(--accent-${idx === 0 ? 'primary' : idx === 1 ? 'secondary' : idx === 2 ? 'success' : idx === 3 ? 'warning' : 'danger'})`} />
                    </div>
                    <div style={{ position: 'absolute', bottom: 10, right: 15 }}>
                      <span className={`score-badge ${getScoreClass(item.averageScorePercentage, 100)}`} style={{ fontSize: '0.7rem' }}>
                        Avg: {item.averageScorePercentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: ANALYTICS — full monitoring dashboard, doc sections 1-15.
            "All Tools" tab = master dashboard; a specific tool tab = the
            same framework dynamically populated for that one tool. */}
        {currentView === 'analytics' && (
          <div>
            <div className="header-container">
              <div className="title-area">
                <h1>Analytics</h1>
                <p>Usage, performance, and health monitoring across every assessment tool.</p>
              </div>
              <div className="range-tabs" style={{ flexWrap: 'wrap' }}>
                <button
                  className={`range-tab ${analyticsTool === 'all' ? 'active' : ''}`}
                  onClick={() => setAnalyticsTool('all')}
                >
                  All Tools
                </button>
                {overviewData.map(item => (
                  <button
                    key={item.id}
                    className={`range-tab ${analyticsTool === item.id ? 'active' : ''}`}
                    onClick={() => setAnalyticsTool(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            {analyticsTool === 'all' ? (
              <>
                {/* Master KPI Cards (doc section 1) */}
                {summaryData && (
                  <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Total Assessments</span>
                        <div className="stat-value">{summaryData.totalAssessments}</div>
                        <span className="stat-desc">Across all tools</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Average Score</span>
                        <div className="stat-value">{summaryData.averageScorePercentage}%</div>
                        <span className="stat-desc">Weighted across tools</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Live Connections</span>
                        <div className="stat-value">{summaryData.liveToolsCount} / {summaryData.totalTools}</div>
                        <span className="stat-desc">{summaryData.mockToolsCount} using mock data</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Reports Generated</span>
                        <div className="stat-value">{reportsSummary ? reportsSummary.totalGenerated : '—'}</div>
                        <span className="stat-desc">{reportsSummary ? `${reportsSummary.successRate}% success rate` : 'Loading...'}</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Reports Pending</span>
                        <div className="stat-value">0</div>
                        <span className="stat-desc">Generated synchronously — never queued</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Active Users</span>
                        <div className="stat-value">{entitySummary ? entitySummary.totalUsers : '—'}</div>
                        <span className="stat-desc">Across live-connected tools</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Active Organizations</span>
                        <div className="stat-value">{entitySummary ? entitySummary.totalOrganizations : '—'}</div>
                        <span className="stat-desc">Across live-connected tools</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Failed Requests</span>
                        <div className="stat-value">{healthData ? Object.values(healthData).reduce((sum, h) => sum + h.errors, 0) : '—'}</div>
                        <span className="stat-desc">Live query errors since server start</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Last Activity</span>
                        <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                          {summaryData.lastActivity ? new Date(summaryData.lastActivity).toLocaleString() : 'No activity yet'}
                        </div>
                        <span className="stat-desc">Most recent across tools</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Usage Activity Trend (doc section 3) */}
                <div className="panel">
                  <div className="panel-header">
                    <h2>Assessment Activity Trend</h2>
                    <div className="range-tabs">
                      {TREND_RANGES.map(r => (
                        <button
                          key={r.key}
                          className={`range-tab ${trendRange === r.key ? 'active' : ''}`}
                          onClick={() => setTrendRange(r.key)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {trendLoading ? (
                    <div className="trend-chart-empty">Loading trend...</div>
                  ) : (
                    <TrendChart series={trendSeries} toolNames={toolNames} />
                  )}
                </div>

                {/* Tool-wise Monitoring (doc section 2) */}
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Tool-wise Monitoring</h2>
                <div className="table-section">
                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Assessment Name</th>
                          <th>Category</th>
                          <th>Data Source Mode</th>
                          <th>Active Records</th>
                          <th>Avg / Median Score</th>
                          <th>Score Distribution</th>
                          <th>Reports</th>
                          <th>Error Rate</th>
                          <th>Last Activity</th>
                          <th>Trend</th>
                          <th>Status Health</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData.map(item => {
                          const toolReports = reportsSummary && reportsSummary.byTool ? reportsSummary.byTool[item.id] : null;
                          const toolHealth = healthData ? healthData[item.id] : null;
                          return (
                            <tr key={item.id} onClick={() => setAnalyticsTool(item.id)}>
                              <td>
                                <div style={{ fontWeight: '600' }}>{item.name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{item.description}</div>
                              </td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.category}</td>
                              <td>
                                <span className={`mode-badge ${item.mode === 'live' ? 'live' : 'mock'}`}>
                                  {item.mode} Mode
                                </span>
                              </td>
                              <td>{item.totalTestTakers} candidates</td>
                              <td>{item.averageScorePercentage}% / {item.medianScorePercentage}%</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.3rem', fontSize: '0.75rem' }}>
                                  <span className="score-badge low" title="Low scorers">L {item.scoreDistribution.low}%</span>
                                  <span className="score-badge medium" title="Medium scorers">M {item.scoreDistribution.medium}%</span>
                                  <span className="score-badge high" title="High scorers">H {item.scoreDistribution.high}%</span>
                                </div>
                              </td>
                              <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                {toolReports ? `${toolReports.generated} ok / ${toolReports.failed} failed` : '—'}
                              </td>
                              <td style={{ fontSize: '0.8rem' }}>
                                {toolHealth && toolHealth.calls > 0 ? (
                                  <span style={{ color: toolHealth.errorRate > 20 ? 'var(--accent-danger)' : 'var(--text-secondary)' }}>
                                    {toolHealth.errorRate}%
                                  </span>
                                ) : '—'}
                              </td>
                              <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                {item.lastActivity ? new Date(item.lastActivity).toLocaleDateString() : 'N/A'}
                              </td>
                              <td>
                                <TrendIndicator trend={item.trend} />
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <span className={`status-dot ${item.mode === 'live' ? 'online' : 'offline'}`}></span>
                                  <span style={{ fontSize: '0.85rem' }}>{item.mode === 'live' ? 'Online/Live' : 'Using Fallback Mock'}</span>
                                </div>
                              </td>
                              <td>
                                <button className="btn btn-secondary btn-sm">View Details</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Live Activity + Attention Required (doc sections 6, 15) */}
                <div className="split-grid">
                  <div className="panel">
                    <div className="panel-header">
                      <h2>Live Activity</h2>
                    </div>
                    <TodaySnapshot activityData={activityData} />
                    {activityData.length === 0 ? (
                      <div className="trend-chart-empty">No recent activity.</div>
                    ) : (
                      <div className="activity-feed">
                        {activityData.map((event, idx) => (
                          <div className="activity-item" key={idx}>
                            <span className={`activity-dot ${event.type}`}></span>
                            <span className="activity-text">
                              {event.type === 'assessment_completed' && (
                                <><strong>{event.candidateName}</strong> completed {event.tool}</>
                              )}
                              {event.type === 'report_generated' && (
                                <>Report generated for <strong>{event.candidateName}</strong> ({event.tool})</>
                              )}
                              {event.type === 'report_failed' && (
                                <>Report generation failed for <strong>{event.candidateName}</strong> ({event.tool})</>
                              )}
                            </span>
                            <span className="activity-time">{timeAgo(event.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="panel">
                    <div className="panel-header">
                      <h2><AlertTriangle size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />Attention Required</h2>
                    </div>
                    <div className="alerts-list">
                      {alertsData.map((alert, idx) => (
                        <div className={`alert-item ${alert.severity}`} key={idx}>
                          <div className="alert-item-body">
                            {alert.tool && <strong>{alert.tool}</strong>}
                            <span>{alert.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* System / Health Monitoring (doc section 14) */}
                <div className="panel">
                  <div className="panel-header">
                    <h2><HeartPulse size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />System Health</h2>
                    {reportsSummary && (
                      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                        <span><FileCheck2 size={13} style={{ verticalAlign: '-2px' }} /> {reportsSummary.totalGenerated} generated / downloaded</span>
                        <span>{reportsSummary.totalFailed} failed</span>
                        <span>0 pending</span>
                        <span>{reportsSummary.totalRegenerated} regenerated</span>
                        <span>{reportsSummary.successRate}% success rate</span>
                        {reportsSummary.avgGenerationTimeMs !== null && (
                          <span>{reportsSummary.avgGenerationTimeMs}ms avg generation time</span>
                        )}
                        <span className={`health-status-pill ${reportsSummary.successRate >= 95 ? 'healthy' : reportsSummary.successRate >= 80 ? 'warning' : 'critical'}`}>
                          Report Service: {reportsSummary.successRate >= 95 ? 'Healthy' : reportsSummary.successRate >= 80 ? 'Degraded' : 'Critical'}
                        </span>
                      </div>
                    )}
                  </div>
                  {healthData && (
                    <div className="health-grid">
                      {Object.keys(healthData).map(dbId => {
                        const h = healthData[dbId];
                        return (
                          <div className="health-card" key={dbId}>
                            <div className="health-card-header">
                              <span>{h.name}</span>
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <AvailabilityPill availability={h.availability} />
                                <span className={`health-status-pill ${h.status}`}>{h.status}</span>
                              </div>
                            </div>
                            <div className="health-card-meta">
                              {h.calls > 0 ? (
                                <>{h.avgLatencyMs}ms avg · {h.errorRate}% error rate · {h.errors} failed requests ({h.calls} calls)</>
                              ) : (
                                <>No live query attempts yet</>
                              )}
                              {h.lastSuccessAt && (
                                <div>Last successful processing: {new Date(h.lastSuccessAt).toLocaleString()}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Organizations / Users / Reports summary row (doc section 16) */}
                {entitySummary && (
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Organizations</span>
                        <div className="stat-value">{entitySummary.totalOrganizations}</div>
                        <span className="stat-desc">Across live-connected tools</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Users</span>
                        <div className="stat-value">{entitySummary.totalUsers}</div>
                        <span className="stat-desc">Across live-connected tools</span>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span className="stat-label">Reports</span>
                        <div className="stat-value">{entitySummary.totalReports}</div>
                        <span className="stat-desc">Successfully generated</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              (() => {
                const tool = overviewData.find(i => i.id === analyticsTool);
                const toolAlerts = alertsData.filter(a => a.dbId === analyticsTool);
                return (
                  <>
                    {/* Particular Tool — Detailed Monitoring (doc section 5) */}
                    {tool && (
                      <div className="tool-status-header">
                        <div>
                          <h2>{tool.name}</h2>
                          <div className="tool-status-meta">
                            <span className={`status-dot ${tool.mode === 'live' ? 'online' : 'offline'}`}></span>
                            {tool.mode === 'live' ? 'Active / Live' : 'Active / Mock'}
                            <span style={{ margin: '0 0.5rem' }}>·</span>
                            Last activity {tool.lastActivity ? new Date(tool.lastActivity).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                        <div className="tool-status-stats">
                          <div>
                            <span className="tool-status-value">{tool.totalTestTakers}</span>
                            <span className="tool-status-label">Attempts</span>
                          </div>
                          <div>
                            <span className="tool-status-value">{tool.averageScorePercentage}%</span>
                            <span className="tool-status-label">Avg Score</span>
                          </div>
                          <div>
                            <span className="tool-status-value">{tool.medianScorePercentage}%</span>
                            <span className="tool-status-label">Median Score</span>
                          </div>
                          <div>
                            <TrendIndicator trend={tool.trend} />
                            <span className="tool-status-label">7-Day Trend</span>
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => setCurrentView(analyticsTool)}>
                          Manage Candidates
                        </button>
                      </div>
                    )}

                    {/* Score Monitoring (doc section 9) */}
                    {tool && (
                      <div className="panel">
                        <div className="panel-header">
                          <h2>Score Distribution</h2>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Min {tool.minScorePercentage}% · Max {tool.maxScorePercentage}%
                          </span>
                        </div>
                        <div className="dimension-list">
                          <div className="dimension-row">
                            <span className="dimension-label">Low</span>
                            <div className="dimension-track">
                              <div className="dimension-fill" style={{ width: `${tool.scoreDistribution.low}%`, background: 'var(--accent-danger)' }} />
                            </div>
                            <span className="dimension-value">{tool.scoreDistribution.low}%</span>
                          </div>
                          <div className="dimension-row">
                            <span className="dimension-label">Medium</span>
                            <div className="dimension-track">
                              <div className="dimension-fill" style={{ width: `${tool.scoreDistribution.medium}%`, background: 'var(--accent-warning)' }} />
                            </div>
                            <span className="dimension-value">{tool.scoreDistribution.medium}%</span>
                          </div>
                          <div className="dimension-row">
                            <span className="dimension-label">High</span>
                            <div className="dimension-track">
                              <div className="dimension-fill" style={{ width: `${tool.scoreDistribution.high}%`, background: 'var(--accent-success)' }} />
                            </div>
                            <span className="dimension-value">{tool.scoreDistribution.high}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tool Usage Monitor, scoped (doc section 3) */}
                    <div className="panel">
                      <div className="panel-header">
                        <h2>Activity Trend</h2>
                        <div className="range-tabs">
                          {TREND_RANGES.map(r => (
                            <button
                              key={r.key}
                              className={`range-tab ${trendRange === r.key ? 'active' : ''}`}
                              onClick={() => setTrendRange(r.key)}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {trendLoading ? (
                        <div className="trend-chart-empty">Loading trend...</div>
                      ) : (
                        <TrendChart series={trendSeries} toolNames={toolNames} />
                      )}
                    </div>

                    {/* Tool-Specific Dimensions (doc section 10) */}
                    {dimensionData.supported && dimensionData.dimensions.length > 0 && (
                      <div className="panel">
                        <div className="panel-header">
                          <h2>Tool Dimensions</h2>
                        </div>
                        <div className="dimension-list">
                          {dimensionData.dimensions.map(dim => (
                            <div className="dimension-row" key={dim.key}>
                              <span className="dimension-label">{dim.label}</span>
                              <div className="dimension-track">
                                <div className="dimension-fill" style={{ width: `${dim.average ?? 0}%` }} />
                              </div>
                              <span className="dimension-value">{dim.average !== null ? `${dim.average}%` : 'N/A'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Payment Monitoring — not in the original doc, added on request */}
                    {paymentData.supported && (
                      <div className="panel">
                        <div className="panel-header">
                          <h2>Payment Monitoring</h2>
                        </div>
                        <div className="stats-grid" style={{ marginBottom: 0 }}>
                          <div className="stat-card">
                            <div>
                              <span className="stat-label">Paid</span>
                              <div className="stat-value">{paymentData.paidCount}</div>
                              <span className="stat-desc">{paymentData.paymentRate}% conversion</span>
                            </div>
                          </div>
                          <div className="stat-card">
                            <div>
                              <span className="stat-label">Unpaid</span>
                              <div className="stat-value">{paymentData.unpaidCount}</div>
                              <span className="stat-desc">Not yet converted</span>
                            </div>
                          </div>
                          {paymentData.hasRevenueAmount && (
                            <div className="stat-card">
                              <div>
                                <span className="stat-label">Total Revenue</span>
                                <div className="stat-value">₹{paymentData.totalRevenue.toLocaleString()}</div>
                                <span className="stat-desc">From paid records</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {paymentData.unpaidBreakdown && paymentData.unpaidBreakdown.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
                            Unpaid breakdown: {paymentData.unpaidBreakdown.map(b => `${b.count} ${b.status}`).join(' · ')}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Organization + User Monitoring (doc sections 11, 12) */}
                    {(orgBreakdown.supported || userBreakdown.supported) && (
                      <div className="split-grid">
                        {orgBreakdown.supported && (
                          <div className="panel">
                            <div className="panel-header">
                              <h2>Organization Monitoring</h2>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {orgBreakdown.organizations.length} active organizations
                              </span>
                            </div>
                            {orgBreakdown.organizations.length === 0 ? (
                              <div className="trend-chart-empty">No organization data yet.</div>
                            ) : (
                              <div className="table-container">
                                {orgBreakdown.organizations.length > 1 && (
                                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                    <span>Most active: <strong>{orgBreakdown.organizations[0].organization}</strong></span>
                                    <span>Least active: <strong>{orgBreakdown.organizations[orgBreakdown.organizations.length - 1].organization}</strong></span>
                                  </div>
                                )}
                                <table className="custom-table">
                                  <thead>
                                    <tr>
                                      <th>Organization</th>
                                      <th>Assessments</th>
                                      <th>Avg Score</th>
                                      <th>Last Activity</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {orgBreakdown.organizations.slice(0, 10).map(org => (
                                      <tr key={org.organization}>
                                        <td>{org.organization}</td>
                                        <td>{org.totalAssessments}</td>
                                        <td>{org.averageScore}</td>
                                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                          {org.lastActivity ? new Date(org.lastActivity).toLocaleDateString() : 'N/A'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {userBreakdown.supported && (
                          <div className="panel">
                            <div className="panel-header">
                              <h2>User Monitoring</h2>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {userBreakdown.totalUniqueUsers} unique · {userBreakdown.averageAttemptsPerUser} avg attempts/user
                              </span>
                            </div>
                            {userBreakdown.users.length === 0 ? (
                              <div className="trend-chart-empty">No user data yet.</div>
                            ) : (
                              <div className="table-container">
                                {(() => {
                                  const newUsers = userBreakdown.users.filter(u => u.attempts === 1).length;
                                  const returningUsers = userBreakdown.users.filter(u => u.attempts > 1).length;
                                  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                                  const activeUsers = userBreakdown.users.filter(u => u.lastActivity && new Date(u.lastActivity).getTime() >= thirtyDaysAgo).length;
                                  const avgUserScore = Math.round(userBreakdown.users.reduce((sum, u) => sum + u.averageScore, 0) / userBreakdown.users.length);
                                  return (
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                      <span>New: <strong>{newUsers}</strong></span>
                                      <span>Returning: <strong>{returningUsers}</strong></span>
                                      <span>Active (30d): <strong>{activeUsers}</strong></span>
                                      <span>Avg score across users: <strong>{avgUserScore}</strong></span>
                                    </div>
                                  );
                                })()}
                                <table className="custom-table">
                                  <thead>
                                    <tr>
                                      <th>User</th>
                                      <th>Attempts</th>
                                      <th>Avg Score</th>
                                      <th>Last Activity</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {userBreakdown.users.slice(0, 10).map(u => (
                                      <tr key={u.userId}>
                                        <td>{u.name}</td>
                                        <td>{u.attempts}</td>
                                        <td>{u.averageScore}</td>
                                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                          {u.lastActivity ? new Date(u.lastActivity).toLocaleDateString() : 'N/A'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* System Health, scoped to this tool (doc section 17) */}
                    {healthData && healthData[analyticsTool] && (
                      <div className="panel">
                        <div className="panel-header">
                          <h2><HeartPulse size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />System Health</h2>
                        </div>
                        {(() => {
                          const h = healthData[analyticsTool];
                          return (
                            <div className="health-grid">
                              {h.availability && (
                                <div className="health-card">
                                  <div className="health-card-header">
                                    <span>Tool Availability</span>
                                    <AvailabilityPill availability={h.availability} />
                                  </div>
                                  <div className="health-card-meta">
                                    {h.availability.url}
                                    {h.availability.statusCode && <> · HTTP {h.availability.statusCode}</>}
                                    <div>Checked: {new Date(h.availability.checkedAt).toLocaleString()}</div>
                                  </div>
                                </div>
                              )}
                              <div className="health-card">
                                <div className="health-card-header">
                                  <span>Assessment Service (DB queries)</span>
                                  <span className={`health-status-pill ${h.status}`}>{h.status}</span>
                                </div>
                                <div className="health-card-meta">
                                  {h.calls > 0 ? (
                                    <>{h.avgLatencyMs}ms avg · {h.errorRate}% error rate · {h.errors} failed requests ({h.calls} calls)</>
                                  ) : (
                                    <>No live query attempts yet</>
                                  )}
                                  {h.lastSuccessAt && <div>Last successful processing: {new Date(h.lastSuccessAt).toLocaleString()}</div>}
                                  {h.lastErrorAt && <div>Last error: {new Date(h.lastErrorAt).toLocaleString()} — {h.lastError}</div>}
                                </div>
                              </div>
                              {reportsSummary && (
                                <div className="health-card">
                                  <div className="health-card-header">
                                    <span>Report Service</span>
                                    <span className={`health-status-pill ${reportsSummary.successRate >= 95 ? 'healthy' : reportsSummary.successRate >= 80 ? 'warning' : 'critical'}`}>
                                      {reportsSummary.successRate >= 95 ? 'healthy' : reportsSummary.successRate >= 80 ? 'warning' : 'critical'}
                                    </span>
                                  </div>
                                  <div className="health-card-meta">
                                    {(reportsSummary.byTool[analyticsTool]?.generated) || 0} generated ·{' '}
                                    {(reportsSummary.byTool[analyticsTool]?.failed) || 0} failed
                                    {reportsSummary.avgGenerationTimeMs !== null && <> · {reportsSummary.avgGenerationTimeMs}ms avg</>}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Live Activity + Attention Required, scoped (doc sections 6, 15) */}
                    <div className="split-grid">
                      <div className="panel">
                        <div className="panel-header">
                          <h2>Live Activity</h2>
                        </div>
                        <TodaySnapshot activityData={activityData} />
                        {activityData.length === 0 ? (
                          <div className="trend-chart-empty">No recent activity.</div>
                        ) : (
                          <div className="activity-feed">
                            {activityData.map((event, idx) => (
                              <div className="activity-item" key={idx}>
                                <span className={`activity-dot ${event.type}`}></span>
                                <span className="activity-text">
                                  {event.type === 'assessment_completed' && (
                                    <><strong>{event.candidateName}</strong> completed {event.tool}</>
                                  )}
                                  {event.type === 'report_generated' && (
                                    <>Report generated for <strong>{event.candidateName}</strong></>
                                  )}
                                  {event.type === 'report_failed' && (
                                    <>Report generation failed for <strong>{event.candidateName}</strong></>
                                  )}
                                </span>
                                <span className="activity-time">{timeAgo(event.timestamp)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="panel">
                        <div className="panel-header">
                          <h2><AlertTriangle size={16} style={{ verticalAlign: '-2px', marginRight: '0.4rem' }} />Attention Required</h2>
                        </div>
                        {toolAlerts.length === 0 ? (
                          <div className="trend-chart-empty">Nothing flagged for this tool.</div>
                        ) : (
                          <div className="alerts-list">
                            {toolAlerts.map((alert, idx) => (
                              <div className={`alert-item ${alert.severity}`} key={idx}>
                                <div className="alert-item-body">
                                  <span>{alert.message}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        )}

        {/* VIEW: ASSESSMENT DATABASE VIEWS (db1 - db5) */}
        {currentView.startsWith('db') && (
          <div>
            <div className="header-container">
              <div className="title-area">
                <h1>{assessmentName}</h1>
                <p>Browsing and managing database answers and scoring records.</p>
              </div>
              <div className="mode-badge-wrap" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span className={`mode-badge ${assessmentMode === 'live' ? 'live' : 'mock'}`}>
                  {assessmentMode} Connection
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => { setAnalyticsTool(currentView); setCurrentView('analytics'); }}>
                  <BarChart3 size={14} /> View Analytics
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 1rem auto', animation: 'spin 1s linear infinite' }} />
                Fetching candidates database...
              </div>
            ) : (
              <div className="table-section">
                <div className="table-header">
                  <div className="search-bar">
                    <Search size={18} color="var(--text-muted)" />
                    <input
                      type="text"
                      placeholder="Search candidates by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Showing {filteredCandidates.length} of {candidates.length} records
                  </div>
                </div>

                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Candidate Name</th>
                        <th>Email Address</th>
                        <th>Phone Number</th>
                        <th>Submission Date</th>
                        <th>Assessment Score</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidates.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            No candidates found matching filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredCandidates.map(c => {
                          const scorePct = Math.round((c.score / c.maxScore) * 100);
                          return (
                            <tr key={c.id} onClick={() => handleSelectCandidate(c)}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
                                  <User size={16} color="var(--accent-primary)" /> {c.name}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                                  <Mail size={14} /> {c.email}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                                  <Phone size={14} /> {c.phone || 'N/A'}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                                  <Calendar size={14} /> {new Date(c.testDate).toLocaleDateString()}
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '700' }}>
                                  {c.score} / {c.maxScore}
                                </div>
                              </td>
                              <td>
                                <span className={`score-badge ${getScoreClass(c.score, c.maxScore)}`}>
                                  {scorePct}% ({scorePct >= 60 ? 'Passed' : 'Review Required'})
                                </span>
                              </td>
                              <td>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadPdf(c.id, c.name);
                                  }}
                                  disabled={pdfLoading}
                                >
                                  <Download size={14} /> PDF
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: SETTINGS */}
        {currentView === 'settings' && (
          <div>
            <div className="header-container">
              <div className="title-area">
                <h1>Supabase Connection Manager</h1>
                <p>Provide API keys to dynamically link this portal to your 5 live Supabase projects.</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={resetAllConfigs}>
                Reset to Defaults
              </button>
            </div>

            <div className="config-grid">
              {dbStatuses && Object.keys(dbStatuses).map(dbId => (
                <div className="config-card" key={dbId}>
                  <div className="config-header">
                    <h3>{dbStatuses[dbId].name}</h3>
                    <span className={`mode-badge ${dbStatuses[dbId].connectionOk ? 'live' : 'mock'}`}>
                      {dbStatuses[dbId].mode}
                    </span>
                  </div>

                  <div className="form-group">
                    <label>Supabase Project URL</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="https://xxxxxx.supabase.co"
                      value={configForms[dbId].url}
                      onChange={(e) => handleConfigChange(dbId, 'url', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Supabase Anon Key or Service Role Key</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      value={configForms[dbId].key}
                      onChange={(e) => handleConfigChange(dbId, 'key', e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem' }}>
                    <div style={{ fontSize: '0.85rem' }}>
                      {saveMessages[dbId] && (
                        <span style={{ color: saveMessages[dbId].type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                          {saveMessages[dbId].text}
                        </span>
                      )}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => saveConfig(dbId)}>
                      Connect Database
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* CANDIDATE DETAILS DRAWER SLIDE-OUT */}
      {selectedCandidate && (
        <div className="details-drawer-overlay" onClick={() => setSelectedCandidate(null)}>
          <div className="details-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>Assessment Details</h2>
              <button className="close-btn" onClick={() => setSelectedCandidate(null)}>
                <X size={24} />
              </button>
            </div>

            <div className="drawer-content">
              {detailsLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 1rem auto', animation: 'spin 1s linear infinite' }} />
                  Fetching candidate responses...
                </div>
              ) : (
                candidateDetails && (
                  <div>
                    <div className="candidate-profile-summary">
                      <div className="profile-info">
                        <h3>{candidateDetails.personalInfo.name}</h3>
                        <p>{candidateDetails.personalInfo.email}</p>
                        <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          Taken on {new Date(candidateDetails.personalInfo.testDate).toLocaleString()}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)' }}>AGGREGATE SCORE</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent-success)' }}>
                          {candidateDetails.personalInfo.score} / {candidateDetails.personalInfo.maxScore}
                        </div>
                        <button
                          className="btn btn-success btn-sm"
                          style={{ marginTop: '0.5rem' }}
                          onClick={() => downloadPdf(selectedCandidate.id, selectedCandidate.name)}
                          disabled={pdfLoading}
                        >
                          <Download size={14} /> Download PDF
                        </button>
                      </div>
                    </div>

                    {candidateDetails.aiProfile && (candidateDetails.aiProfile.profileName || candidateDetails.aiProfile.narrative) && (
                      <div className="ai-profile-card">
                        <div className="ai-profile-header">
                          <div>
                            <h4 style={{ marginBottom: '0.15rem' }}>{candidateDetails.aiProfile.profileName || 'AI Profile'}</h4>
                            {candidateDetails.aiProfile.personaType && (
                              <span className="ai-profile-tag">{candidateDetails.aiProfile.personaType}</span>
                            )}
                          </div>
                        </div>

                        {candidateDetails.aiProfile.narrative && (
                          <p className="ai-profile-narrative">{candidateDetails.aiProfile.narrative}</p>
                        )}

                        {candidateDetails.aiProfile.keyInsight && (
                          <div className="ai-profile-key-insight">
                            <strong>Key Insight:</strong> {candidateDetails.aiProfile.keyInsight}
                          </div>
                        )}

                        <div className="ai-profile-columns">
                          {candidateDetails.aiProfile.strengths && (
                            <div className="ai-profile-col">
                              <div className="ai-profile-col-title strengths">Strengths</div>
                              <ul className="ai-profile-list">
                                {(Array.isArray(candidateDetails.aiProfile.strengths)
                                  ? candidateDetails.aiProfile.strengths
                                  : [candidateDetails.aiProfile.strengths]
                                ).map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                          {candidateDetails.aiProfile.blindSpots && (
                            <div className="ai-profile-col">
                              <div className="ai-profile-col-title blindspots">Blind Spots</div>
                              <ul className="ai-profile-list">
                                {(Array.isArray(candidateDetails.aiProfile.blindSpots)
                                  ? candidateDetails.aiProfile.blindSpots
                                  : [candidateDetails.aiProfile.blindSpots]
                                ).map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>

                        {candidateDetails.aiProfile.improvements && (
                          <div className="ai-profile-col" style={{ marginTop: '0.75rem' }}>
                            <div className="ai-profile-col-title improvements">Improvement Areas</div>
                            <ul className="ai-profile-list">
                              {(Array.isArray(candidateDetails.aiProfile.improvements)
                                ? candidateDetails.aiProfile.improvements
                                : [candidateDetails.aiProfile.improvements]
                              ).map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Test Questions & Answers</h4>
                    <div className="question-list">
                      {candidateDetails.results.map((item, index) => {
                        const isCorrect = item.score > 0 && item.score === item.maxScore;
                        return (
                          <div className="question-item" key={index}>
                            <div className="question-text">
                              Q{index + 1}: {item.question}
                            </div>
                            <pre className="answer-text">
                              {item.answer}
                            </pre>
                            <div className={`question-score-row ${isCorrect ? 'correct' : 'incorrect'}`}>
                              Points awarded: {item.score} / {item.maxScore}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;