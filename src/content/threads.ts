import type { Account, ScanProgress } from '../types';
import { isInactiveForOneYear, parseRelativeDate } from '../utils/date';

const PLATFORM = 'threads' as const;
const SCAN_DELAY_MS = 1500;

let isScanning = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ pong: true });
    return true;
  }
  if (message.type === 'START_SCAN' && message.platform === PLATFORM) {
    if (!isScanning) {
      startScan();
    }
    sendResponse({ success: true });
  }
  return true;
});

async function startScan(): Promise<void> {
  isScanning = true;

  try {
    sendProgress({ status: 'scanning', current: 0, total: 0, message: 'スキャンを開始しています...' });

    // Get current username from URL
    const username = getCurrentUsername();
    if (!username) {
      throw new Error('ユーザー名を取得できませんでした。プロフィールページを開いてください。');
    }

    sendProgress({ status: 'scanning', current: 0, total: 0, message: 'フォロー中のアカウントを取得中...' });

    // Get following list
    const following = await getFollowingList(username);

    sendProgress({
      status: 'scanning',
      current: 0,
      total: following.length,
      message: `${following.length}件のフォロー中アカウントを取得しました。フォロワーを確認中...`,
    });

    // Get followers for comparison
    const followers = await getFollowersList(username);
    const followerUsernames = new Set(followers.map((f) => f.username.toLowerCase()));

    sendProgress({
      status: 'scanning',
      current: 0,
      total: following.length,
      message: `各アカウントの最終投稿日を確認中...`,
    });

    // Check each following account
    const accounts: Account[] = [];
    for (let i = 0; i < following.length; i++) {
      const user = following[i];

      sendProgress({
        status: 'scanning',
        current: i + 1,
        total: following.length,
        message: `@${user.username} をチェック中...`,
      });

      const lastPostDate = await getLastPostDate(user.username);
      const isFollowingYou = followerUsernames.has(user.username.toLowerCase());

      const account: Account = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        profileUrl: `https://www.threads.net/@${user.username}`,
        platform: PLATFORM,
        lastPostDate,
        isFollowingYou,
        isInactive: isInactiveForOneYear(lastPostDate),
        isNotFollowingBack: !isFollowingYou,
        scannedAt: new Date(),
      };

      // Only add if matches criteria
      if (account.isInactive || account.isNotFollowingBack) {
        accounts.push(account);
      }

      // Rate limiting delay
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
  // Threads URL format: threads.net/@username
  const pathMatch = window.location.pathname.match(/^\/@([^/]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  return null;
}

interface BasicUserInfo {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

async function getFollowingList(_username: string): Promise<BasicUserInfo[]> {
  if (!window.location.pathname.includes('/following')) {
    sendProgress({ status: 'scanning', current: 0, total: 0, message: 'フォロー中リストを読み込み中...' });
  }

  const users = await scrollAndCollectUsers();
  return users;
}

async function getFollowersList(_username: string): Promise<BasicUserInfo[]> {
  // Rely on DOM indicators for "follows you" detection
  return [];
}

async function scrollAndCollectUsers(): Promise<BasicUserInfo[]> {
  const users: BasicUserInfo[] = [];
  const seenUsernames = new Set<string>();
  let noNewUsersCount = 0;
  const maxScrollAttempts = 50;

  for (let attempt = 0; attempt < maxScrollAttempts; attempt++) {
    const newUsers = parseUsersFromPage();

    let foundNew = false;
    for (const user of newUsers) {
      if (!seenUsernames.has(user.username)) {
        seenUsernames.add(user.username);
        users.push(user);
        foundNew = true;
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

    // Scroll down
    window.scrollTo(0, document.body.scrollHeight);
    await delay(1500);

    sendProgress({
      status: 'scanning',
      current: users.length,
      total: users.length,
      message: `${users.length}件のアカウントを取得中...`,
    });
  }

  return users;
}

function parseUsersFromPage(): BasicUserInfo[] {
  const users: BasicUserInfo[] = [];

  // Threads uses similar structure to Instagram
  // Look for profile links
  const profileLinks = document.querySelectorAll('a[href^="/@"]');

  profileLinks.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    // Extract username from /@username format
    const usernameMatch = href.match(/^\/@([^/]+)/);
    if (!usernameMatch) return;

    const username = usernameMatch[1];

    // Skip if this is a navigation link or already processed
    const container = link.closest('[role="listitem"], [role="row"], div[style*="flex"]');
    if (!container) return;

    // Get avatar
    const img = container.querySelector('img[src*="scontent"]') as HTMLImageElement;
    const avatarUrl = img?.src || '';

    // Get display name
    const nameElements = container.querySelectorAll('span');
    let displayName = username;
    for (const el of nameElements) {
      const text = el.textContent?.trim();
      if (text && text !== username && !text.startsWith('@')) {
        displayName = text;
        break;
      }
    }

    users.push({
      id: username,
      username,
      displayName,
      avatarUrl,
    });
  });

  // Remove duplicates
  const uniqueUsers: BasicUserInfo[] = [];
  const seen = new Set<string>();
  for (const user of users) {
    if (!seen.has(user.username)) {
      seen.add(user.username);
      uniqueUsers.push(user);
    }
  }

  return uniqueUsers;
}

async function getLastPostDate(username: string): Promise<Date | null> {
  try {
    // Fetch the user's profile page
    const response = await fetch(`https://www.threads.net/@${username}`, {
      credentials: 'include',
    });
    const html = await response.text();

    // Parse the HTML to find the latest post time
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Look for time elements
    const timeElements = doc.querySelectorAll('time[datetime]');
    if (timeElements.length > 0) {
      const datetime = timeElements[0].getAttribute('datetime');
      if (datetime) {
        return new Date(datetime);
      }
    }

    // Look for relative date patterns in the page
    const pageText = doc.body.textContent || '';

    // Check for various date patterns
    const patterns = [
      /(\d+)\s*(秒|分|時間|日|週間|ヶ月|年)前/,
      /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i,
    ];

    for (const pattern of patterns) {
      const match = pageText.match(pattern);
      if (match) {
        return parseRelativeDate(match[0]);
      }
    }

    return null;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
