const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL_5;
const key = process.env.SUPABASE_KEY_5;

const supabase = createClient(url, key);

async function inspectAllPdfs() {
  console.log('Querying all rows in pdf_reports table...');
  const { data, error } = await supabase
    .from('pdf_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log(`Total rows in pdf_reports: ${data.length}`);
    data.forEach(row => {
      console.log(`ID: ${row.id} | Email: "${row.user_email}" | Assessment ID: ${row.assessment_id} | Path: "${row.storage_path}" | Public URL: "${row.public_url}"`);
    });
  }
}

inspectAllPdfs();
