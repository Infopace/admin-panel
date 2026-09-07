/**
 * Read-only view of the admin accounts in data/users.json, for anything
 * that needs to list "who can this be assigned to" (currently just the
 * Inbox's assignee dropdown, routes/social.js's GET /social/team) without
 * pulling in password hashes or duplicating server.js's own
 * readUsers()/writeUsers() (which stay there since nothing else writes
 * this file).
 */

const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

function listUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data).map(u => ({ id: u.id, email: u.email }));
  } catch (err) {
    return [];
  }
}

module.exports = { listUsers };
