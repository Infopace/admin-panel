// Same hardcoded-base-URL convention App.jsx already uses for API_BASE —
// one constant, no env var layer in this frontend today.
export const SOCIAL_API_BASE = 'http://localhost:5000/api/social';

export const PLATFORM_LABELS = {
  youtube: 'YouTube',
  google_business: 'Google Business Profile',
  facebook: 'Facebook',
  instagram: 'Instagram',
  pinterest: 'Pinterest',
  linkedin: 'LinkedIn',
  x: 'X'
};

// Phase 1 only — server.js's SOCIAL_ADAPTERS map (backend/social/adapters/index.js)
// is the real source of truth; this list just drives which platforms the
// Composer/ConnectAccounts UI offers until Phase 2+ adds more adapters.
export const AVAILABLE_PLATFORMS = ['youtube', 'google_business'];
