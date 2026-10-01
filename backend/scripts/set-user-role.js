/**
 * Assigns a role to an admin-panel login account in data/users.json.
 * Self-registration always creates 'admin' accounts, so this is how
 * someone gets put on the finance team (the only role that can open the
 * Sales module — see requireRole() in server.js).
 *
 * Usage:
 *   node backend/scripts/set-user-role.js <email> <admin|finance>
 *   node backend/scripts/set-user-role.js <email> <admin|finance> --password <password>
 *
 * --password creates the account if it doesn't exist yet, or resets the
 * password of an existing one. The change takes effect on the user's next
 * request — no restart or re-login needed.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const ROLES = ['admin', 'finance'];

const [email, role, flag, password] = process.argv.slice(2);

if (!email || !ROLES.includes(role) || (flag !== undefined && (flag !== '--password' || !password))) {
  console.error('Usage: node backend/scripts/set-user-role.js <email> <admin|finance> [--password <password>]');
  process.exit(1);
}
if (password && password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : [];
let user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

if (!user) {
  if (!password) {
    console.error(`No account for ${email}. Pass --password <password> to create it.`);
    process.exit(1);
  }
  user = { id: Date.now().toString(), email: email.toLowerCase(), createdAt: new Date().toISOString() };
  users.push(user);
  console.log(`Created account ${user.email}.`);
}

user.role = role;
if (password) user.password = bcrypt.hashSync(password, 10);

fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
console.log(`${user.email} is now '${role}'${password ? ' (password set)' : ''}.`);
