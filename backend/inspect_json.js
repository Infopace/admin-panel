const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL_2;
const key = process.env.SUPABASE_KEY_2;

const supabase = createClient(url, key);

async function inspectFullJson() {
  console.log('Inspecting full founder_a and founder_b JSON structures...');
  const { data, error } = await supabase
    .from('sessions')
    .select('id, founder_a, founder_b')
    .limit(10);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  data.forEach((row, idx) => {
    console.log(`\n=== Row ${idx + 1} (ID: ${row.id}) ===`);
    console.log('Founder A JSON:', JSON.stringify(row.founder_a, null, 2));
    console.log('Founder B JSON:', JSON.stringify(row.founder_b, null, 2));
  });
}

inspectFullJson();
