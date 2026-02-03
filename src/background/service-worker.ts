import type { Account, Message, Platform } from '../types';
import { saveAccounts, getAllAccounts, getAccountsByPlatform, clearData } from '../utils/storage';

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Handle messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep the message channel open for async response
});

async function handleMessage(
  message: Message,
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'SCAN_COMPLETE': {
      const accounts = message.data as Account[];
      const platform = message.platform as Platform;
      await saveAccounts(accounts, platform);
      // Notify side panel
      broadcastToSidePanel({
        type: 'ACCOUNTS_DATA',
        platform,
        data: accounts,
      });
      return { success: true };
    }

    case 'SCAN_PROGRESS': {
      // Forward progress to side panel
      broadcastToSidePanel(message);
      return { success: true };
    }

    case 'SCAN_ERROR': {
      // Forward error to side panel
      broadcastToSidePanel(message);
      return { success: true };
    }

    case 'ACCOUNT_FOUND': {
      // Forward to side panel for real-time count update
      broadcastToSidePanel(message);
      return { success: true };
    }

    case 'GET_ACCOUNTS': {
      const platform = message.platform;
      const accounts = platform
        ? await getAccountsByPlatform(platform)
        : await getAllAccounts();
      return { accounts };
    }

    case 'CLEAR_DATA': {
      await clearData(message.platform);
      return { success: true };
    }

    case 'START_SCAN': {
      const platform = message.platform as Platform;
      const options = message.data as { startIndex?: number; limit?: number; scanMode?: string } | undefined;
      await startScan(platform, options?.startIndex ?? 0, options?.limit ?? 100, options?.scanMode ?? 'fast');
      return { success: true };
    }

    case 'STOP_SCAN': {
      const platform = message.platform as Platform;
      await stopScan(platform);
      return { success: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

async function broadcastToSidePanel(message: Message): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Side panel might not be open, ignore the error
  }
}

async function startScan(platform: Platform, startIndex: number, limit: number, scanMode: string): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    broadcastToSidePanel({
      type: 'SCAN_ERROR',
      platform,
      data: { error: 'アクティブなタブが見つかりません' },
    });
    return;
  }

  const url = tab.url || '';
  const isCorrectSite = checkPlatformUrl(url, platform);

  if (!isCorrectSite) {
    const platformUrls: Record<Platform, string> = {
      instagram: 'instagram.com',
      twitter: 'x.com または twitter.com',
      threads: 'threads.net',
    };

    broadcastToSidePanel({
      type: 'SCAN_ERROR',
      platform,
      data: { error: `${platformUrls[platform]} を開いてください` },
    });
    return;
  }

  const scanMessage = {
    type: 'START_SCAN',
    platform,
    data: { startIndex, limit, scanMode },
  };

  // Try to send message to content script, inject if needed
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    // Content script is loaded, send scan message
    await chrome.tabs.sendMessage(tab.id, scanMessage);
  } catch {
    // Content script not loaded, inject it first
    try {
      const scriptFile = getContentScriptFile(platform);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [scriptFile],
      });

      // Wait a bit for the script to initialize
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Now send the scan message
      await chrome.tabs.sendMessage(tab.id, scanMessage);
    } catch (error) {
      console.error('Failed to inject content script:', error);
      broadcastToSidePanel({
        type: 'SCAN_ERROR',
        platform,
        data: { error: 'スクリプトの注入に失敗しました。ページをリロードしてください。' },
      });
    }
  }
}

async function stopScan(platform: Platform): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'STOP_SCAN', platform });
    } catch {
      // Ignore errors
    }
  }
}

function getContentScriptFile(platform: Platform): string {
  switch (platform) {
    case 'instagram':
      return 'content-instagram.js';
    case 'twitter':
      return 'content-twitter.js';
    case 'threads':
      return 'content-threads.js';
  }
}

function checkPlatformUrl(url: string, platform: Platform): boolean {
  switch (platform) {
    case 'instagram':
      return url.includes('instagram.com');
    case 'twitter':
      return url.includes('x.com') || url.includes('twitter.com');
    case 'threads':
      return url.includes('threads.net');
    default:
      return false;
  }
}
