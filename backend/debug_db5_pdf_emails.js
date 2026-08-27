const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL_5;
const key = process.env.SUPABASE_KEY_5;

const supabase = createClient(url, key);

async function checkEmails() {
  console.log('Fetching distinct user emails from users table...');
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('email');

  if (userError) {
    console.error('Error fetching users:', userError.message);
    return;
  }

  console.log('Fetching distinct emails from pdf_reports table...');
  const { data: pdfs, error: pdfError } = await supabase
    .from('pdf_reports')
    .select('user_email, public_url');

  if (pdfError) {
    console.error('Error fetching pdf_reports:', pdfError.message);
    return;
  }

  const userEmailsList = users.map(u => u.email.trim().toLowerCase());
  const pdfEmailsList = pdfs.map(p => p.user_email.trim().toLowerCase());

  console.log('\nUsers Emails in DB:', JSON.stringify([...new Set(userEmailsList)], null, 2));
  console.log('\nPDF Reports Emails in DB:', JSON.stringify([...new Set(pdfEmailsList)], null, 2));

  console.log('\nList of PDF Reports matching users:');
  pdfs.forEach(p => {
    const email = p.user_email.trim().toLowerCase();
    const hasUser = userEmailsList.includes(email);
    console.log(`- Email in PDF table: "${p.user_email}" | Has matching user in users table? ${hasUser ? 'YES' : 'NO'} | URL: ${p.public_url}`);
  });
}

checkEmails();
