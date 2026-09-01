/**
 * Shared helper: builds a repeat-assessment retention cohort from raw rows.
 * Used by adapters whose schema has a stable user id (db1, db5 today).
 *
 * Definition: for each user with >=1 completed row, did they come back for
 * ANOTHER completed row within 1 / 7 / 30 days of their FIRST completion?
 * This measures repeat assessment-taking, not login/session retention —
 * there is no session data in any adapter's schema to measure that.
 */
function buildRetentionCohort(rows, idField, dateField) {
  const byUser = {};
  (rows || []).forEach(row => {
    const id = row[idField];
    const rawDate = row[dateField];
    if (!id || !rawDate) return;
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return;
    (byUser[id] = byUser[id] || []).push(d);
  });

  const cohorts = Object.values(byUser);
  const totalUsers = cohorts.length;
  if (totalUsers === 0) {
    return { totalUsers: 0, d1Pct: 0, d7Pct: 0, d30Pct: 0 };
  }

  const returnedWithin = (dates, days) => {
    const sorted = [...dates].sort((a, b) => a - b);
    const first = sorted[0];
    const cutoff = new Date(first.getTime() + days * 24 * 60 * 60 * 1000);
    return sorted.some(d => d > first && d <= cutoff);
  };

  let d1 = 0, d7 = 0, d30 = 0;
  cohorts.forEach(dates => {
    if (returnedWithin(dates, 1)) d1++;
    if (returnedWithin(dates, 7)) d7++;
    if (returnedWithin(dates, 30)) d30++;
  });

  return {
    totalUsers,
    d1Pct: Math.round((d1 / totalUsers) * 100),
    d7Pct: Math.round((d7 / totalUsers) * 100),
    d30Pct: Math.round((d30 / totalUsers) * 100)
  };
}

module.exports = { buildRetentionCohort };
