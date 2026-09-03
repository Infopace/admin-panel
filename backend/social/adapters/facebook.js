/**
 * Facebook adapter (Phase 2). Same interface shape as youtube.js/
 * google-business.js — see youtube.js's header for the shared "why" on
 * the connect/publish/fetchMentions/fetchInbox/fetchAnalytics/sendReply
 * contract every adapter exports so routes/social.js, queue.js and
 * pollers.js never branch on platform name.
 *
 * Talks to a connected Facebook Page (not a personal profile — the
 * Graph API has no public posting endpoint for personal profiles).
 * See _meta-oauth.js for the token lifecycle (short-lived code ->
 * long-lived user token -> Page token) and the Meta App Review note on
 * pages_manage_posts.
 *
 * Setup: create a Meta App at developers.facebook.com, add the
 * "Facebook Login for Business" product, set redirect URI
 * {BACKEND_PUBLIC_URL}/api/social/callback/facebook, and set
 * META_APP_ID/META_APP_SECRET in .env (shared with instagram.js).
 */

const metaOAuth = require('./_meta-oauth');

const PLATFORM = 'facebook';
const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata', 'pages_messaging', 'read_insights'];

function isConfigured() {
  return metaOAuth.isConfigured();
}

const connect = {
  getAuthUrl(state) {
    return metaOAuth.buildAuthUrl(PLATFORM, SCOPES, state);
  },

  /**
   * A person can manage multiple Pages — Phase 2 auto-connects the first
   * one returned by /me/accounts, same documented "first one, run OAuth
   * again for another" limitation as google-business.js's location pick.
   */
  async exchangeCode(code) {
    const { userAccessToken, expiresAt } = await metaOAuth.exchangeCodeForLongLivedUserToken(PLATFORM, code);
    const pages = await metaOAuth.listPages(userAccessToken);
    const page = pages[0];
    if (!page) throw new Error('Facebook OAuth succeeded but this user manages no Pages to connect.');

    return {
      accessToken: page.access_token,      // Page token — used for all Graph calls below
      refreshToken: userAccessToken,        // the long-lived USER token — needed to re-derive a Page token on refresh
      expiresAt,
      externalAccountId: page.id,
      accountLabel: page.name
    };
  }
};

/**
 * Re-derives a fresh Page token from a re-exchanged long-lived user
 * token. Needs the Page id, so accounts.js passes the full account as a
 * second argument (youtube.js/google-business.js ignore it).
 */
async function refreshAccessToken(refreshToken, account) {
  const { userAccessToken, expiresAt } = await metaOAuth.refreshLongLivedUserToken(refreshToken);
  const pages = await metaOAuth.listPages(userAccessToken);
  const page = pages.find(p => p.id === account.externalAccountId);
  if (!page) throw new Error(`Page ${account.externalAccountId} is no longer manageable by this Meta user.`);
  return { accessToken: page.access_token, refreshToken: userAccessToken, expiresAt };
}

/** post: { content, mediaUrls }. A single photo, or a text-only feed post. */
async function publish(account, post) {
  if (post.mediaUrls && post.mediaUrls.length > 0) {
    const data = await metaOAuth.graphPost(`/${account.externalAccountId}/photos`, {
      url: post.mediaUrls[0],
      caption: post.content || '',
      access_token: account.accessToken
    });
    return { externalPostId: data.post_id || data.id, url: null };
  }

  if (!post.content) throw new Error('A Facebook post needs text content or a media URL.');
  const data = await metaOAuth.graphPost(`/${account.externalAccountId}/feed`, {
    message: post.content,
    access_token: account.accessToken
  });
  return { externalPostId: data.id, url: `https://facebook.com/${data.id}` };
}

/** "Mentions" = comments on the Page's own recent posts. */
async function fetchMentions(account) {
  const data = await metaOAuth.graphFetch(`/${account.externalAccountId}/feed`, {
    fields: 'comments{id,message,from,created_time,permalink_url}',
    access_token: account.accessToken
  });

  const comments = [];
  for (const post of data.data || []) {
    for (const c of (post.comments && post.comments.data) || []) {
      comments.push({
        externalId: c.id,
        author: c.from && c.from.name,
        text: c.message,
        url: c.permalink_url || null,
        capturedAt: c.created_time
      });
    }
  }
  return comments;
}

/** Messenger conversations for this Page. */
async function fetchInbox(account) {
  const data = await metaOAuth.graphFetch(`/${account.externalAccountId}/conversations`, {
    fields: 'id,snippet,updated_time,participants',
    access_token: account.accessToken
  });

  return (data.data || []).map(conv => ({
    externalThreadId: conv.id,
    sender: (conv.participants && conv.participants.data && conv.participants.data.map(p => p.name).join(', ')) || null,
    message: conv.snippet,
    receivedAt: conv.updated_time
  }));
}

/**
 * Replies to either a comment (mentions) or a Messenger conversation
 * (inbox) — externalId here is inbox_messages.external_thread_id, which
 * for a comment reply is the comment id and for Messenger is the
 * conversation id. The Send API needs a recipient id for Messenger, not
 * just the conversation id, so a Messenger reply additionally looks the
 * participant up first.
 */
async function sendReply(account, externalId, message) {
  if (externalId.includes('_')) {
    // Graph comment ids contain an underscore (postId_commentId); reply
    // as a nested comment.
    const data = await metaOAuth.graphPost(`/${externalId}/comments`, { message, access_token: account.accessToken });
    return { externalId: data.id };
  }

  const conv = await metaOAuth.graphFetch(`/${externalId}`, { fields: 'participants', access_token: account.accessToken });
  const recipient = (conv.participants && conv.participants.data || []).find(p => p.id !== account.externalAccountId);
  if (!recipient) throw new Error(`Could not resolve a Messenger recipient for conversation ${externalId}.`);

  const data = await metaOAuth.graphPost('/me/messages', {
    recipient: JSON.stringify({ id: recipient.id }),
    message: JSON.stringify({ text: message }),
    access_token: account.accessToken
  });
  return { externalId: data.message_id };
}

async function fetchAnalytics(account) {
  const data = await metaOAuth.graphFetch(`/${account.externalAccountId}/insights`, {
    metric: 'page_impressions,page_fans,page_engaged_users',
    period: 'day',
    access_token: account.accessToken
  });

  const out = [];
  for (const series of data.data || []) {
    const metric = series.name.replace('page_', '');
    for (const point of series.values || []) {
      out.push({ metric, value: Number(point.value || 0), capturedDate: point.end_time.slice(0, 10) });
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
    name: 'Facebook',
    platform: PLATFORM,
    description: 'Page post publishing, comment monitoring/replies, Messenger inbox, and Page Insights via the Graph API.'
  }
};
