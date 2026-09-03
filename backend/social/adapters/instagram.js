/**
 * Instagram adapter (Phase 2). Same interface shape as facebook.js (see
 * that file's header, and youtube.js's for the shared "why" on the
 * contract) — Instagram publishing/reading always goes through the
 * Facebook Page it's linked to, using that Page's access token, not a
 * separate Instagram OAuth (see _meta-oauth.js).
 *
 * "publish" maps to the Content Publishing API's two-step flow (create
 * a media container, then publish it) — Instagram has no text-only
 * post, same constraint as YouTube: media_urls is required.
 *
 * Setup: same Meta App as facebook.js (META_APP_ID/SECRET), redirect URI
 * {BACKEND_PUBLIC_URL}/api/social/callback/instagram added, and the
 * connected Page must have an Instagram Business (or Creator) account
 * linked to it in Meta Business Suite — Instagram Graph API access only
 * exists for accounts of that type, never a regular personal account.
 */

const metaOAuth = require('./_meta-oauth');

const PLATFORM = 'instagram';
// Instagram publishing/insights ride on the same Page-scoped permissions
// as facebook.js, plus instagram_content_publish and instagram_manage_comments/insights.
const SCOPES = [
  'pages_show_list', 'pages_read_engagement',
  'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_insights'
];

function isConfigured() {
  return metaOAuth.isConfigured();
}

const connect = {
  getAuthUrl(state) {
    return metaOAuth.buildAuthUrl(PLATFORM, SCOPES, state);
  },

  /**
   * Same "first eligible Page" auto-pick as facebook.js, but only
   * considers Pages that actually have an Instagram Business Account
   * linked — a Page without one can't be used here at all.
   */
  async exchangeCode(code) {
    const { userAccessToken, expiresAt } = await metaOAuth.exchangeCodeForLongLivedUserToken(PLATFORM, code);
    const pages = await metaOAuth.listPages(userAccessToken);
    const page = pages.find(p => p.instagram_business_account && p.instagram_business_account.id);
    if (!page) {
      throw new Error('No connected Facebook Page has an Instagram Business/Creator account linked — link one in Meta Business Suite first.');
    }

    return {
      accessToken: page.access_token,
      refreshToken: userAccessToken,
      expiresAt,
      externalAccountId: page.instagram_business_account.id, // the IG user id Graph calls target
      accountLabel: page.name
    };
  }
};

async function refreshAccessToken(refreshToken, account) {
  const { userAccessToken, expiresAt } = await metaOAuth.refreshLongLivedUserToken(refreshToken);
  const pages = await metaOAuth.listPages(userAccessToken);
  const page = pages.find(p => p.instagram_business_account && p.instagram_business_account.id === account.externalAccountId);
  if (!page) throw new Error(`Instagram account ${account.externalAccountId} is no longer manageable by this Meta user.`);
  return { accessToken: page.access_token, refreshToken: userAccessToken, expiresAt };
}

/** post: { content, mediaUrls }. mediaUrls[0] is required — image or video/reel URL. */
async function publish(account, post) {
  if (!post.mediaUrls || post.mediaUrls.length === 0) {
    throw new Error('Instagram has no text-only post — attach an image or video URL to publish here.');
  }

  const isVideo = /\.(mp4|mov)(\?|$)/i.test(post.mediaUrls[0]);
  const container = await metaOAuth.graphPost(`/${account.externalAccountId}/media`, {
    [isVideo ? 'video_url' : 'image_url']: post.mediaUrls[0],
    caption: post.content || '',
    ...(isVideo ? { media_type: 'REELS' } : {}),
    access_token: account.accessToken
  });

  const published = await metaOAuth.graphPost(`/${account.externalAccountId}/media_publish`, {
    creation_id: container.id,
    access_token: account.accessToken
  });

  return { externalPostId: published.id, url: null };
}

/** "Mentions" = comments on the account's own recent media. */
async function fetchMentions(account) {
  const data = await metaOAuth.graphFetch(`/${account.externalAccountId}/media`, {
    fields: 'id,permalink,comments{id,text,username,timestamp}',
    access_token: account.accessToken
  });

  const comments = [];
  for (const media of data.data || []) {
    for (const c of (media.comments && media.comments.data) || []) {
      comments.push({
        externalId: c.id,
        author: c.username,
        text: c.text,
        url: media.permalink || null,
        capturedAt: c.timestamp
      });
    }
  }
  return comments;
}

// Instagram DMs require the separate, more heavily gated Instagram
// Messaging API — out of Phase 2 scope. Comments (fetchMentions) are the
// inbound channel this adapter covers for now, same limitation youtube.js
// documents for its own lack of a DM API.
async function fetchInbox() {
  return [];
}

/** Reply to a comment (used by the Mentions reply action). */
async function sendReply(account, externalId, message) {
  const data = await metaOAuth.graphPost(`/${externalId}/replies`, { message, access_token: account.accessToken });
  return { externalId: data.id };
}

async function fetchAnalytics(account) {
  const data = await metaOAuth.graphFetch(`/${account.externalAccountId}/insights`, {
    metric: 'reach,profile_views,follower_count',
    period: 'day',
    access_token: account.accessToken
  });

  const out = [];
  for (const series of data.data || []) {
    for (const point of series.values || []) {
      out.push({ metric: series.name, value: Number(point.value || 0), capturedDate: (point.end_time || new Date().toISOString()).slice(0, 10) });
    }
  }
  return out;
}

module.exports = {
  isConfigured,
  connect,
  publish,
  fetchMentions,
  fetchInbox,
  sendReply,
  fetchAnalytics,
  refreshAccessToken,
  metadata: {
    name: 'Instagram',
    platform: PLATFORM,
    description: 'Media publishing, comment monitoring/replies, and account insights via the Instagram Graph API (linked Facebook Page required).'
  }
};
