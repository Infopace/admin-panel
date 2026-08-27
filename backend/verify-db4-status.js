/**
 * Verifies what db4's "status" and "stage" columns actually mean before
 * we rely on them for funnel/abandoned monitoring.
 *
 * Run: node verify-db4-status.js   (from backend/, with .env configured)
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function main() {
    const url = process.env.SUPABASE_URL_4;
    const key = process.env.SUPABASE_KEY_4;

    if (!url || !key) {
        console.log('SUPABASE_URL_4 / SUPABASE_KEY_4 not set in .env — nothing to check.');
        return;
    }

    const supabase = createClient(url, key);

    const { data, error } = await supabase
        .from('submissions')
        .select('status, stage')
        .limit(500);

    if (error) {
        console.error('Query failed:', error.message);
        return;
    }

    const statusCounts = {};
    const stageCounts = {};
    data.forEach(row => {
        const s = row.status ?? '(null)';
        const g = row.stage ?? '(null)';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
        stageCounts[g] = (stageCounts[g] || 0) + 1;
    });

    console.log(`Sampled ${data.length} rows from "submissions".\n`);
    console.log('Distinct "status" values and counts:');
    console.log(statusCounts);
    console.log('\nDistinct "stage" values and counts:');
    console.log(stageCounts);

    console.log('\nHow to read this:');
    console.log('- If "status" shows values like pending/processing/completed/failed,');
    console.log('  it IS assessment-progress state -> funnel monitoring is possible.');
    console.log('- If "status" shows things like paid/unpaid, or "stage" shows business');
    console.log('  stages (idea/mvp/growth), those are answer/payment fields, NOT');
    console.log('  assessment progress -> funnel monitoring is still not possible here.');
}

main();