const { createClient } = require('@supabase/supabase-js');

/**
 * DB3 Adapter: Market & Competitor Analysis
 * Maps to the:
 * - research_submissions table
 */

const TABLES = {
  SUBMISSIONS: 'research_submissions'
};

/**
 * Fetch all research submissions from DB3
 */
async function getCandidates(supabase) {
  const { data: submissions, error } = await supabase
    .from(TABLES.SUBMISSIONS)
    .select('id, name, email, phone, ai_stars, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return submissions.map(item => {
    // Score is ai_stars (typically out of 5.0)
    const score = item.ai_stars !== null ? parseFloat(item.ai_stars) : 0.0;

    return {
      id: String(item.id),
      name: item.name || 'Anonymous Submission',
      email: item.email || 'No Email',
      phone: item.phone || 'N/A',
      testDate: item.created_at,
      score: score,
      maxScore: 5.0
    };
  });
}

/**
 * Fetch details & structured analysis report
 */
async function getCandidateDetails(supabase, candidateId) {
  const { data: submission, error } = await supabase
    .from(TABLES.SUBMISSIONS)
    .select('*')
    .eq('id', parseInt(candidateId))
    .single();

  if (error) throw error;

  const score = submission.ai_stars !== null ? parseFloat(submission.ai_stars) : 0.0;

  // Build a highly descriptive results list from the submission fields
  const resultsList = [
    {
      question: "Business Concept & Industry",
      answer: `Company Name: ${submission.company_name || 'N/A'}\nService/Product: ${submission.service || 'N/A'}\nIndustry Segment: ${submission.industry || 'N/A'}`,
      score: null,
      maxScore: null
    },
    {
      question: "Problem Statement & Target Customer",
      answer: `Problem Solved: ${submission.problem || 'N/A'}\nTarget Customer Segment: ${submission.target_customer || 'N/A'}\nGeography: ${submission.geography || 'N/A'}`,
      score: null,
      maxScore: null
    },
    {
      question: "TAM (Total Addressable Market) Analysis",
      answer: `Self TAM Estimate: ${submission.tam_estimate || 'N/A'}\nAI Estimated TAM: ${submission.ai_tam || 'N/A'}\nAI Estimated Customers: ${submission.ai_customers || 'N/A'}`,
      score: null,
      maxScore: null
    },
    {
      question: "Competitor Landscape & Market Sentiment",
      answer: `Competitors Named: ${submission.competitors || 'N/A'}\nNumber of Competitors (AI): ${submission.ai_competitors || '0'}\nAI Sentiment Analysis: ${submission.ai_sentiment || 'N/A'}`,
      score: null,
      maxScore: null
    },
    {
      question: "Pricing & Unit Economics",
      answer: `Pricing Model: ${submission.pricing_model || 'N/A'}\nAverage Price (Self): ${submission.avg_price || 'N/A'}\nAverage Price (AI): ${submission.ai_price || 'N/A'}`,
      score: null,
      maxScore: null
    },
    {
      question: "Competitor Comparison Star Rating (AI)",
      answer: `AI Stars: ${submission.ai_stars || 'N/A'} out of 5.0\nAI Avg Rating: ${submission.ai_avg_rating || 'N/A'}`,
      score: Math.round(score * 2), // convert 5-star to 10-point scale for bar chart compatibility
      maxScore: 10
    },
    {
      question: "Strategic AI Insights & Action Items",
      answer: submission.ai_insights || 'No AI insights generated yet.',
      score: null,
      maxScore: null
    }
  ];

  return {
    personalInfo: {
      id: String(submission.id),
      name: submission.name || 'Anonymous Submission',
      email: submission.email || 'No Email',
      testDate: submission.created_at,
      score: score,
      maxScore: 5.0,
      sessionId: String(submission.id),
      pdfUrl: submission.pdf_url // Direct link to PDF report!
    },
    results: resultsList
  };
}

/**
 * Generate Mock Candidates
 */
function getMockCandidates() {
  return [
    { id: 'db3-cand-1', name: 'Nandhu Market Research', email: 'nenanditha@gmail.com', phone: '+919988776655', testDate: '2026-03-20T04:56:12Z', score: 3.4, maxScore: 5.0 },
    { id: 'db3-cand-2', name: 'Acme SaaS Analysis', email: 'founder@acme.com', phone: '+1234567890', testDate: '2026-07-22T12:00:00Z', score: 4.5, maxScore: 5.0 },
    { id: 'db3-cand-3', name: 'EduTech Platform Plan', email: 'study@edu.org', phone: '+4412345678', testDate: '2026-07-20T09:30:00Z', score: 2.8, maxScore: 5.0 }
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
      question: "Business Concept & Industry",
      answer: "Company Name: HealthTech Solutions\nService/Product: Telemedicine App\nIndustry Segment: Digital Healthcare",
      score: null,
      maxScore: null
    },
    {
      question: "TAM (Total Addressable Market) Analysis",
      answer: "Self TAM Estimate: $2B\nAI Estimated TAM: $5.0B\nAI Estimated Customers: 85,000",
      score: null,
      maxScore: null
    },
    {
      question: "Competitor Comparison Star Rating (AI)",
      answer: `AI Stars: ${personalInfo.score} out of 5.0\nAI Avg Rating: ${personalInfo.score}`,
      score: Math.round(personalInfo.score * 2),
      maxScore: 10
    },
    {
      question: "Strategic AI Insights & Action Items",
      answer: "🎯 Focus on affordable and quick doctor access to differentiate from Practo. \n📈 Recruitment incentives for physicians are critical to catch up with 1mg.",
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
 * Organization monitoring (Phase 5).
 * Verified via schema audit: research_submissions has company_name but
 * no stable user/candidate id, so only org breakdown is possible here —
 * no getUserBreakdown for this tool.
 */
async function getOrgBreakdown(supabase) {
  const { data, error } = await supabase
    .from(TABLES.SUBMISSIONS)
    .select('company_name, ai_stars, created_at');

  if (error) throw error;

  const orgMap = {};
  data.forEach(row => {
    const key = row.company_name || 'Unassigned';
    if (!orgMap[key]) {
      orgMap[key] = { organization: key, totalAssessments: 0, scoreSum: 0, lastActivity: null };
    }
    orgMap[key].totalAssessments++;
    orgMap[key].scoreSum += (row.ai_stars !== null ? parseFloat(row.ai_stars) : 0);
    if (row.created_at) {
      const d = new Date(row.created_at);
      if (!orgMap[key].lastActivity || d > new Date(orgMap[key].lastActivity)) {
        orgMap[key].lastActivity = row.created_at;
      }
    }
  });

  return Object.values(orgMap).map(org => ({
    organization: org.organization,
    totalAssessments: org.totalAssessments,
    averageScore: Math.round((org.scoreSum / org.totalAssessments) * 10) / 10, // out of 5.0
    lastActivity: org.lastActivity
  })).sort((a, b) => b.totalAssessments - a.totalAssessments);
}

/**
 * Payment Monitoring. Verified via schema audit + a live values check
 * (check-payment-status.js): payment_status only ever holds "success",
 * "pending", or "dismissed" — no dollar amount column, so paid/unpaid
 * counts and conversion rate only, same as db4. "pending" and
 * "dismissed" are both non-conversions but kept distinct in
 * unpaidBreakdown since one is still open and the other was declined.
 */
async function getPaymentSummary(supabase) {
  const { data, error } = await supabase
    .from(TABLES.SUBMISSIONS)
    .select('payment_status');

  if (error) throw error;

  let paidCount = 0;
  let unpaidCount = 0;
  const unpaidBreakdown = {};

  data.forEach(row => {
    if (row.payment_status === 'success') {
      paidCount++;
    } else {
      unpaidCount++;
      const key = row.payment_status || 'unknown';
      unpaidBreakdown[key] = (unpaidBreakdown[key] || 0) + 1;
    }
  });

  const total = paidCount + unpaidCount;
  return {
    hasRevenueAmount: false,
    paidCount,
    unpaidCount,
    paymentRate: total > 0 ? Math.round((paidCount / total) * 100) : 0,
    unpaidBreakdown: Object.entries(unpaidBreakdown)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)
  };
}

function getMockPaymentSummary() {
  return {
    hasRevenueAmount: false,
    paidCount: 1,
    unpaidCount: 2,
    paymentRate: 33,
    unpaidBreakdown: [
      { status: 'pending', count: 1 },
      { status: 'dismissed', count: 1 }
    ]
  };
}

module.exports = {
  getCandidates,
  getCandidateDetails,
  getMockCandidates,
  getMockCandidateDetails,
  getOrgBreakdown,
  getPaymentSummary,
  getMockPaymentSummary,
  metadata: {
    name: 'Market Research',
    category: 'AI Assessment',
    siteUrl: 'https://mra.infopaceindia.co.in',
    description: 'Analyzes the total addressable market (TAM), competitor landscape, pricing strategies, and growth drivers for candidate businesses.'
  }
};