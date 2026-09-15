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
  whatsapp: 'WhatsApp',
  x: 'X'
};

// backend/social/adapters/index.js is the real source of truth; this
// list just drives which platforms Connect Accounts/Inbox offer. Phase 1:
// youtube, google_business. Phase 2 adds facebook, instagram. Phase 3
// adds linkedin (personal-profile posting only — see
// backend/social/adapters/linkedin.js). Phase 4 adds whatsapp — note
// Composer.jsx deliberately does NOT use this list; it excludes whatsapp
// explicitly, since it's messaging-only and has no publish() (see
// backend/social/adapters/whatsapp.js). x stays out until its external
// approval clears.
export const AVAILABLE_PLATFORMS = ['youtube', 'google_business', 'facebook', 'instagram', 'linkedin', 'whatsapp'];
