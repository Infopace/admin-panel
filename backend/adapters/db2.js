const { createClient } = require('@supabase/supabase-js');

/**
 * DB2 Adapter: Founder and Co-founder Compatibility
 * Maps exclusively to the:
 * - sessions table (id, founder_a [JSONB], founder_b [JSONB], created_at)
 *   Emails are extracted directly from: founder_a.profile.email and founder_b.profile.email
 *   PDF report URLs are extracted from: founder_a.pdf_url and founder_b.pdf_url
 */

const TABLES = {
  SESSIONS: 'sessions'
};

// 25 founder compatibility questions mapping
const COMPATIBILITY_QUESTIONS = {
  "1": "Equity & Vesting: How do you align on equal equity distribution vs milestone performance?",
  "2": "Conflict Resolution: What is your primary process for resolving deadlocks on major decisions?",
  "3": "Risk Appetite: How comfortable are you operating without salary for the first 6-12 months?",
  "4": "Working Hours: What are your expectations regarding weekend work and standard daily hours?",
  "5": "Exit Strategy: How aligned are you on building a cash-flow lifestyle business vs a venture-backed exit?",
  "6": "Funding Preferences: Do you prefer bootstrapping as long as possible vs raising VC money early?",
  "7": "Role Allocation: Who has the final authority on technical design vs business/product decisions?",
  "8": "Company Culture: How much priority do you place on building early employee perk cultures?",
  "9": "Hiring Speed: Do you align on hiring fast and firing fast, or conducting thorough vetting cycles?",
  "10": "Remote Work: Should the core early team be fully on-site, hybrid, or completely distributed?",
  "11": "Product vs Growth: Should resources go into engineering perfection vs marketing and early sales?",
  "12": "Crisis Management: How do you handle sudden drop in runway (e.g. 1 month of cash left)?",
  "13": "Personal Ambition: Is your ultimate goal to become a prominent industry leader vs building quiet wealth?",
  "14": "Vesting Cliffs: Do you agree on a standard 1-year cliff and 4-year vesting schedule?",
  "15": "Feedback Delivery: Do you prefer direct/radical candor vs diplomatic/constructive feedback?",
  "16": "Debt & Loans: Is it acceptable to take company debt or founder loans to sustain early runway?",
  "17": "Equity Dilution: How comfortable are you diluting your equity to bring on high-profile advisors?",
  "18": "Family & Work Balance: How do you prioritize early startup demands over personal/family commitments?",
  "19": "Intellectual Property: Are all previous IP/code contributions fully signed over to the new entity?",
  "20": "Board Seats: Should outside investors get board control in the seed/Series A stages?",
  "21": "Pivot Flexibility: How open are you to pivoting the product entirely if early data contradicts our vision?",
  "22": "Marketing Budgets: How aggressively should we spend capital on paid ads vs organic channels?",
  "23": "Title Ownership: Who assumes the CEO title and represents the brand to public media/investors?",
  "24": "Side Projects: Is it acceptable for founders to maintain passive side income or consulting gigs?",
  "25": "Failure Tolerance: At what point (runway/time) do we mutually agree to wind down the company?"
};

const ANSWER_OPTIONS = {
  "0": "Strongly Disagree / Low Alignment (0/3)",
  "1": "Disagree / Moderate-Low Alignment (1/3)",
  "2": "Agree / Moderate-High Alignment (2/3)",
  "3": "Strongly Agree / High Alignment (3/3)"
};

/**
 * Calculate compatibility percentage between two founders
 */
function calculateCompatibility(answersA, answersB) {
  if (!answersA || !answersB) return 50;

  let totalDiff = 0;
  let questionCount = 0;

  for (let i = 1; i <= 25; i++) {
    const ansA = answersA[String(i)] !== undefined ? answersA[String(i)] : 1;
    const ansB = answersB[String(i)] !== undefined ? answersB[String(i)] : 1;
    
    totalDiff += Math.abs(ansA - ansB);
    questionCount++;
  }

  const maxPossibleDiff = questionCount * 3;
  const similarityScore = maxPossibleDiff - totalDiff;
  
  return Math.round((similarityScore / maxPossibleDiff) * 100);
}

/**
 * Fetch all sessions from DB2
 */
async function getCandidates(supabase) {
  const { data: sessions, error: sessError } = await supabase
    .from(TABLES.SESSIONS)
    .select('id, founder_a, founder_b, created_at')
    .order('created_at', { ascending: false });

  if (sessError) throw sessError;

  return sessions.map(item => {
    const nameA = (item.founder_a && item.founder_a.name) || 'Founder A';
    const nameB = (item.founder_b && item.founder_b.name) || 'Founder B';
    
    const emailA = (item.founder_a && item.founder_a.profile && item.founder_a.profile.email) || 'No Email';
    const emailB = (item.founder_b && item.founder_b.profile && item.founder_b.profile.email) || 'No Email';

    const answersA = item.founder_a && item.founder_a.answers;
    const answersB = item.founder_b && item.founder_b.answers;
    
    const compatibilityScore = calculateCompatibility(answersA, answersB);

    // Extract phones: Check JSON
    const phoneA = (item.founder_a && item.founder_a.profile && item.founder_a.profile.phone) || '';
    const phoneB = (item.founder_b && item.founder_b.profile && item.founder_b.profile.phone) || '';
    const phone = phoneA && phoneB ? `${phoneA} & ${phoneB}` : phoneA || phoneB || 'N/A';

    return {
      id: item.id,
      name: `${nameA} & ${nameB}`,
      email: `${emailA} & ${emailB}`,
      phone: phone,
      testDate: item.created_at,
      score: compatibilityScore,
      maxScore: 100
    };
  });
}

/**
 * Fetch candidate details & compatibility Q&A comparison
 */
async function getCandidateDetails(supabase, candidateId) {
  const { data: session, error: sessError } = await supabase
    .from(TABLES.SESSIONS)
    .select('id, founder_a, founder_b, created_at')
    .eq('id', candidateId)
    .single();

  if (sessError) throw sessError;

  const nameA = (session.founder_a && session.founder_a.name) || 'Founder A';
  const nameB = (session.founder_b && session.founder_b.name) || 'Founder B';
  
  const emailA = (session.founder_a && session.founder_a.profile && session.founder_a.profile.email) || 'No Email';
  const emailB = (session.founder_b && session.founder_b.profile && session.founder_b.profile.email) || 'No Email';

  // Extract the PDF report URL from founder_a or founder_b JSON properties
  const pdfUrl = (session.founder_a && session.founder_a.pdf_url) || (session.founder_b && session.founder_b.pdf_url) || null;

  const answersA = (session.founder_a && session.founder_a.answers) || {};
  const answersB = (session.founder_b && session.founder_b.answers) || {};
  
  const compatibilityScore = calculateCompatibility(answersA, answersB);

  const resultsList = [];
  for (let i = 1; i <= 25; i++) {
    const valA = answersA[String(i)] !== undefined ? answersA[String(i)] : 0;
    const valB = answersB[String(i)] !== undefined ? answersB[String(i)] : 0;
    
    const textA = ANSWER_OPTIONS[String(valA)] || `Option ${valA}`;
    const textB = ANSWER_OPTIONS[String(valB)] || `Option ${valB}`;

    const diff = Math.abs(valA - valB);
    const scoreVal = diff === 0 ? 10 : diff === 1 ? 7 : diff === 2 ? 3 : 0;

    resultsList.push({
      question: COMPATIBILITY_QUESTIONS[String(i)] || `Compatibility Area ${i}`,
      answer: `${nameA} (Founder A): ${textA}\n${nameB} (Founder B): ${textB}`,
      score: scoreVal,
      maxScore: 10
    });
  }

  return {
    personalInfo: {
      id: session.id,
      name: `${nameA} & ${nameB}`,
      email: `${emailA} & ${emailB}`,
      testDate: session.created_at,
      score: compatibilityScore,
      maxScore: 100,
      sessionId: session.id,
      pdfUrl: pdfUrl
    },
    results: resultsList
  };
}

/**
 * Generate Mock Candidates
 */
function getMockCandidates() {
  return [
    { id: 'db2-cand-1', name: 'Nandhu & Ajay', email: 'nandhu@example.com & ajay@example.com', phone: '8310032281 & 9876543210', testDate: '2026-03-12T09:47:50Z', score: 81, maxScore: 100 },
    { id: 'db2-cand-2', name: 'Sarah & Steve', email: 'sarah@dev.com & steve@dev.com', phone: '555-0101 & 555-0102', testDate: '2026-07-21T10:00:00Z', score: 92, maxScore: 100 },
    { id: 'db2-cand-3', name: 'Mark & Dustin', email: 'mark@social.com & dustin@social.com', phone: '555-0193 & 555-0194', testDate: '2026-07-19T15:20:00Z', score: 68, maxScore: 100 }
  ];
}

/**
 * Generate Mock Candidate Details
 */
function getMockCandidateDetails(candidateId) {
  const candidates = getMockCandidates();
  const personalInfo = candidates.find(c => c.id === candidateId) || candidates[0];
  const names = personalInfo.name.split(' & ');
  const nameA = names[0];
  const nameB = names[1];

  const resultsList = [];
  for (let i = 1; i <= 25; i++) {
    resultsList.push({
      question: COMPATIBILITY_QUESTIONS[String(i)] || `Compatibility Area ${i}`,
      answer: `${nameA} (Founder A): Agree / Moderate-High Alignment (2/3)\n${nameB} (Founder B): Strongly Agree / High Alignment (3/3)`,
      score: 7,
      maxScore: 10
    });
  }

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
    name: 'Founder and Co-founder Compatibility',
    description: 'Evaluates the core values, management alignment, risk styles, and working habits between co-founders.'
  }
};
