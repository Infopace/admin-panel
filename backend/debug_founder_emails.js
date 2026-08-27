const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL_2;
const key = process.env.SUPABASE_KEY_2;

const supabase = createClient(url, key);

async function scanForEmails() {
  console.log('Scanning sessions table for email fields...');
  const { data, error } = await supabase
    .from('sessions')
    .select('id, founder_a, founder_b')
    .limit(50);

  if (error) {
    console.error('Error querying sessions:', error.message);
    return;
  }

  let foundEmailsCount = 0;
  data.forEach((row, idx) => {
    const keysA = row.founder_a ? Object.keys(row.founder_a) : [];
    const keysB = row.founder_b ? Object.keys(row.founder_b) : [];
    
    // Print the first few to inspect keys
    if (idx < 5) {
      console.log(`Row ID: ${row.id}`);
      console.log(`  Founder A keys:`, keysA, `| email value:`, row.founder_a ? row.founder_a.email : 'undefined');
      console.log(`  Founder B keys:`, keysB, `| email value:`, row.founder_b ? row.founder_b.email : 'undefined');
    }
    
    if ((row.founder_a && row.founder_a.email) || (row.founder_b && row.founder_b.email)) {
      foundEmailsCount++;
    }
  });

  console.log(`\nScan complete. Found email keys in ${foundEmailsCount} out of ${data.length} records.`);
  
  // Let's also check if there are other tables in this database
  console.log('\nChecking other tables in schema via raw RPC (if accessible)...');
  const { data: schemaData, error: schemaError } = await supabase.rpc('get_tables_list').limit(1);
  if (schemaError) {
    console.log('RPC table check not available or permission denied:', schemaError.message);
  }
}

scanForEmails();
