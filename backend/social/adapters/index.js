/**
 * Registry of social platform adapters — the social-module equivalent of
 * server.js's `const ADAPTERS = { db1, db2, ... }`. routes/social.js and
 * scheduler.js only ever go through this map, never a platform-specific
 * require, so adding facebook.js/instagram.js/pinterest.js in a later
 * phase is a one-line addition here and nowhere else.
 *
 * Phase 1 only registers youtube + google_business per the build order —
 * the other platforms in the schema's `platform` check (facebook,
 * instagram, linkedin, x, pinterest) are valid data values but have no
 * adapter here yet, so any route touching them 404s with a clear
 * "not available yet" rather than crashing.
 */

const youtube = require('./youtube');
const googleBusiness = require('./google-business');

module.exports = {
  youtube,
  google_business: googleBusiness
};
