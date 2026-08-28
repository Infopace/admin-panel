/**
 * Payment Status Check — one-off helper
 *
 * Prints every distinct value in db3's (Market Research) payment_status
 * column, with a count of how many rows have it. Once you know what the
 * real values are (e.g. "paid" / "pending" / "failed"), tell me and I'll
 * upgrade its Payment Monitoring panel from a raw breakdown to a proper
 * paid/unpaid conversion metric like db1 and db4 already have.
 *
 * This does NOT modify anything — read-only.
 *
 * Usage:
 *   1. Make sure backend/.env has SUPABASE_URL_3 and SUPABASE_KEY_3 filled in
 *   2. node check-payment-status.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function main() {
  const url = process.env.SUPABASE_URL_3;
  const key = process.env.SUPABASE_KEY_3;

  if (!url || !key) {
    console.log('SKIPPED — no SUPABASE_URL_3/SUPABASE_KEY_3 configured in .env.');
    return;
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('research_submissions')
    .select('payment_status');

  if (error) {
    console.log(`ERROR querying research_submissions: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    console.log('Table is empty — nothing to report yet.');
    return;
  }

  const counts = {};
  data.forEach(row => {
    const key = row.payment_status === null || row.payment_status === undefined ? '(null)' : row.payment_status;
    counts[key] = (counts[key] || 0) + 1;
  });

  console.log(`\n=== payment_status distinct values (${data.length} rows total) ===`);
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([value, count]) => {
      console.log(`  ${String(value).padEnd(20)} ${count}`);
    });
}

main();
