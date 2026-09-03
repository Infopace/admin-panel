/**
 * Registry of social platform adapters — the social-module equivalent of
 * server.js's `const ADAPTERS = { db1, db2, ... }`. routes/social.js and
 * scheduler.js only ever go through this map, never a platform-specific
 * require, so adding facebook.js/instagram.js/pinterest.js in a later
 * phase is a one-line addition here and nowhere else.
 *
 * Phase 1 registered youtube + google_business; Phase 2 adds facebook +
 * instagram. linkedin/x are still unregistered — valid `platform` values
 * in the schema, but blocked on external approval per the build spec, so
 * any route touching them 404s with a clear "not available yet" rather
 * than crashing.
 */

const youtube = require('./youtube');
const googleBusiness = require('./google-business');
const facebook = require('./facebook');
const instagram = require('./instagram');

module.exports = {
  youtube,
  google_business: googleBusiness,
  facebook,
  instagram
};
