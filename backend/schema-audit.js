/**
 * Schema Audit — Phase 0
 *
 * For each of the 5 assessment Supabase projects, checks whether the
 * main table has what's needed to build:
 *   - Funnel / In-Progress / Abandoned counts   -> needs a status/stage column
 *   - Time monitoring (avg/median duration)     -> needs started_at AND completed_at
 *   - Organization monitoring                   -> needs an org/company id or name column
 *   - User monitoring (repeat attempts, etc.)   -> needs a stable user/candidate id
 *
 * This does NOT modify anything — it only reads one row's column names
 * (`select('*').limit(1)`) from each main table and reports what it finds.
 *
 * Usage:
 *   1. Put this file in backend/ (next to server.js and adapters/)
 *   2. Make sure backend/.env has SUPABASE_URL_1..5 and SUPABASE_KEY_1..5 filled in
 *   3. node schema-audit.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// One "main table" per tool — the table each adapter's getCandidates()
// treats as the source of truth for a completed attempt.
const TOOLS = [
    { dbId: 'db1', name: 'Creative and Innovation', table: 'cii_results' },
    { dbId: 'db2', name: 'Founder and Co-founder Compatibility', table: 'sessions' },
    { dbId: 'db3', name: 'Market Research', table: 'research_submissions' },
    { dbId: 'db4', name: 'Market Potential', table: 'submissions' },
    { dbId: 'db5', name: 'Venture Risk Assessment', table: 'assessments' }
];

// Keyword groups used to fuzzy-match column names to each capability.
// Adjust these if your actual column names use different conventions.
const KEYWORDS = {
    status: ['status', 'stage', 'state', 'is_completed', 'is_abandoned', 'completion_status'],
    startedAt: ['started_at', 'start_time', 'created_at', 'begin_at'],
    completedAt: ['completed_at', 'finished_at', 'end_time', 'submitted_at'],
    organization: ['organization', 'org_id', 'organisation', 'company', 'company_id', 'employer'],
    userId: ['user_id', 'candidate_id', 'employee_id', 'respondent_id']
};

function findMatches(columns, keywords) {
    return columns.filter(col =>
        keywords.some(kw => col.toLowerCase().includes(kw))
    );
}

async function auditTool({ dbId, name, table }) {
    const url = process.env[`SUPABASE_URL_${dbId.slice(2)}`];
    const key = process.env[`SUPABASE_KEY_${dbId.slice(2)}`];

    console.log(`\n=== ${name} (${dbId}) — table: "${table}" ===`);

    if (!url || !key) {
        console.log('  SKIPPED — no SUPABASE_URL/KEY configured in .env for this slot.');
        return { dbId, name, table, configured: false };
    }

    const supabase = createClient(url, key);

    const { data, error } = await supabase.from(table).select('*').limit(1);

    if (error) {
        console.log(`  ERROR querying "${table}": ${error.message}`);
        console.log('  -> Table name may differ from what the adapter expects, or credentials lack access.');
        return { dbId, name, table, configured: true, error: error.message };
    }

    if (!data || data.length === 0) {
        console.log(`  Table "${table}" is empty — cannot infer columns from a sample row.`);
        console.log('  -> Re-run once there is at least one row, or check the schema directly in Supabase Studio.');
        return { dbId, name, table, configured: true, empty: true };
    }

    const columns = Object.keys(data[0]);
    const statusCols = findMatches(columns, KEYWORDS.status);
    const startedCols = findMatches(columns, KEYWORDS.startedAt);
    const completedCols = findMatches(columns, KEYWORDS.completedAt);
    const orgCols = findMatches(columns, KEYWORDS.organization);
    const userCols = findMatches(columns, KEYWORDS.userId);

    console.log(`  All columns: ${columns.join(', ')}`);
    console.log(`  Status-like column(s):      ${statusCols.length ? statusCols.join(', ') : 'NONE FOUND'}`);
    console.log(`  Start-timestamp column(s):  ${startedCols.length ? startedCols.join(', ') : 'NONE FOUND'}`);
    console.log(`  Completion-timestamp col(s):${completedCols.length ? completedCols.join(', ') : 'NONE FOUND'}`);
    console.log(`  Organization column(s):     ${orgCols.length ? orgCols.join(', ') : 'NONE FOUND'}`);
    console.log(`  User/candidate id column(s):${userCols.length ? userCols.join(', ') : 'NONE FOUND'}`);

    const canDoFunnel = statusCols.length > 0;
    const canDoTime = startedCols.length > 0 && completedCols.length > 0;
    const canDoOrg = orgCols.length > 0;
    const canDoUser = userCols.length > 0;

    console.log(`  -> Funnel/Abandoned monitoring:  ${canDoFunnel ? 'YES' : 'NOT YET (needs a status column)'}`);
    console.log(`  -> Time monitoring:              ${canDoTime ? 'YES' : 'NOT YET (needs both a start and completion timestamp)'}`);
    console.log(`  -> Organization monitoring:      ${canDoOrg ? 'YES' : 'NOT YET (needs an org/company column)'}`);
    console.log(`  -> User monitoring:              ${canDoUser ? 'YES' : 'NOT YET (needs a stable user/candidate id column)'}`);

    return {
        dbId, name, table, configured: true,
        columns, canDoFunnel, canDoTime, canDoOrg, canDoUser
    };
}

async function main() {
    console.log('Running schema audit across all 5 assessment tools...');
    const results = [];
    for (const tool of TOOLS) {
        results.push(await auditTool(tool));
    }

    console.log('\n\n=== SUMMARY ===');
    console.log('Tool'.padEnd(38), 'Funnel'.padEnd(8), 'Time'.padEnd(8), 'Org'.padEnd(8), 'User');
    results.forEach(r => {
        if (!r.configured || r.error || r.empty) {
            console.log(r.name.padEnd(38), '- not enough data to assess -');
            return;
        }
        console.log(
            r.name.padEnd(38),
            (r.canDoFunnel ? 'YES' : 'NO').padEnd(8),
            (r.canDoTime ? 'YES' : 'NO').padEnd(8),
            (r.canDoOrg ? 'YES' : 'NO').padEnd(8),
            (r.canDoUser ? 'YES' : 'NO')
        );
    });

    console.log('\nNote: keyword matching is a heuristic — if a column exists under a name');
    console.log('not covered by KEYWORDS above, it will show as NOT FOUND. Double check any');
    console.log('"NO" result against Supabase Studio directly before ruling out a feature.');
}

main();