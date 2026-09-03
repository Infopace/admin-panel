/**
 * Supabase client for the social module's own project — a dedicated
 * project holding social_accounts / scheduled_posts / mentions /
 * inbox_messages / analytics_snapshots (backend/migrations/001_social_schema.sql),
 * separate from the 6 per-tool assessment projects db1-db6 talk to since
 * none of this is assessment data. Same "cache the client, fall back to
 * null when unconfigured" shape as getSupabaseClient() in server.js.
 */

const { createClient } = require('@supabase/supabase-js');

let cachedClient = null;

function isConfigured() {
  return !!(process.env.SUPABASE_URL_SOCIAL && process.env.SUPABASE_KEY_SOCIAL);
}

function getSocialClient() {
  if (!isConfigured()) return null;
  if (!cachedClient) {
    try {
      cachedClient = createClient(process.env.SUPABASE_URL_SOCIAL, process.env.SUPABASE_KEY_SOCIAL);
    } catch (e) {
      console.error('Failed to create social Supabase client:', e.message);
      return null;
    }
  }
  return cachedClient;
}

module.exports = { getSocialClient, isConfigured };
