import type { Account, ScanProgress } from '../types';
import { isInactiveForOneYear } from '../utils/date';

const PLATFORM = 'twitter' as const;
const SCAN_DELAY_MS = 2000;

let isScanning = false;
let shouldStop = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ pong: true });
    return true;
  }
  if (message.type === 'STOP_SCAN' && message.platform === PLATFORM) {
    shouldStop = true;
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'START_SCAN' && message.platform === PLATFORM) {
    if (!isScanning) {
      const options = message.data as { startIndex?: number; limit?: number; scanMode?: string } | undefined;
      startScan(options?.startIndex ?? 0, options?.limit ?? 100, options?.scanMode === 'fast');
    }
    sendResponse({ success: true });
  }
  return true;
});

async function startScan(startIndex: number, limit: number, fastMode: boolean): Promise<void> {
  isScanning = true;
  shouldStop = false;

  try {
    // Check if we're on the /following page
    if (!window.location.pathname.includes('/following')) {
      const username = getCurrentUsername();
      if (username) {
        throw new Error(`x.com/${username}/following を開いてからスキャンしてください`);
      } else {
        throw new Error('自分のプロフィールの「フォロー中」ページを開いてからスキャンしてください');
      }
    }

    sendProgress({ status: 'scanning', current: 0, total: 0, message: 'スキャンを開始しています...' });

    const username = getCurrentUsername();
    if (!username) {
      throw new Error('ユーザー名を取得できませんでした');
    }

    sendProgress({ status: 'scanning', current: 0, total: 0, message: 'フォロー中のアカウントを取得中...' });

    // Get following list from DOM (scroll and collect)
    // Only collect up to startIndex + limit users
    const maxToCollect = startIndex + limit;
    const allFollowing = (await scrollAndCollectUsers(maxToCollect)).filter(
      (u) => u.username.toLowerCase() !== username.toLowerCase()
    );

    // Apply startIndex and limit
    const endIndex = Math.min(startIndex + limit, allFollowing.length);
    const following = allFollowing.slice(startIndex, endIndex);

    sendProgress({
      status: 'scanning',
      current: 0,
      total: following.length,
      message: `${following.length}件を処理します`,
    });

    if (shouldStop) {
      sendProgress({ status: 'completed', current: 0, total: 0, message: 'スキャンを中断しました' });
      return;
    }

    // Fast mode: check "Follows you" badge from DOM, no API calls
    if (fastMode) {
      sendProgress({
        status: 'scanning',
        current: 0,
        total: following.length,
        message: 'フォローバックなしをチェック中...',
      });

      const accounts: Account[] = [];
      let matchCount = 0;
      for (let i = 0; i < following.length; i++) {
        if (shouldStop) break;

        const user = following[i];
        const account: Account = {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          profileUrl: `https://x.com/${user.username}`,
          platform: PLATFORM,
          lastPostDate: null,
          isFollowingYou: user.followsYou,
          isInactive: false,
          isNotFollowingBack: !user.followsYou,
          scannedAt: new Date(),
        };
        accounts.push(account);

        if (!user.followsYou) {
          matchCount++;
          chrome.runtime.sendMessage({
            type: 'ACCOUNT_FOUND',
            platform: PLATFORM,
            data: account,
          });
        }

        sendProgress({
          status: 'scanning',
          current: i + 1,
          total: following.length,
          message: `チェック中... (${i + 1}/${following.length})`,
        });
      }

      sendProgress({
        status: 'completed',
        current: following.length,
        total: following.length,
        message: `スキャン完了: ${matchCount}件のフォローバックなしが見つかりました`,
      });

      chrome.runtime.sendMessage({
        type: 'SCAN_COMPLETE',
        platform: PLATFORM,
        data: accounts,
      });
      return;
    }

    // Full mode: check each account's last post date
    sendProgress({
      status: 'scanning',
      current: 0,
      total: following.length,
      message: '各アカウントの情報を取得中...',
    });

    const accounts: Account[] = [];
    let matchCount = 0;
    for (let i = 0; i < following.length; i++) {
      if (shouldStop) {
        sendProgress({
          status: 'completed',
          current: i,
          total: following.length,
          message: `スキャンを中断しました (${matchCount}件検出)`,
        });
        if (accounts.length > 0) {
          chrome.runtime.sendMessage({
            type: 'SCAN_COMPLETE',
            platform: PLATFORM,
            data: accounts,
          });
        }
        return;
      }

      const user = following[i];

      sendProgress({
        status: 'scanning',
        current: i + 1,
        total: following.length,
        message: `@${user.username} をチェック中... (${i + 1}/${following.length})`,
      });

      const lastPostDate = await getLastPostDate(user.username);

      const account: Account = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        profileUrl: `https://x.com/${user.username}`,
        platform: PLATFORM,
        lastPostDate,
        isFollowingYou: user.followsYou,
        isInactive: isInactiveForOneYear(lastPostDate),
        isNotFollowingBack: !user.followsYou,
        scannedAt: new Date(),
      };

      accounts.push(account);
      if (account.isInactive || account.isNotFollowingBack) {
        matchCount++;
        chrome.runtime.sendMessage({
          type: 'ACCOUNT_FOUND',
          platform: PLATFORM,
          data: account,
        });
      }

      await delay(SCAN_DELAY_MS);
    }

    sendProgress({
      status: 'completed',
      current: following.length,
      total: following.length,
      message: `スキャン完了: ${matchCount}件の該当アカウントが見つかりました`,
    });

    chrome.runtime.sendMessage({
      type: 'SCAN_COMPLETE',
      platform: PLATFORM,
      data: accounts,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'スキャン中にエラーが発生しました';
    chrome.runtime.sendMessage({
      type: 'SCAN_ERROR',
      platform: PLATFORM,
      data: { error: errorMessage },
    });
  } finally {
    isScanning = false;
    shouldStop = false;
  }
}

function sendProgress(progress: Omit<ScanProgress, 'platform'>): void {
  chrome.runtime.sendMessage({
    type: 'SCAN_PROGRESS',
    platform: PLATFORM,
    data: { ...progress, platform: PLATFORM },
  });
}

function getCurrentUsername(): string | null {
  const pathMatch = window.location.pathname.match(/^\/([^/]+)/);
  if (pathMatch) {
    const username = pathMatch[1];
    const nonUserPaths = ['home', 'explore', 'notifications', 'messages', 'i', 'search', 'compose', 'settings'];
    if (!nonUserPaths.includes(username)) {
      return username;
    }
  }
  return null;
}

interface BasicUserInfo {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  followsYou: boolean;
}

async function scrollAndCollectUsers(maxCount: number): Promise<BasicUserInfo[]> {
  const users: BasicUserInfo[] = [];
  const seenUsernames = new Set<string>();
  let noNewUsersCount = 0;
  const maxScrollAttempts = 50;

  for (let attempt = 0; attempt < maxScrollAttempts; attempt++) {
    if (shouldStop) break;

    // Stop if we have collected enough users
    if (users.length >= maxCount) {
      break;
    }

    const newUsers = parseUsersFromPage();

    let foundNew = false;
    for (const user of newUsers) {
      if (!seenUsernames.has(user.username)) {
        seenUsernames.add(user.username);
        users.push(user);
        foundNew = true;

        // Stop if we have collected enough users
        if (users.length >= maxCount) {
          break;
        }
      }
    }

    if (!foundNew) {
      noNewUsersCount++;
      if (noNewUsersCount >= 3) {
        break;
      }
    } else {
      noNewUsersCount = 0;
    }

    // Stop if we have collected enough users
    if (users.length >= maxCount) {
      break;
    }

    window.scrollTo(0, document.body.scrollHeight);
    await delay(1500);

    sendProgress({
      status: 'scanning',
      current: users.length,
      total: maxCount,
      message: `${users.length}件のアカウントを取得中... (最大${maxCount}件)`,
    });
  }

  return users;
}

function parseUsersFromPage(): BasicUserInfo[] {
  const users: BasicUserInfo[] = [];
  const userCells = document.querySelectorAll('[data-testid="UserCell"]');

  userCells.forEach((cell) => {
    const userLink = cell.querySelector('a[href^="/"][role="link"]');
    if (!userLink) return;

    const href = userLink.getAttribute('href');
    if (!href) return;

    const username = href.replace('/', '').split('/')[0];
    if (!username) return;

    const img = cell.querySelector('img[src*="profile_images"]');
    const avatarUrl = img?.getAttribute('src') || '';

    const displayNameEl = cell.querySelector('[dir="ltr"] > span');
    const displayName = displayNameEl?.textContent || username;

    // Check for "Follows you" badge
    const followsYouBadge = cell.textContent?.includes('フォローされています') ||
                           cell.textContent?.includes('Follows you');

    users.push({
      id: username,
      username,
      displayName,
      avatarUrl,
      followsYou: !!followsYouBadge,
    });
  });

  return users;
}

async function getLastPostDate(username: string): Promise<Date | null> {
  try {
    const csrfToken = getCookie('ct0');
    if (!csrfToken) {
      return null;
    }

    const bearerToken = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

    // First get user ID
    const userVariables = {
      screen_name: username,
      withSafetyModeUserFields: true,
    };

    const userFeatures = {
      hidden_profile_subscriptions_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      subscriptions_verification_info_is_identity_verified_enabled: true,
      subscriptions_verification_info_verified_since_enabled: true,
      highlights_tweets_tab_ui_enabled: true,
      responsive_web_twitter_article_notes_tab_enabled: true,
      subscriptions_feature_can_gift_premium: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
    };

    const userUrl = `https://x.com/i/api/graphql/xmU6X_CKVnQ5lSrCbAmJsg/UserByScreenName?variables=${encodeURIComponent(JSON.stringify(userVariables))}&features=${encodeURIComponent(JSON.stringify(userFeatures))}`;

    const userResponse = await fetch(userUrl, {
      headers: {
        'authorization': `Bearer ${bearerToken}`,
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
      },
      credentials: 'include',
    });

    if (!userResponse.ok) {
      return null;
    }

    const userData = await userResponse.json();
    const userId = userData?.data?.user?.result?.rest_id;
    if (!userId) {
      return null;
    }

    // Get user's tweets
    const timelineUrl = `https://x.com/i/api/graphql/E3opETHurmVJflFsUBVuUQ/UserTweets?variables=${encodeURIComponent(JSON.stringify({
      userId,
      count: 20,
      includePromotedContent: true,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
      withV2Timeline: true,
    }))}&features=${encodeURIComponent(JSON.stringify({
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      articles_preview_enabled: true,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    }))}&fieldToggles=${encodeURIComponent(JSON.stringify({
      withArticlePlainText: false,
    }))}`;

    const tweetsResponse = await fetch(timelineUrl, {
      headers: {
        'authorization': `Bearer ${bearerToken}`,
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
      },
      credentials: 'include',
    });

    if (!tweetsResponse.ok) {
      return null;
    }

    const tweetsData = await tweetsResponse.json();
    const instructions = tweetsData?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];

    for (const instruction of instructions) {
      if (instruction.type === 'TimelineAddEntries') {
        for (const entry of instruction.entries || []) {
          const tweet = entry?.content?.itemContent?.tweet_results?.result;
          if (tweet?.legacy?.created_at) {
            return new Date(tweet.legacy.created_at);
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
