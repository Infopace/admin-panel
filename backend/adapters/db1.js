const { createClient } = require('@supabase/supabase-js');

/**
 * DB1 Adapter: Creative and Innovation (CII)
 * Built to map to:
 * - cii_users (candidate details)
 * - cii_results (score & session completion info)
 * - cii_answers (raw question-answers)
 */

const TABLES = {
  USERS: 'cii_users',
  RESULTS: 'cii_results',
  ANSWERS: 'cii_answers'
};

// 25 CII Assessment Questions catalog config
const CII_QUESTIONS = {
  q1: {
    text: 'List every possible use for a broken umbrella. (Hint: Physical / metaphorical / artistic / absurd / scientific - push far past the obvious.)',
    type: 'open'
  },
  q2: {
    text: 'In how many ways could complete SILENCE be a valuable tool or resource? (Hint: Therapy / technology / business / art / military / nature / education...)',
    type: 'open'
  },
  q3: {
    text: 'Find ONE word that connects all three: PINE / CRAB / SAUCE',
    type: 'rat',
    options: ['APPLE', 'TREE', 'FRUIT', 'JUICE'],
    correct: 'APPLE'
  },
  q4: {
    text: 'Find ONE word that connects all three: FALLING / ACTOR / DUST',
    type: 'rat',
    options: ['FILM', 'SKY', 'STAR', 'STAGE'],
    correct: 'STAR'
  },
  q5: {
    text: 'Find ONE word that connects all three: LIGHT / BIRTHDAY / STICK',
    type: 'rat',
    options: ['WAX', 'PARTY', 'FIRE', 'CANDLE'],
    correct: 'CANDLE'
  },
  q6: { text: 'I feel energized — not anxious — when starting a project with no clear direction.', type: 'likert' },
  q7: { text: 'Failure feels like useful data to me, not a personal setback.', type: 'likert' },
  q8: { text: 'I regularly explore topics completely unrelated to my work, purely out of curiosity.', type: 'likert' },
  q9: { text: 'I actively seek out people who think very differently from me.', type: 'likert' },
  q10: { text: '(Reversed) I find it unsettling when a situation has no clear right answer or obvious path forward.', type: 'likert' },
  q11: { text: 'I can vividly imagine products, systems, or worlds that don\'t yet exist.', type: 'likert' },
  q12: { text: 'I continue working on ideas even when no one around me believes in them yet.', type: 'likert' },
  q13: { text: 'I feel compelled to build or create things even without any external reward.', type: 'likert' },
  q14: { text: 'I often stop mid-task to question whether I\'m solving the RIGHT problem.', type: 'likert' },
  q15: { text: '(Reversed) I tend to lose momentum on creative ideas once the initial excitement fades.', type: 'likert' },
  q16: {
    text: 'When you encounter a frustrating, broken process, you typically:',
    type: 'choice',
    options: [
      'Accept it and adapt around it',
      'Work around it quietly on your own',
      'Propose a better way to whoever\'s responsible',
      'Redesign or fix it yourself without waiting'
    ]
  },
  q17: {
    text: 'How often do you connect ideas from completely unrelated fields to solve your problems?',
    type: 'choice',
    options: [
      'Almost never',
      'Occasionally when stuck',
      'Regularly — one of my first approaches',
      'It\'s my default way of thinking'
    ]
  },
  q18: {
    text: 'In the last year, have you created something — a product, system, or solution — that didn\'t exist before?',
    type: 'choice',
    options: [
      'Not really',
      'Started something but didn\'t finish',
      'Yes, once or twice',
      'Yes, multiple times'
    ]
  },
  q19: {
    text: 'Your relationship with constraints — deadlines, budgets, rules:',
    type: 'choice',
    options: [
      'They frustrate and block my thinking',
      'I just work with what I have',
      'They often make me think more creatively',
      'I actively create constraints to spark better ideas'
    ]
  },
  q20: {
    text: 'When someone dismisses your creative idea, you typically:',
    type: 'choice',
    options: [
      'Let it go — they may be right',
      'Feel frustrated but move on',
      'Seek their reasoning to understand why',
      'Find another way to demonstrate its merit'
    ]
  },
  q21: {
    text: '(Startup Crisis) Your startup\'s main product just became obsolete overnight.',
    type: 'choice',
    options: [
      'Deeply analyze what makes the competitor\'s product superior',
      'Immediately negotiate a partnership or acquisition with them',
      'Find a different problem your existing technology could now solve',
      'Pivot to a new market entirely using your team\'s core skills'
    ]
  },
  q22: {
    text: '(Urban Problem) A public bridge keeps getting vandalized despite all traditional interventions.',
    type: 'choice',
    options: [
      'Better surveillance cameras and increased fines',
      'Apply permanent anti-graffiti coating everywhere',
      'Commission local artists to transform it into a mural destination',
      'Demolish and redesign the bridge entirely'
    ]
  },
  q23: {
    text: '(Education) You must teach creativity to 10-year-olds. Your most effective approach:',
    type: 'choice',
    options: [
      'Teach classic techniques: brainstorming, mind maps, SCAMPER',
      'Show curated examples of great creative work throughout history',
      'Give them impossible problems with no right answers — then step back',
      'Master techniques, then explicitly teach them to break every rule'
    ]
  },
  q24: {
    text: '(City Challenge) Your city is losing talented young people to other cities. Most innovative retention strategy:',
    type: 'choice',
    options: [
      'Lower taxes, increase salaries, improve standard amenities',
      'Build better transport, housing, and green spaces',
      'Create a city-wide experimental zone where regulations are suspended',
      'Launch a civic co-ownership model where residents hold real equity'
    ]
  },
  q25: {
    text: '(Tech & Humanity) You\'ve built tech that lets people fully experience another person\'s memories. You launch it first as:',
    type: 'choice',
    options: [
      'A clinical therapy tool for trauma healing',
      'A courtroom evidence platform',
      'A revolutionary entertainment and art medium beyond VR',
      'An education platform where students literally live history'
    ]
  }
};

/**
 * Fetch all candidates who completed the CII assessment
 */
async function getCandidates(supabase) {
  // 1. Fetch assessment completion details
  const { data: results, error: resError } = await supabase
    .from(TABLES.RESULTS)
    .select('id, user_id, cii_score, completed_at, employee_name')
    .order('completed_at', { ascending: false });

  if (resError) throw resError;

  // 2. Fetch candidate profiles
  const { data: users, error: userError } = await supabase
    .from(TABLES.USERS)
    .select('id, full_name, email, phone');

  if (userError) {
    console.warn('Could not fetch details from cii_users table. Error:', userError.message);
  }

  // Map users by ID for quick lookup
  const userMap = {};
  if (users) {
    users.forEach(u => {
      userMap[u.id] = u;
    });
  }

  // 3. Format and return standardized records
  return results.map(item => {
    const user = userMap[item.user_id] || {};
    return {
      id: item.user_id || item.id, // Standard candidate reference ID
      name: user.full_name || item.employee_name || 'Unknown Candidate',
      email: user.email || 'No email provided',
      phone: user.phone || 'N/A',
      testDate: item.completed_at,
      score: item.cii_score || 0,
      maxScore: 100 // Standardized percentage or score basis
    };
  });
}

/**
 * Fetch answers and profile detail for a specific candidate
 */
async function getCandidateDetails(supabase, candidateId) {
  // 1. Fetch latest completed test result for this candidate ID
  const { data: results, error: resError } = await supabase
    .from(TABLES.RESULTS)
    .select('id, session_id, user_id, cii_score, completed_at, employee_name, report_pdf_url, dashboard_png_url')
    .eq('user_id', candidateId)
    .order('completed_at', { ascending: false })
    .limit(1);

  if (resError) throw resError;
  if (!results || results.length === 0) {
    throw new Error('No Creative and Innovation result found for this candidate ID.');
  }
  const result = results[0];

  // 2. Fetch user's personal details
  const { data: user, error: userError } = await supabase
    .from(TABLES.USERS)
    .select('id, full_name, email, phone, designation, organization')
    .eq('id', candidateId)
    .single();

  if (userError) {
    console.warn('Could not retrieve candidate details from cii_users:', userError.message);
  }

  // 3. Fetch candidate's answers corresponding to their test session ID
  const { data: answers, error: ansError } = await supabase
    .from(TABLES.ANSWERS)
    .select('question_id, answer_value')
    .eq('session_id', result.session_id);

  if (ansError) throw ansError;

  // 4. Format and map question-answers using CII_QUESTIONS configs
  const formattedResults = answers.map(item => {
    const qid = item.question_id;
    const rawVal = item.answer_value;
    const qConfig = CII_QUESTIONS[qid];

    let questionText = qConfig ? qConfig.text : `Question ID: ${qid}`;
    let displayAnswer = rawVal;
    let score = 4;
    let maxScore = 4;

    if (qConfig) {
      if (qConfig.type === 'likert') {
        const likertMap = {
          '1': 'Strongly Disagree',
          '2': 'Disagree',
          '3': 'Neutral',
          '4': 'Agree',
          '5': 'Strongly Agree'
        };
        displayAnswer = likertMap[rawVal] || `Rating: ${rawVal}`;
        score = parseInt(rawVal) || 0;
        maxScore = 5;
      } else if (qConfig.type === 'rat') {
        const isCorrect = String(rawVal).trim().toUpperCase() === qConfig.correct.toUpperCase();
        displayAnswer = `${rawVal} ${isCorrect ? '✅ (Correct)' : '❌ (Incorrect - Answer is ' + qConfig.correct + ')'}`;
        score = isCorrect ? 10 : 0;
        maxScore = 10;
      } else if (qConfig.type === 'choice') {
        const idx = parseInt(rawVal);
        if (!isNaN(idx) && qConfig.options[idx]) {
          displayAnswer = qConfig.options[idx];
        }
        score = 4;
        maxScore = 4;
      }
    }

    return {
      questionId: qid,
      question: questionText,
      answer: displayAnswer,
      score: score,
      maxScore: maxScore
    };
  });

  // Sort sequentially by question ID number (q1, q2 ... q25)
  formattedResults.sort((a, b) => {
    const numA = parseInt(a.questionId.replace('q', ''));
    const numB = parseInt(b.questionId.replace('q', ''));
    return numA - numB;
  });

  // Strip questionId before returning to frontend
  const resultsList = formattedResults.map(item => ({
    question: item.question,
    answer: item.answer,
    score: item.score,
    maxScore: item.maxScore
  }));

  return {
    personalInfo: {
      id: candidateId,
      name: (user && user.full_name) || result.employee_name || 'Unknown Candidate',
      email: (user && user.email) || 'No email',
      phone: (user && user.phone) || 'N/A',
      testDate: result.completed_at,
      score: result.cii_score || 0,
      maxScore: 100,
      sessionId: result.session_id,
      pdfUrl: result.report_pdf_url,
      screenshotUrl: result.dashboard_png_url
    },
    results: resultsList
  };
}

/**
 * Generate Mock Candidates for local display without DB credentials
 */
function getMockCandidates() {
  return [
    { id: 'cii-cand-1', name: 'Dr. Jane Foster', email: 'jane.foster@astrolabs.org', phone: '+919876543210', testDate: '2026-07-22T08:15:30Z', score: 88, maxScore: 100 },
    { id: 'cii-cand-2', name: 'Reed Richards', email: 'reed@baxter.corp', phone: '+15550199', testDate: '2026-07-21T14:22:10Z', score: 99, maxScore: 100 },
    { id: 'cii-cand-3', name: 'Ada Lovelace', email: 'ada@computing.org', phone: '+442079460192', testDate: '2026-07-20T09:05:00Z', score: 94, maxScore: 100 }
  ];
}

/**
 * Generate Mock Candidate Details
 */
function getMockCandidateDetails(candidateId) {
  const candidates = getMockCandidates();
  const personalInfo = candidates.find(c => c.id === candidateId) || candidates[0];

  // Dynamically generate all 25 mock results in sequential order
  const resultsList = Object.entries(CII_QUESTIONS).map(([qid, qConfig]) => {
    let mockAnswer = '';
    let score = 4;
    let maxScore = 4;

    if (qConfig.type === 'open') {
      if (qid === 'q1') {
        mockAnswer = 'Alternative uses: A temporary rain collector for plants, a central rib for a small model kite, a support stake for greenhouse vines, or raw wire segments for metal sculpture.';
      } else {
        mockAnswer = 'Silence benefits: Sound mitigation in precision microphones, deep reflection in leadership workshops, sensory recovery for hyperactive conditions, and spatial isolation in scientific acoustics.';
      }
    } else if (qConfig.type === 'rat') {
      mockAnswer = `${qConfig.correct} ✅ (Correct)`;
      score = 10;
      maxScore = 10;
    } else if (qConfig.type === 'likert') {
      mockAnswer = qid === 'q10' || qid === 'q15' ? 'Disagree' : 'Strongly Agree';
      score = qid === 'q10' || qid === 'q15' ? 2 : 5;
      maxScore = 5;
    } else if (qConfig.type === 'choice') {
      // Pick a smart option (e.g. index 2 or 3)
      mockAnswer = qConfig.options[2] || qConfig.options[0];
      score = 4;
      maxScore = 4;
    }

    return {
      question: qConfig.text,
      answer: mockAnswer,
      score: score,
      maxScore: maxScore
    };
  });

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
    name: 'Creative and Innovation',
    description: 'Measures divergent thinking, creative problem-solving capability, and organizational innovation style.'
  }
};
