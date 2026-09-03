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

// backend/social/adapters/index.js is the real source of truth; this
// list just drives which platforms the Composer/ConnectAccounts UI
// offers. Phase 1: youtube, google_business. Phase 2 adds facebook,
// instagram. linkedin/x stay out until their external approval clears.
export const AVAILABLE_PLATFORMS = ['youtube', 'google_business', 'facebook', 'instagram'];
