const { createClient } = require('@supabase/supabase-js');

/**
 * DB4 Adapter: Venture Pitch & Plan Evaluator
 * Maps to the:
 * - submissions table
 */

const TABLES = {
  SUBMISSIONS: 'submissions'
};

/**
 * Helper to safely format JSONB or text inputs
 */
function formatJsonField(field) {
  if (!field) return 'None';
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      return Array.isArray(parsed) ? parsed.join('\n• ') : JSON.stringify(parsed, null, 2);
    } catch (e) {
      return field;
    }
  }
  if (Array.isArray(field)) {
    return '• ' + field.join('\n• ');
  }
  return JSON.stringify(field, null, 2);
}

/**
 * Fetch all submissions from DB4
 */
async function getCandidates(supabase) {
  const { data: submissions, error } = await supabase
    .from(TABLES.SUBMISSIONS)
    .select('id, name, email, phone, phone_full, overall_score, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return submissions.map(item => {
    const score = item.overall_score !== null ? parseInt(item.overall_score) : 0;
    
    return {
      id: String(item.id),
      name: item.name || 'Anonymous Submission',
      email: item.email || 'No Email',
      phone: item.phone_full || item.phone || 'N/A',
      testDate: item.created_at,
      score: score,
      maxScore: 100
    };
  });
}

/**
 * Fetch details & evaluation reports
 */
async function getCandidateDetails(supabase, candidateId) {
  const { data: submission, error } = await supabase
    .from(TABLES.SUBMISSIONS)
    .select('*')
    .eq('id', candidateId)
    .single();

  if (error) throw error;

  const score = submission.overall_score !== null ? parseInt(submission.overall_score) : 0;

  const resultsList = [
    {
      question: "Startup Concept & Founder Profile",
      answer: `Startup/Product: ${submission.product_name || 'N/A'}\nCompany: ${submission.organization || 'N/A'}\nFounder Role: ${submission.role || 'N/A'}\nSector: ${submission.sector || 'N/A'}\nBusiness Type: ${submission.business_type || 'N/A'}`,
      score: null,
      maxScore: null
    },
    {
      question: "Problem Statement & Stage",
      answer: `Problem Solved: ${submission.problem || 'N/A'}\nDevelopment Stage: ${submission.stage || 'N/A'}\nTarget Geography: ${submission.geography || 'N/A'}\nTeam Size: ${submission.team_size || 'N/A'}`,
      score: null,
      maxScore: null
    },
    {
      question: "Market Sizing (INR Crore) & CAGR",
      answer: `TAM (Total Addressable): ${submission.tam_crore || '0'} Cr\nSAM (Serviceable Addressable): ${submission.sam_crore || '0'} Cr\nSOM (Serviceable Obtainable): ${submission.som_crore || '0'} Cr\nGrowth Rate (CAGR): ${submission.growth_rate || '0'}%`,
      score: null,
      maxScore: null
    },
    {
      question: "Venture Evaluation Score",
      answer: `Overall Score: ${score}/100\nGrade: ${submission.grade || 'N/A'}\nVerdict: ${submission.verdict || 'N/A'}\nOnboarding Status: ${submission.status || 'N/A'}`,
      score: score,
      maxScore: 100
    },
    {
      question: "Key Strategic Insights (AI)",
      answer: formatJsonField(submission.key_insights),
      score: null,
      maxScore: null
    },
    {
      question: "Top Risks & Constraints (AI)",
      answer: formatJsonField(submission.top_risks),
      score: null,
      maxScore: null
    },
    {
      question: "Quick Wins & Operational Items (AI)",
      answer: formatJsonField(submission.quick_wins),
      score: null,
      maxScore: null
    }
  ];

  return {
    personalInfo: {
      id: String(submission.id),
      name: submission.name || 'Anonymous',
      email: submission.email || 'No Email',
      testDate: submission.created_at,
      score: score,
      maxScore: 100,
      sessionId: String(submission.id),
      screenshotUrl: submission.screenshot_url // Hook screenshot URL for PDF compilation
    },
    results: resultsList
  };
}

/**
 * Generate Mock Candidates
 */
function getMockCandidates() {
  return [
    { id: 'db4-cand-1', name: 'Aditya Sen (GreenDrive Tech)', email: 'aditya@greendrive.io', phone: '+919900881122', testDate: '2026-07-22T10:00:00Z', score: 85, maxScore: 100 },
    { id: 'db4-cand-2', name: 'Rohan Gupta (CareFlow AI)', email: 'rohan@careflow.ai', phone: '+919845012345', testDate: '2026-07-21T15:30:00Z', score: 92, maxScore: 100 },
    { id: 'db4-cand-3', name: 'Sneha Nair (Zenith Retail)', email: 'sneha@zenith.in', phone: '+918023456789', testDate: '2026-07-20T08:15:00Z', score: 64, maxScore: 100 }
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
      question: "Startup Concept & Founder Profile",
      answer: `Startup/Product: GreenDrive Ev Solutions\nCompany: GreenDrive Tech\nFounder Role: CEO\nSector: CleanTech\nBusiness Type: B2C`,
      score: null,
      maxScore: null
    },
    {
      question: "Problem Statement & Stage",
      answer: `Problem Solved: EV charging infrastructure shortage in suburban neighborhoods.\nDevelopment Stage: Seed Stage (MVP built)\nTarget Geography: Bengaluru, India\nTeam Size: 8`,
      score: null,
      maxScore: null
    },
    {
      question: "Market Sizing (INR Crore) & CAGR",
      answer: `TAM (Total Addressable): 1,200 Cr\nSAM (Serviceable Addressable): 350 Cr\nSOM (Serviceable Obtainable): 80 Cr\nGrowth Rate (CAGR): 28.5%`,
      score: null,
      maxScore: null
    },
    {
      question: "Venture Evaluation Score",
      answer: `Overall Score: ${personalInfo.score}/100\nGrade: A\nVerdict: Highly Viable\nOnboarding Status: onboarding_complete`,
      score: personalInfo.score,
      maxScore: 100
    },
    {
      question: "Key Strategic Insights (AI)",
      answer: "• High local demand due to residential vehicle shifts.\n• Strong unit economics on hub-and-spoke setups.",
      score: null,
      maxScore: null
    },
    {
      question: "Top Risks & Constraints (AI)",
      answer: "• Grid connection regulatory delays.\n• Competitor price wars on high-traffic corridors.",
      score: null,
      maxScore: null
    },
    {
      question: "Quick Wins & Operational Items (AI)",
      answer: "• Pre-sell charging subscription packages to resident associations.\n• Partner with residential real-estate builders.",
      score: null,
      maxScore: null
    }
  ];

  return {
    personalInfo,
    results: resultsList
  };
}

module.exports = {
  getCandidates,
  getCandidateDetails,
  getMockCandidates,
  getMockCandidateDetails,
  metadata: {
    name: 'Market Potential',
    description: 'Evaluates startup submissions on market sizing (TAM/SAM/SOM), product-market fit, risk profiles, and business model feasibility.'
  }
};
