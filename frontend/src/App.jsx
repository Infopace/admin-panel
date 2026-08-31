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
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
  RadialBarChart,
  RadialBar
} from 'recharts';

const API_BASE = 'http://localhost:5000/api';

// Shared chart palette — mirrors the CSS custom properties in index.css
// (kept as literal hex here since Recharts renders raw SVG and some
// browsers don't resolve var() inside SVG presentation attributes).
const CHART_COLORS = {
  primary: '#4f46e5',
  secondary: '#0891b2',
  success: '#16a34a',
  warning: '#ea580c',
  danger: '#dc2626',
  muted: '#94a3b8'
};

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

// Custom tooltip for the trend chart — keeps the per-tool breakdown that
// hovering a day already gave admins, now driven by Recharts instead of
// hand-rolled hover state.
function TrendTooltip({ active, payload, toolNames }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const byToolEntries = point.byTool
    ? Object.entries(point.byTool).sort((a, b) => b[1] - a[1])
    : [];
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-header">
        {formatShortDate(point.date)} — {point.completed} total
      </div>
      {byToolEntries.length > 0 ? (
        <ul className="chart-tooltip-list">
          {byToolEntries.map(([dbId, count]) => (
            <li key={dbId}>
              <span>{(toolNames && toolNames[dbId]) || dbId}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <div className="chart-tooltip-empty">No activity</div>
      )}
    </div>
  );
}

// Usage trend — real area chart (Recharts) with a gradient fill. Thins out
// X-axis labels on longer ranges so dates don't collide, same rule the old
// hand-rolled version used (label every ceil(n/9) points, always show the
// last/most-recent date).
function TrendChart({ series, toolNames }) {
  if (!series || series.length === 0) {
    return <div className="trend-chart-empty">No activity data for this range.</div>;
  }

  const labelEvery = Math.max(1, Math.ceil(series.length / 9));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={series} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          interval={labelEvery - 1}
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={{ stroke: 'var(--border-color)' }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <RTooltip content={<TrendTooltip toolNames={toolNames} />} cursor={{ stroke: 'var(--border-color)' }} />
        <Area
          type="monotone"
          dataKey="completed"
          stroke={CHART_COLORS.primary}
          strokeWidth={2}
          fill="url(#trendFill)"
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Score Distribution — donut chart for Low/Medium/High. Donuts stay
// readable up to ~5 slices; 3 buckets is exactly the sweet spot.
function ScoreDistributionChart({ distribution }) {
  const data = [
    { name: 'Low', value: distribution.low, color: CHART_COLORS.danger },
    { name: 'Medium', value: distribution.medium, color: CHART_COLORS.warning },
    { name: 'High', value: distribution.high, color: CHART_COLORS.success }
  ];
  const allZero = data.every(d => d.value === 0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <div style={{ width: 160, height: 160, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={allZero ? 0 : 3}
              strokeWidth={0}
            >
              {data.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <RTooltip
              formatter={(value, name) => [`${value}%`, name]}
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="dimension-list" style={{ flex: 1, minWidth: 180 }}>
        {data.map(d => (
          <div className="dimension-row" key={d.name}>
            <span className="dimension-label">{d.name}</span>
            <div className="dimension-track">
              <div className="dimension-fill" style={{ width: `${d.value}%`, background: d.color }} />
            </div>
            <span className="dimension-value">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tool comparison — two small bar charts answering the doc's own questions
// verbatim: "which tool is used most" and "which tool has unusually
// low/high scores." Volume and score live on very different scales, so
// they're two charts rather than one dual-axis chart trying to do both.
function ToolComparisonCharts({ tools }) {
  if (!tools || tools.length === 0) return null;
  const volumeData = [...tools].sort((a, b) => b.totalTestTakers - a.totalTestTakers);
  const scoreData = [...tools].sort((a, b) => b.averageScorePercentage - a.averageScorePercentage);

  const scoreColor = (pct) => (pct >= 85 ? CHART_COLORS.success : pct >= 60 ? CHART_COLORS.warning : CHART_COLORS.danger);

  return (
    <div className="split-grid">
      <div className="panel">
        <div className="panel-header">
          <h2>Volume by Tool</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Which tool is used most</span>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(volumeData.length * 42, 120)}>
          <BarChart data={volumeData} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
            />
            <RTooltip
              formatter={(value) => [`${value} candidates`, 'Attempts']}
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="totalTestTakers" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} barSize={18}>
              <LabelList dataKey="totalTestTakers" position="right" style={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Avg Score by Tool</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Which tool scores unusually low/high</span>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(scoreData.length * 42, 120)}>
          <BarChart data={scoreData} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
            />
            <RTooltip
              formatter={(value) => [`${value}%`, 'Avg Score']}
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="averageScorePercentage" radius={[0, 4, 4, 0]} barSize={18}>
              {scoreData.map(d => <Cell key={d.id} fill={scoreColor(d.averageScorePercentage)} />)}
              <LabelList dataKey="averageScorePercentage" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Fixed per-tool palette (index-based, stable regardless of sort order) —
// used by the Overview donut + leaderboard so a tool keeps the same color
// everywhere on that page.
const TOOL_PALETTE = [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger];

// One gradient per KPI card, same 5-hue family as TOOL_PALETTE (each hue
// paired with its own darker shade) so the metric-colored KPI row and the
// tool-colored charts below it read as one palette, not two unrelated
// color systems on the same page.
const KPI_GRADIENTS = [
  'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
  'linear-gradient(135deg, #22d3ee 0%, #0e7490 100%)',
  'linear-gradient(135deg, #34d399 0%, #047857 100%)',
  'linear-gradient(135deg, #fb923c 0%, #b45309 100%)',
  'linear-gradient(135deg, #fb7185 0%, #be123c 100%)'
];

// Real weighted trend for Total Assessments only — it's a straight sum of
// per-tool volumes, and each tool already carries a genuine 7-day-vs-
// prior-7-day comparison (computeTrend on the backend), so combining them
// weighted by volume is an honest aggregate, not a fabricated number.
// Deliberately NOT reused for Average Score/Connections/Users — those
// have no time-series backing, so they get no trend badge at all rather
// than a made-up one.
function aggregateVolumeTrend(tools) {
  if (!tools || tools.length === 0) return null;
  let weightedSum = 0;
  let totalWeight = 0;
  tools.forEach(t => {
    if (t.trend && t.totalTestTakers > 0) {
      weightedSum += t.trend.changePercent * t.totalTestTakers;
      totalWeight += t.totalTestTakers;
    }
  });
  if (totalWeight === 0) return null;
  const changePercent = Math.round(weightedSum / totalWeight);
  return { direction: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat', changePercent };
}

// Colorful gradient KPI card. Trend badge only renders when `trend` is
// passed (i.e. real data exists) — no placeholder "0%" or invented arrows.
function KpiCard({ icon: Icon, gradient, label, value, sub, trend }) {
  return (
    <div className="kpi-card" style={{ background: gradient }}>
      <div className="kpi-card-icon"><Icon size={18} /></div>
      <div className="kpi-card-label">{label}</div>
      <div className="kpi-card-value">{value}</div>
      <div className="kpi-card-footer">
        {trend && (
          <span className="kpi-card-trend">
            {trend.direction === 'up' ? <TrendingUp size={12} /> : trend.direction === 'down' ? <TrendingDown size={12} /> : <Minus size={12} />}
            {Math.abs(trend.changePercent)}%
          </span>
        )}
        <span className="kpi-card-sub">{sub}</span>
      </div>
    </div>
  );
}

// Overview-only chart: composition, not comparison — "what share of all
// activity does each tool represent." Analytics' All-Tools view has no
// pie/donut at all, so this is a genuinely different question answered
// in a genuinely different chart type, not a re-skinned duplicate.
function ToolShareDonut({ tools }) {
  if (!tools || tools.length === 0) return null;
  const total = tools.reduce((sum, t) => sum + t.totalTestTakers, 0);
  const data = tools.map((t, i) => ({ id: t.id, name: t.name, value: t.totalTestTakers, color: TOOL_PALETTE[i % TOOL_PALETTE.length] }));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <div style={{ width: 150, height: 150, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2} strokeWidth={0}>
              {data.map(d => <Cell key={d.id} fill={d.color} />)}
            </Pie>
            <RTooltip
              formatter={(value, name) => [`${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`, name]}
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ flex: 1, minWidth: 170, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {data.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.82rem' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{d.name}</span>
            <strong style={{ color: 'var(--text-primary)' }}>{total > 0 ? Math.round((d.value / total) * 100) : 0}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// Overview-only chart: a compact ranked leaderboard combining volume AND
// score into one glanceable row per tool, instead of Analytics' two
// separate full-size bar-chart panels. Executive-summary style — rank,
// name, a mini inline bar, and both numbers in one line.
// Score Distribution by Tool — stacked horizontal bar chart. A new chart
// type on Overview (stacked composition per category), distinct from the
// donut (composition of one whole) and the trend area chart (time series).
// Softer, cooler 3-tone scale for this chart specifically — the standard
// red/amber/green triad read as too alarming stacked wall-to-wall across
// 5 bars. Still low-to-high ordered, just less "warning siren."
const SCORE_BAND_COLORS = { low: '#fb923c', medium: '#a78bfa', high: '#22d3ee' };

function ScoreDistributionStackedChart({ tools }) {
  if (!tools || tools.length === 0) return null;
  const data = tools.map(t => ({
    name: t.name,
    Low: t.scoreDistribution.low,
    Medium: t.scoreDistribution.medium,
    High: t.scoreDistribution.high
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(data.length * 44, 140)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="%" />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
          <RTooltip
            formatter={(value, name) => [`${value}%`, name]}
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="Low" stackId="s" fill={SCORE_BAND_COLORS.low} barSize={16} radius={[4, 0, 0, 4]} />
          <Bar dataKey="Medium" stackId="s" fill={SCORE_BAND_COLORS.medium} barSize={16} />
          <Bar dataKey="High" stackId="s" fill={SCORE_BAND_COLORS.high} barSize={16} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SCORE_BAND_COLORS.low, marginRight: '0.35rem' }} />Low</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SCORE_BAND_COLORS.medium, marginRight: '0.35rem' }} />Medium</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SCORE_BAND_COLORS.high, marginRight: '0.35rem' }} />High</span>
      </div>
    </div>
  );
}

// Average Score by Tool — radial gauge chart. A third, visually distinct
// chart form (circular progress rings) rounding out area/donut/stacked-bar.
function AvgScoreRadial({ tools }) {
  if (!tools || tools.length === 0) return null;
  const data = tools.map((t, i) => ({ name: t.name, value: t.averageScorePercentage, fill: TOOL_PALETTE[i % TOOL_PALETTE.length] }));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
      <div style={{ width: 210, height: 210, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="28%" outerRadius="100%" barSize={12} data={data} startAngle={90} endAngle={-270}>
            <RadialBar dataKey="value" background={{ fill: 'var(--bg-surface-hover)' }} cornerRadius={6} />
            <RTooltip
              formatter={(value, name, props) => [`${value}%`, props.payload.name]}
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ flex: 1, minWidth: 170, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {data.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.82rem' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.fill, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{d.name}</span>
            <strong style={{ color: 'var(--text-primary)' }}>{d.value}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_COLOR = {
  healthy: CHART_COLORS.success,
  warning: CHART_COLORS.warning,
  critical: CHART_COLORS.danger,
  mock: CHART_COLORS.muted,
  unknown: CHART_COLORS.muted
};

// Status board — a status-page-style strip (colored dot + top accent bar
// per tile) instead of text-heavy cards, so "which of N tools is red" reads
// at a glance rather than requiring you to read every card.
function StatusGrid({ healthData }) {
  if (!healthData) return null;
  return (
    <div className="status-board">
      {Object.keys(healthData).map(dbId => {
        const h = healthData[dbId];
        const color = STATUS_COLOR[h.status] || CHART_COLORS.muted;
        return (
          <div className="status-tile" key={dbId} style={{ borderTopColor: color }}>
            <div className="status-tile-top">
              <span className="status-tile-dot" style={{ background: color, boxShadow: `0 0 0 4px ${color}22` }} />
              <span className="status-tile-name">{h.name}</span>
            </div>
            <div className="status-tile-meta">
              {h.calls > 0 ? `${h.avgLatencyMs}ms avg · ${h.errorRate}% errors` : 'No live queries yet'}
            </div>
            <div className="status-tile-footer">
              <span className={`health-status-pill ${h.status}`}>{h.status}</span>
              <AvailabilityPill availability={h.availability} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Overview-only: a slim single-row status strip (dot + name only) instead
// of Analytics' full status-card grid — enough to see "is everything green"
// at a glance without the per-card latency/error detail, which belongs on
// the deeper Analytics page, not the summary one.
function StatusStrip({ healthData }) {
  if (!healthData) return null;
  return (
    <div className="status-strip">
      {Object.keys(healthData).map(dbId => {
        const h = healthData[dbId];
        const color = STATUS_COLOR[h.status] || CHART_COLORS.muted;
        const StatusIcon = h.status === 'healthy' ? Check : h.status === 'critical' ? AlertTriangle : h.status === 'warning' ? AlertCircle : HeartPulse;
        return (
          <div className="status-chip" key={dbId}>
            <span className="status-chip-icon" style={{ background: color }}><StatusIcon size={12} /></span>
            <span className="status-chip-name">{h.name}</span>
            <span className="status-chip-status" style={{ color }}>{h.status}</span>
          </div>
        );
      })}
    </div>
  );
}

// A small colored circle around a panel-header icon — the "icon badge"
// visual language carried through from the KPI cards, so headers don't
// revert to plain black icons once you scroll past the top row.
function PanelIconBadge({ icon: Icon, color }) {
  return (
    <span className="panel-icon-badge" style={{ background: color }}>
      <Icon size={13} />
    </span>
  );
}

const SEVERITY_COLOR = { critical: CHART_COLORS.danger, warning: CHART_COLORS.warning, info: CHART_COLORS.secondary, ok: CHART_COLORS.success };

// Overview-only alert row — a colored severity icon instead of relying
// only on background tint, matching the icon-badge language used
// everywhere else on this page. Analytics keeps its own plain alert-item
// style untouched.
function AlertRow({ alert }) {
  const color = SEVERITY_COLOR[alert.severity] || CHART_COLORS.muted;
  return (
    <div className="alert-row">
      <span className="alert-row-icon" style={{ background: color }}><AlertTriangle size={13} /></span>
      <div className="alert-row-body">
        {alert.tool && <strong>{alert.tool}</strong>}
        <span>{alert.message}</span>
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
  // Category filter — narrows the tool dropdown to one category
  // (e.g. AI Assessment, Psychometric) instead of listing every tool as
  // its own tab. 'all' shows every tool in the dropdown, ungrouped.
  const [analyticsCategory, setAnalyticsCategory] = useState('all');

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
  // fetched whenever Analytics OR the Overview dashboard is open — Overview
  // shows a condensed version of the same charts, so it needs the same data.
  useEffect(() => {
    if (!token || (currentView !== 'analytics' && currentView !== 'overview')) return;
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

  // Usage trend — scoped to the selected tool on Analytics, always
  // company-wide on the Overview dashboard.
  useEffect(() => {
    if (!token || (currentView !== 'analytics' && currentView !== 'overview')) return;
    const fetchTrend = async () => {
      setTrendLoading(true);
      try {
        const scopedTool = currentView === 'analytics' ? analyticsTool : 'all';
        const dbParam = scopedTool !== 'all' ? `&dbId=${scopedTool}` : '';
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

        {/* VIEW: OVERVIEW — the 30-second glance: condensed KPIs + charts,
            reusing the same components as Analytics. Full depth (12-column
            table, live activity feed, org/user/dimension breakdowns) stays
            on Analytics only — this page is summary + click-through. */}
        {currentView === 'overview' && (
          <div>
            <div className="header-container">
              <div className="title-area">
                <h1>Overview Portal</h1>
                <p>Company-wide snapshot across all 5 tools — see Analytics for full monitoring.</p>
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
              <>
                {/* Top KPI strip — colorful gradient cards, 5 most important
                    numbers. Trend badge only on Total Assessments, the one
                    metric with real day-over-day data behind it. */}
                {summaryData && (
                  <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
                    <KpiCard
                      icon={BarChart3}
                      gradient={KPI_GRADIENTS[0]}
                      label="Total Assessments"
                      value={summaryData.totalAssessments}
                      sub="Across all tools"
                      trend={aggregateVolumeTrend(overviewData)}
                    />
                    <KpiCard
                      icon={Award}
                      gradient={KPI_GRADIENTS[1]}
                      label="Average Score"
                      value={`${summaryData.averageScorePercentage}%`}
                      sub="Weighted across tools"
                    />
                    <KpiCard
                      icon={Database}
                      gradient={KPI_GRADIENTS[2]}
                      label="Live Connections"
                      value={`${summaryData.liveToolsCount} / ${summaryData.totalTools}`}
                      sub={`${summaryData.mockToolsCount} using mock data`}
                    />
                    <KpiCard
                      icon={FileCheck2}
                      gradient={KPI_GRADIENTS[3]}
                      label="Reports Generated"
                      value={reportsSummary ? reportsSummary.totalGenerated : '—'}
                      sub={reportsSummary ? `${reportsSummary.successRate}% success rate` : 'Loading...'}
                    />
                    <KpiCard
                      icon={User}
                      gradient={KPI_GRADIENTS[4]}
                      label="Active Users"
                      value={entitySummary ? entitySummary.totalUsers : '—'}
                      sub="Across live-connected tools"
                    />
                  </div>
                )}

                {/* Trend + tool-share donut, side by side — two different
                    "big picture" questions (direction over time, and
                    composition right now), not stacked full-width like
                    Analytics does for the trend alone. */}
                <div className="split-grid">
                  <div className="panel">
                    <div className="panel-header">
                      <h2><PanelIconBadge icon={TrendingUp} color={CHART_COLORS.primary} />Assessment Activity Trend</h2>
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

                  <div className="panel">
                    <div className="panel-header">
                      <h2><PanelIconBadge icon={Database} color={CHART_COLORS.secondary} />Share of Assessments</h2>
                    </div>
                    <ToolShareDonut tools={overviewData} />
                  </div>
                </div>

                {/* Score composition (stacked bar) + Avg Score (radial gauge) —
                    two more chart forms, side by side */}
                <div className="split-grid">
                  <div className="panel">
                    <div className="panel-header">
                      <h2><PanelIconBadge icon={BarChart3} color={CHART_COLORS.warning} />Score Composition by Tool</h2>
                    </div>
                    <ScoreDistributionStackedChart tools={overviewData} />
                  </div>

                  <div className="panel">
                    <div className="panel-header">
                      <h2><PanelIconBadge icon={Award} color={CHART_COLORS.danger} />Average Score</h2>
                    </div>
                    <AvgScoreRadial tools={overviewData} />
                  </div>
                </div>

                {/* Attention Required */}
                <div className="panel">
                  <div className="panel-header">
                    <h2><PanelIconBadge icon={AlertTriangle} color={CHART_COLORS.warning} />Attention Required</h2>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setAnalyticsTool('all'); setCurrentView('analytics'); }}>
                      View All
                    </button>
                  </div>
                  <div className="alerts-list">
                    {alertsData.slice(0, 4).map((alert, idx) => <AlertRow alert={alert} key={idx} />)}
                    {alertsData.length === 0 && <div className="trend-chart-empty">Loading alerts...</div>}
                  </div>
                </div>

                {/* Slim system-status strip — full detail lives on Analytics */}
                <div className="panel">
                  <div className="panel-header">
                    <h2><PanelIconBadge icon={HeartPulse} color={CHART_COLORS.success} />System Status</h2>
                  </div>
                  <StatusStrip healthData={healthData} />
                </div>

                {/* Per-tool cards — click through to manage candidates */}
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Tools</h2>
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
                      <div className="stat-icon" style={{ background: TOOL_PALETTE[idx % TOOL_PALETTE.length] }}>
                        <Database size={17} color="#ffffff" />
                      </div>
                      <div style={{ position: 'absolute', bottom: 10, right: 15 }}>
                        <span className={`score-badge ${getScoreClass(item.averageScorePercentage, 100)}`} style={{ fontSize: '0.7rem' }}>
                          Avg: {item.averageScorePercentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
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
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="range-tabs" style={{ flexWrap: 'wrap' }}>
                  <button
                    className={`range-tab ${analyticsTool === 'all' ? 'active' : ''}`}
                    onClick={() => { setAnalyticsCategory('all'); setAnalyticsTool('all'); }}
                  >
                    All Tools
                  </button>
                  {Array.from(new Set(overviewData.map(t => t.category || 'Uncategorized'))).map(cat => (
                    <button
                      key={cat}
                      className={`range-tab ${analyticsCategory === cat ? 'active' : ''}`}
                      onClick={() => {
                        setAnalyticsCategory(cat);
                        const firstInCategory = overviewData.find(t => (t.category || 'Uncategorized') === cat);
                        if (firstInCategory) setAnalyticsTool(firstInCategory.id);
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {analyticsCategory !== 'all' && (
                  <select
                    className="tool-select"
                    style={{ minWidth: 220 }}
                    value={analyticsTool}
                    onChange={(e) => setAnalyticsTool(e.target.value)}
                  >
                    {overviewData
                      .filter(t => (t.category || 'Uncategorized') === analyticsCategory)
                      .map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                  </select>
                )}
              </div>
            </div>

            {analyticsTool === 'all' ? (
              <>
                {/* Master KPI Cards (doc section 1) — same gradient-card
                    language as Overview, cycling the same 5-hue palette
                    across 9 cards. Trend badge only where real, same rule
                    as Overview's KPI row. */}
                {summaryData && (
                  <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
                    <KpiCard icon={BarChart3} gradient={KPI_GRADIENTS[0]} label="Total / Completed Assessments" value={summaryData.totalAssessments} sub="Across all tools — completed only" trend={aggregateVolumeTrend(overviewData)} />
                    <KpiCard icon={Award} gradient={KPI_GRADIENTS[1]} label="Average Score" value={`${summaryData.averageScorePercentage}%`} sub="Weighted across tools" />
                    <KpiCard icon={Database} gradient={KPI_GRADIENTS[2]} label="Live Connections" value={`${summaryData.liveToolsCount} / ${summaryData.totalTools}`} sub={`${summaryData.mockToolsCount} using mock data`} />
                    <KpiCard icon={FileCheck2} gradient={KPI_GRADIENTS[3]} label="Reports Generated" value={reportsSummary ? reportsSummary.totalGenerated : '—'} sub={reportsSummary ? `${reportsSummary.successRate}% success rate` : 'Loading...'} />
                    <KpiCard icon={RefreshCw} gradient={KPI_GRADIENTS[4]} label="Reports Pending" value={0} sub="Always 0 — generated synchronously, no queue exists" />
                    <KpiCard icon={User} gradient={KPI_GRADIENTS[0]} label="Active Users" value={entitySummary ? entitySummary.totalUsers : '—'} sub="Across live-connected tools" />
                    <KpiCard icon={BookOpen} gradient={KPI_GRADIENTS[1]} label="Active Organizations" value={entitySummary ? entitySummary.totalOrganizations : '—'} sub="Across live-connected tools" />
                    <KpiCard icon={AlertCircle} gradient={KPI_GRADIENTS[2]} label="Failed Requests" value={healthData ? Object.values(healthData).reduce((sum, h) => sum + h.errors, 0) : '—'} sub="DB query errors, not assessment failures" />
                    <KpiCard icon={Calendar} gradient={KPI_GRADIENTS[3]} label="Last Activity" value={<span style={{ fontSize: '1.15rem' }}>{summaryData.lastActivity ? new Date(summaryData.lastActivity).toLocaleString() : 'No activity yet'}</span>} sub="Most recent across tools" />
                  </div>
                )}

                {/* Usage Activity Trend (doc section 3) */}
                <div className="panel">
                  <div className="panel-header">
                    <h2><PanelIconBadge icon={TrendingUp} color={CHART_COLORS.primary} />Assessment Activity Trend</h2>
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

                {/* Volume + Score comparison across tools (doc section 2's
                    "which tool is used most / scores unusually low or high") */}
                <ToolComparisonCharts tools={overviewData} />

                {/* Tool-wise Monitoring (doc section 2) */}
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}><PanelIconBadge icon={BarChart3} color={CHART_COLORS.secondary} />Tool-wise Monitoring</h2>
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
                            <tr key={item.id} onClick={() => { setAnalyticsCategory(item.category || 'Uncategorized'); setAnalyticsTool(item.id); }}>
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
                      <h2><PanelIconBadge icon={RefreshCw} color={CHART_COLORS.secondary} />Live Activity</h2>
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
                      <h2><PanelIconBadge icon={AlertTriangle} color={CHART_COLORS.warning} />Attention Required</h2>
                    </div>
                    <div className="alerts-list">
                      {alertsData.map((alert, idx) => <AlertRow alert={alert} key={idx} />)}
                    </div>
                  </div>
                </div>

                {/* System / Health Monitoring (doc section 14) */}
                <div className="panel">
                  <div className="panel-header">
                    <h2><PanelIconBadge icon={HeartPulse} color={CHART_COLORS.success} />System Health</h2>
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
                  <StatusGrid healthData={healthData} />
                </div>

                {/* Organizations / Users / Reports summary row (doc section 16) */}
                {entitySummary && (
                  <div className="kpi-grid">
                    <KpiCard icon={BookOpen} gradient={KPI_GRADIENTS[1]} label="Organizations" value={entitySummary.totalOrganizations} sub="Across live-connected tools" />
                    <KpiCard icon={User} gradient={KPI_GRADIENTS[4]} label="Users" value={entitySummary.totalUsers} sub="Across live-connected tools" />
                    <KpiCard icon={FileCheck2} gradient={KPI_GRADIENTS[2]} label="Reports" value={entitySummary.totalReports} sub="Successfully generated" />
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
                          <h2><PanelIconBadge icon={Database} color={TOOL_PALETTE[Math.max(overviewData.findIndex(t => t.id === analyticsTool), 0) % TOOL_PALETTE.length]} />{tool.name}</h2>
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
                          <h2><PanelIconBadge icon={Award} color={CHART_COLORS.danger} />Score Distribution</h2>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Min {tool.minScorePercentage}% · Max {tool.maxScorePercentage}%
                          </span>
                        </div>
                        <ScoreDistributionChart distribution={tool.scoreDistribution} />
                      </div>
                    )}

                    {/* Tool Usage Monitor, scoped (doc section 3) */}
                    <div className="panel">
                      <div className="panel-header">
                        <h2><PanelIconBadge icon={TrendingUp} color={CHART_COLORS.primary} />Activity Trend</h2>
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
                          <h2><PanelIconBadge icon={BarChart3} color={CHART_COLORS.warning} />Tool Dimensions</h2>
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
                          <h2><PanelIconBadge icon={FileCheck2} color={CHART_COLORS.success} />Payment Monitoring</h2>
                        </div>
                        <div className="kpi-grid" style={{ marginBottom: 0 }}>
                          <KpiCard icon={Check} gradient={KPI_GRADIENTS[2]} label="Paid" value={paymentData.paidCount} sub={`${paymentData.paymentRate}% conversion`} />
                          <KpiCard icon={AlertCircle} gradient={KPI_GRADIENTS[3]} label="Unpaid" value={paymentData.unpaidCount} sub="Not yet converted" />
                          {paymentData.hasRevenueAmount && (
                            <KpiCard icon={FileCheck2} gradient={KPI_GRADIENTS[0]} label="Total Revenue" value={`₹${paymentData.totalRevenue.toLocaleString()}`} sub="From paid records" />
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
                              <h2><PanelIconBadge icon={BookOpen} color={CHART_COLORS.secondary} />Organization Monitoring</h2>
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
                              <h2><PanelIconBadge icon={User} color={CHART_COLORS.primary} />User Monitoring</h2>
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
                          <h2><PanelIconBadge icon={HeartPulse} color={CHART_COLORS.success} />System Health</h2>
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
                          <h2><PanelIconBadge icon={RefreshCw} color={CHART_COLORS.secondary} />Live Activity</h2>
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
                          <h2><PanelIconBadge icon={AlertTriangle} color={CHART_COLORS.warning} />Attention Required</h2>
                        </div>
                        {toolAlerts.length === 0 ? (
                          <div className="trend-chart-empty">Nothing flagged for this tool.</div>
                        ) : (
                          <div className="alerts-list">
                            {toolAlerts.map((alert, idx) => <AlertRow alert={alert} key={idx} />)}
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
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  const tool = overviewData.find(t => t.id === currentView);
                  setAnalyticsCategory((tool && tool.category) || 'Uncategorized');
                  setAnalyticsTool(currentView);
                  setCurrentView('analytics');
                }}>
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