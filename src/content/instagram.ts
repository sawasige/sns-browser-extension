import type { Account, ScanProgress } from '../types';
import { isInactiveForOneYear, parseRelativeDate } from '../utils/date';

const PLATFORM = 'instagram' as const;
const SCAN_DELAY_MS = 2000; // Increased delay to avoid rate limiting

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
    sendProgress({ status: 'scanning', current: 0, total: 0, message: 'スキャンを開始しています...' });

    // Get current username from URL or page
    const username = getCurrentUsername();
    if (!username) {
      throw new Error('ユーザー名を取得できませんでした。プロフィールページを開いてください。');
    }

    sendProgress({ status: 'scanning', current: 0, total: 0, message: 'フォロー中のアカウントを取得中...' });

    // Get following list (exclude self)
    const allFollowing = (await getFollowingList(username)).filter(
      (u) => u.username.toLowerCase() !== username.toLowerCase()
    );

    // Apply startIndex and limit
    const endIndex = Math.min(startIndex + limit, allFollowing.length);
    const following = allFollowing.slice(startIndex, endIndex);

    sendProgress({
      status: 'scanning',
      current: 0,
      total: following.length,
      message: `${allFollowing.length}件中 ${startIndex + 1}〜${endIndex} を処理します`,
    });

    // Get followers list
    const followers = await getFollowersList(username);
    const followerUsernames = new Set(followers.map((f) => f.username));

    if (shouldStop) {
      sendProgress({ status: 'completed', current: 0, total: 0, message: 'スキャンを中断しました' });
      return;
    }

    // Fast mode: just compare following vs followers, no individual API calls
    if (fastMode) {
      sendProgress({
        status: 'scanning',
        current: 0,
        total: following.length,
        message: `フォローバックなしをチェック中...`,
      });

      const accounts: Account[] = [];
      for (let i = 0; i < following.length; i++) {
        if (shouldStop) {
          break;
        }

        const user = following[i];
        const isFollowingYou = followerUsernames.has(user.username);

        if (!isFollowingYou) {
          const account: Account = {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            profileUrl: `https://www.instagram.com/${user.username}/`,
            platform: PLATFORM,
            lastPostDate: null,
            isFollowingYou: false,
            isInactive: false,
            isNotFollowingBack: true,
            scannedAt: new Date(),
          };
          accounts.push(account);
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
        message: `スキャン完了: ${accounts.length}件のフォローバックなしが見つかりました`,
      });

      chrome.runtime.sendMessage({
        type: 'SCAN_COMPLETE',
        platform: PLATFORM,
        data: accounts,
      });
      return;
    }

    // Full mode: check each account individually
    sendProgress({
      status: 'scanning',
      current: 0,
      total: following.length,
      message: `各アカウントの情報を取得中...`,
    });

    const accounts: Account[] = [];
    for (let i = 0; i < following.length; i++) {
      if (shouldStop) {
        sendProgress({
          status: 'completed',
          current: i,
          total: following.length,
          message: `スキャンを中断しました (${accounts.length}件検出)`,
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
        message: `@${user.username} をチェック中... (${startIndex + i + 1}/${allFollowing.length})`,
      });

      const lastPostDate = await getLastPostDate(user.username);
      const isFollowingYou = followerUsernames.has(user.username);

      const account: Account = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        profileUrl: `https://www.instagram.com/${user.username}/`,
        platform: PLATFORM,
        lastPostDate,
        isFollowingYou,
        isInactive: isInactiveForOneYear(lastPostDate),
        isNotFollowingBack: !isFollowingYou,
        scannedAt: new Date(),
      };

      if (account.isInactive || account.isNotFollowingBack) {
        accounts.push(account);
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
      message: `スキャン完了: ${accounts.length}件の該当アカウントが見つかりました`,
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
  // Try to get from URL
  const pathMatch = window.location.pathname.match(/^\/([^/]+)\/?/);
  if (pathMatch && !['explore', 'reels', 'direct', 'accounts'].includes(pathMatch[1])) {
    return pathMatch[1];
  }

  // Try to get from page meta
  const metaEl = document.querySelector('meta[property="al:ios:url"]');
  if (metaEl) {
    const content = metaEl.getAttribute('content');
    const match = content?.match(/user\?username=([^&]+)/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

interface BasicUserInfo {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

async function getFollowingList(username: string): Promise<BasicUserInfo[]> {
  // Instagram uses GraphQL API internally
  const followingUrl = `https://www.instagram.com/${username}/following/`;

  console.log(`[Instagram] Getting following list for: ${username}`);

  // Create a temporary fetch to get the data
  try {
    // Try to use Instagram's internal API
    const userId = await getUserId(username);
    console.log(`[Instagram] Got userId: ${userId}`);
    if (userId) {
      const followingData = await fetchFollowingFromApi(userId);
      console.log(`[Instagram] Got ${followingData.length} following from API`);
      return followingData;
    }
  } catch (e) {
    // Fall back to DOM scraping
    console.error('[Instagram] API fetch failed:', e);
  }

  // Fallback: parse from current page if modal is open
  const modalUsers = parseUsersFromModal();
  if (modalUsers.length > 0) {
    return modalUsers;
  }

  // If we're on the following page, parse from there
  if (window.location.pathname.includes('/following')) {
    return parseUsersFromPage();
  }

  // Navigate to following page and wait
  window.location.href = followingUrl;
  await delay(2000);
  return parseUsersFromPage();
}

async function getFollowersList(username: string): Promise<BasicUserInfo[]> {
  try {
    const userId = await getUserId(username);
    if (userId) {
      return await fetchFollowersFromApi(userId);
    }
  } catch {
    console.log('Failed to fetch followers from API');
  }

  return [];
}

async function getUserId(username: string): Promise<string | null> {
  try {
    console.log(`[Instagram] Getting user ID for: ${username}`);
    const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
      headers: {
        'X-IG-App-ID': '936619743392459',
      },
      credentials: 'include',
    });
    console.log(`[Instagram] getUserId response status: ${response.status}`);
    if (response.status === 429) {
      throw new Error('レート制限されています。しばらく時間をおいてから再度お試しください。');
    }
    const data = await response.json();
    console.log(`[Instagram] getUserId response:`, data);
    const userId = data.data?.user?.id || null;
    console.log(`[Instagram] User ID: ${userId}`);
    return userId;
  } catch (e) {
    console.error(`[Instagram] getUserId error:`, e);
    throw e;
  }
}

async function fetchFollowingFromApi(userId: string): Promise<BasicUserInfo[]> {
  const users: BasicUserInfo[] = [];
  let endCursor: string | null = null;
  let hasNext = true;

  console.log(`[Instagram] Fetching following for userId: ${userId}`);

  while (hasNext && !shouldStop) {
    const variables = {
      id: userId,
      first: 50,
      after: endCursor,
    };

    const url = `https://www.instagram.com/graphql/query/?query_hash=d04b0a864b4b54837c0d870b0e77e076&variables=${encodeURIComponent(JSON.stringify(variables))}`;

    try {
      const response = await fetch(url, { credentials: 'include' });
      console.log(`[Instagram] GraphQL response status: ${response.status}`);
      if (response.status === 429) {
        throw new Error('レート制限されています。しばらく時間をおいてから再度お試しください。');
      }
      const data = await response.json();
      console.log(`[Instagram] GraphQL response:`, data);
      const edges = data.data?.user?.edge_follow?.edges || [];

      for (const edge of edges) {
        const node = edge.node;
        users.push({
          id: node.id,
          username: node.username,
          displayName: node.full_name || node.username,
          avatarUrl: node.profile_pic_url,
        });
      }

      const pageInfo = data.data?.user?.edge_follow?.page_info;
      hasNext = pageInfo?.has_next_page || false;
      endCursor = pageInfo?.end_cursor || null;

      await delay(SCAN_DELAY_MS);
    } catch (e) {
      throw e;
    }
  }

  return users;
}

async function fetchFollowersFromApi(userId: string): Promise<BasicUserInfo[]> {
  const users: BasicUserInfo[] = [];
  let endCursor: string | null = null;
  let hasNext = true;

  while (hasNext && !shouldStop) {
    const variables = {
      id: userId,
      first: 50,
      after: endCursor,
    };

    const url = `https://www.instagram.com/graphql/query/?query_hash=c76146de99bb02f6415203be841dd25a&variables=${encodeURIComponent(JSON.stringify(variables))}`;

    try {
      const response = await fetch(url, { credentials: 'include' });
      if (response.status === 429) {
        throw new Error('レート制限されています。しばらく時間をおいてから再度お試しください。');
      }
      const data = await response.json();
      const edges = data.data?.user?.edge_followed_by?.edges || [];

      for (const edge of edges) {
        const node = edge.node;
        users.push({
          id: node.id,
          username: node.username,
          displayName: node.full_name || node.username,
          avatarUrl: node.profile_pic_url,
        });
      }

      const pageInfo = data.data?.user?.edge_followed_by?.page_info;
      hasNext = pageInfo?.has_next_page || false;
      endCursor = pageInfo?.end_cursor || null;

      await delay(SCAN_DELAY_MS);
    } catch (e) {
      throw e;
    }
  }

  return users;
}

function parseUsersFromModal(): BasicUserInfo[] {
  const users: BasicUserInfo[] = [];
  const userElements = document.querySelectorAll('[role="dialog"] a[href^="/"]');

  userElements.forEach((el) => {
    const href = el.getAttribute('href');
    if (href && href.startsWith('/') && !href.includes('/p/')) {
      const username = href.replace(/\//g, '');
      const img = el.querySelector('img');
      const nameEl = el.closest('[role="dialog"]')?.querySelector('span');

      users.push({
        id: username,
        username,
        displayName: nameEl?.textContent || username,
        avatarUrl: img?.src || '',
      });
    }
  });

  return users;
}

function parseUsersFromPage(): BasicUserInfo[] {
  const users: BasicUserInfo[] = [];
  const userLinks = document.querySelectorAll('a[href^="/"][role="link"]');

  userLinks.forEach((el) => {
    const href = el.getAttribute('href');
    if (href && !href.includes('/p/') && !href.includes('/explore/')) {
      const username = href.replace(/\//g, '');
      if (username && !['explore', 'reels', 'direct'].includes(username)) {
        const img = el.querySelector('img');
        users.push({
          id: username,
          username,
          displayName: username,
          avatarUrl: img?.src || '',
        });
      }
    }
  });

  return users;
}

async function getLastPostDate(username: string): Promise<Date | null> {
  try {
    const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
      headers: {
        'X-IG-App-ID': '936619743392459',
      },
      credentials: 'include',
    });
    if (response.status === 429) {
      throw new Error('レート制限されています。しばらく時間をおいてから再度お試しください。');
    }
    const data = await response.json();
    const posts = data.data?.user?.edge_owner_to_timeline_media?.edges || [];

    if (posts.length > 0) {
      const timestamp = posts[0].node.taken_at_timestamp;
      if (timestamp) {
        return new Date(timestamp * 1000);
      }
    }

    // Try to get from profile page DOM
    return parseLastPostDateFromDom();
  } catch {
    return null;
  }
}

function parseLastPostDateFromDom(): Date | null {
  // Look for time elements on the page
  const timeElements = document.querySelectorAll('time[datetime]');
  if (timeElements.length > 0) {
    const datetime = timeElements[0].getAttribute('datetime');
    if (datetime) {
      return new Date(datetime);
    }
  }

  // Look for relative date text
  const dateTexts = document.querySelectorAll('[datetime], time');
  for (const el of dateTexts) {
    const text = el.textContent;
    if (text) {
      const parsed = parseRelativeDate(text);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
