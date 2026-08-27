const { createClient } = require('@supabase/supabase-js');

/**
 * DB5 Adapter: Venture Risk Assessment
 * Maps to the:
 * - assessments table (id, user_id, score, rating, domain_scores, flags, polycrisis_triggered, high_risk_count, created_at)
 * - users table (id, name, email, company_name, stage, vertical, uses_ai, physical_product)
 * - pdf_reports table (assessment_id, user_email, public_url)
 */

const TABLES = {
  ASSESSMENTS: 'assessments',
  USERS: 'users',
  PDF_REPORTS: 'pdf_reports'
};

/**
 * Fetch all risk assessments from DB5
 */
async function getCandidates(supabase) {
  // Join query linking assessments to users
  const { data: assessments, error } = await supabase
    .from(TABLES.ASSESSMENTS)
    .select('id, score, created_at, users (name, email)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return assessments.map(item => {
    const user = item.users || {};
    const score = item.score !== null ? parseInt(item.score) : 0;

    return {
      id: String(item.id),
      name: user.name || 'Anonymous User',
      email: user.email || 'No Email',
      phone: 'N/A',
      testDate: item.created_at,
      score: score,
      maxScore: 100
    };
  });
}

/**
 * Fetch details & risk breakdown report
 */
async function getCandidateDetails(supabase, candidateId) {
  // 1. Fetch the main assessment and its linked user
  const { data: assessment, error } = await supabase
    .from(TABLES.ASSESSMENTS)
    .select('*, users (*)')
    .eq('id', parseInt(candidateId))
    .single();

  if (error) throw error;

  const user = assessment.users || {};
  const score = assessment.score !== null ? parseInt(assessment.score) : 0;
  const userEmail = user.email || '';

  // 2. Fetch any corresponding PDF report for this assessment or user
  let pdfUrl = null;
  if (userEmail) {
    try {
      // 2a. Try to query by assessment_id first (exact integer match)
      let { data: pdfReports, error: pdfError } = await supabase
        .from(TABLES.PDF_REPORTS)
        .select('public_url')
        .eq('assessment_id', parseInt(candidateId))
        .order('created_at', { ascending: false })
        .limit(1);

      // 2b. Fallback to case-insensitive email matching if assessment_id matches nothing
      if (pdfError || !pdfReports || pdfReports.length === 0) {
        const { data: emailReports, error: emailError } = await supabase
          .from(TABLES.PDF_REPORTS)
          .select('public_url')
          .ilike('user_email', userEmail)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!emailError && emailReports && emailReports.length > 0) {
          pdfReports = emailReports;
        }
      }

      if (pdfReports && pdfReports.length > 0) {
        pdfUrl = pdfReports[0].public_url;
      }
    } catch (err) {
      console.warn('Could not query pdf_reports table in database 5:', err.message);
    }
  }

  // Format domain scores for readable display
  let domainBreakdown = 'No domain scores recorded.';
  if (assessment.domain_scores && typeof assessment.domain_scores === 'object') {
    domainBreakdown = Object.entries(assessment.domain_scores)
      .map(([domain, val]) => {
        const readableDomain = domain.replace(/_/g, ' ').toUpperCase();
        return `${readableDomain}: ${Math.round(val)}%`;
      })
      .join('\n');
  }

  // Format system violations / flags
  let flagsText = 'No flags triggered.';
  if (Array.isArray(assessment.flags) && assessment.flags.length > 0) {
    flagsText = assessment.flags
      .map(flag => {
        return `[${flag.type || 'FLAG'}] Domain: ${(flag.domain || '').toUpperCase()} | Penalty: -${flag.penalty || 0} pts\nTrigger: ${flag.trigger || 'N/A'}`;
      })
      .join('\n\n');
  }

  const resultsList = [
    {
      question: "Venture Profile & Product Details",
      answer: `Company Name: ${user.company_name || 'N/A'}\nStage: ${user.stage || 'N/A'}\nVertical: ${user.vertical || 'N/A'}\nUses AI: ${user.uses_ai ? 'Yes' : 'No'}\nPhysical Product: ${user.physical_product ? 'Yes' : 'No'}`,
      score: null,
      maxScore: null
    },
    {
      question: "Overall Risk Rating & Crisis Indicators",
      answer: `Overall Risk Score: ${score}/100\nRisk Rating: ${assessment.rating || 'N/A'}\nPolycrisis Triggered: ${assessment.polycrisis_triggered ? 'Yes' : 'No'}\nHigh Risk Count: ${assessment.high_risk_count || '0'}`,
      score: score,
      maxScore: 100
    },
    {
      question: "Domain Scores Breakdown",
      answer: domainBreakdown,
      score: null,
      maxScore: null
    },
    {
      question: "System Warnings & Penalties (AI Flags)",
      answer: flagsText,
      score: null,
      maxScore: null
    }
  ];

  return {
    personalInfo: {
      id: String(assessment.id),
      name: user.name || 'Anonymous User',
      email: userEmail,
      testDate: assessment.created_at,
      score: score,
      maxScore: 100,
      sessionId: String(assessment.id),
      pdfUrl: pdfUrl // Pre-generated PDF link from storage
    },
    results: resultsList
  };
}

/**
 * Generate Mock Candidates
 */
function getMockCandidates() {
  return [
    { id: 'db5-cand-1', name: 'Abhishek (infopace)', email: 'abhi@gmail.com', phone: 'N/A', testDate: '2026-04-19T18:10:52Z', score: 45, maxScore: 100 },
    { id: 'db5-cand-2', name: 'Harshika (Acme Corp)', email: 'harshika@gmail.com', phone: 'N/A', testDate: '2026-04-20T04:34:44Z', score: 46, maxScore: 100 },
    { id: 'db5-cand-3', name: 'Venu (BetaTech)', email: 'venu@betatech.com', phone: 'N/A', testDate: '2026-07-22T08:00:00Z', score: 78, maxScore: 100 }
  ];
}

/**
 * Generate Mock Candidate Details
 */
function getMockCandidateDetails(candidateId) {
  const candidates = getMockCandidates();
  const personalInfo = candidates.find(c => c.id === candidateId) || candidates[0];

  const resultsList = [
    {
      question: "Venture Profile & Product Details",
      answer: `Company Name: Infopace Systems\nStage: Early Stage\nVertical: SaaS\nUses AI: Yes\nPhysical Product: No`,
      score: null,
      maxScore: null
    },
    {
      question: "Overall Risk Rating & Crisis Indicators",
      answer: `Overall Risk Score: ${personalInfo.score}/100\nRisk Rating: MODERATE\nPolycrisis Triggered: No\nHigh Risk Count: 2`,
      score: personalInfo.score,
      maxScore: 100
    },
    {
      question: "Domain Scores Breakdown",
      answer: "FINANCIAL: 36%\nCYBERSECURITY: 46%\nOPERATIONAL: 36%\nStrategic: 26%\nCOMPLIANCE: 30%",
      score: null,
      maxScore: null
    },
    {
      question: "System Warnings & Penalties (AI Flags)",
      answer: "[CRITICAL] Domain: FINANCIAL | Penalty: -50 pts\nTrigger: Critical minimum score: 1\n\n[ORANGE] Domain: OPERATIONAL | Penalty: -30 pts\nTrigger: Multiple low scores (2 below 2)",
      score: null,
      maxScore: null
    }
  ];

  return {
    personalInfo,
    results: resultsList
  };
}

/**
 * User + organization monitoring (Phase 5).
 * NOTE: the schema-audit script only inspected the "assessments" table
 * directly, so it correctly reported no org column THERE — but this
 * adapter's own getCandidates() already joins a "users" table that (per
 * the header comment above) has a company_name field. That join makes
 * org breakdown possible here too, contingent on company_name actually
 * being populated — verify with a quick row count before relying on it.
 */
async function getUserBreakdown(supabase) {
  const { data, error } = await supabase
    .from(TABLES.ASSESSMENTS)
    .select('user_id, score, created_at, users (name, email)');

  if (error) throw error;

  const userMap = {};
  data.forEach(row => {
    const key = row.user_id || (row.users && row.users.email) || 'Unknown';
    if (!userMap[key]) {
      userMap[key] = { userId: key, name: (row.users && row.users.name) || 'Unknown', attempts: 0, scoreSum: 0, lastActivity: null };
    }
    userMap[key].attempts++;
    userMap[key].scoreSum += (row.score || 0);
    if (row.created_at) {
      const d = new Date(row.created_at);
      if (!userMap[key].lastActivity || d > new Date(userMap[key].lastActivity)) {
        userMap[key].lastActivity = row.created_at;
      }
    }
  });

  const users = Object.values(userMap);
  return {
    totalUniqueUsers: users.length,
    averageAttemptsPerUser: users.length > 0
      ? Math.round((users.reduce((s, u) => s + u.attempts, 0) / users.length) * 10) / 10
      : 0,
    users: users.map(u => ({
      userId: u.userId,
      name: u.name,
      attempts: u.attempts,
      averageScore: Math.round(u.scoreSum / u.attempts),
      lastActivity: u.lastActivity
    })).sort((a, b) => b.attempts - a.attempts)
  };
}

async function getOrgBreakdown(supabase) {
  const { data, error } = await supabase
    .from(TABLES.ASSESSMENTS)
    .select('score, created_at, users (company_name)');

  if (error) throw error;

  const orgMap = {};
  let unpopulatedCount = 0;
  data.forEach(row => {
    const companyName = row.users && row.users.company_name;
    if (!companyName) unpopulatedCount++;
    const key = companyName || 'Unassigned';
    if (!orgMap[key]) {
      orgMap[key] = { organization: key, totalAssessments: 0, scoreSum: 0, lastActivity: null };
    }
    orgMap[key].totalAssessments++;
    orgMap[key].scoreSum += (row.score || 0);
    if (row.created_at) {
      const d = new Date(row.created_at);
      if (!orgMap[key].lastActivity || d > new Date(orgMap[key].lastActivity)) {
        orgMap[key].lastActivity = row.created_at;
      }
    }
  });

  if (unpopulatedCount === data.length && data.length > 0) {
    console.warn('db5 getOrgBreakdown: company_name is empty on every row — org monitoring not usable until users.company_name is actually populated.');
  }

  return Object.values(orgMap).map(org => ({
    organization: org.organization,
    totalAssessments: org.totalAssessments,
    averageScore: Math.round(org.scoreSum / org.totalAssessments),
    lastActivity: org.lastActivity
  })).sort((a, b) => b.totalAssessments - a.totalAssessments);
}

module.exports = {
  getCandidates,
  getCandidateDetails,
  getMockCandidates,
  getMockCandidateDetails,
  getUserBreakdown,
  getOrgBreakdown,
  metadata: {
    name: 'Venture Risk Assessment',
    description: 'Evaluates operational, financial, cyber, strategic, and compliance risks, calculating domain stress scores and flagging potential crisis areas.'
  }
};