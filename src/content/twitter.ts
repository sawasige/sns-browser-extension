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
      for (let i = 0; i < following.length; i++) {
        if (shouldStop) break;

        const user = following[i];
        // In fast mode, we check if "Follows you" badge exists
        // Since we collected from DOM, we can check the badge
        if (!user.followsYou) {
          const account: Account = {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            profileUrl: `https://x.com/${user.username}`,
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

    // Full mode: check each account's last post date
    sendProgress({
      status: 'scanning',
      current: 0,
      total: following.length,
      message: '各アカウントの情報を取得中...',
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

async function getLastPostDate(_username: string): Promise<Date | null> {
  // Twitter の API から最終投稿日を正確に取得するのは困難なため、
  // 現在は null を返し、フォローバックなしの検出のみに集中する
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
