import type { Account, Platform, StorageData } from '../types';

const STORAGE_KEY = 'sns_follower_manager_data';

function serializeDate(date: Date | string | null): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString();
}

function deserializeDate(dateStr: string | null): Date | null {
  return dateStr ? new Date(dateStr) : null;
}

function serializeAccount(account: Account): Record<string, unknown> {
  return {
    ...account,
    lastPostDate: serializeDate(account.lastPostDate),
    scannedAt: serializeDate(account.scannedAt),
  };
}

function deserializeAccount(data: Record<string, unknown>): Account {
  return {
    ...data,
    lastPostDate: deserializeDate(data.lastPostDate as string | null),
    scannedAt: new Date(data.scannedAt as string),
  } as Account;
}

export async function getStoredData(): Promise<StorageData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const data = result[STORAGE_KEY];

  if (!data) {
    return {
      accounts: [],
      lastScanDate: {
        instagram: null,
        twitter: null,
        threads: null,
      },
    };
  }

  return {
    accounts: (data.accounts || []).map(deserializeAccount),
    lastScanDate: {
      instagram: deserializeDate(data.lastScanDate?.instagram),
      twitter: deserializeDate(data.lastScanDate?.twitter),
      threads: deserializeDate(data.lastScanDate?.threads),
    },
  };
}

export async function saveAccounts(accounts: Account[], platform: Platform): Promise<void> {
  const currentData = await getStoredData();

  // Remove old accounts for this platform and add new ones
  const otherAccounts = currentData.accounts.filter((a) => a.platform !== platform);
  const newAccounts = [...otherAccounts, ...accounts];

  const dataToSave = {
    accounts: newAccounts.map(serializeAccount),
    lastScanDate: {
      ...currentData.lastScanDate,
      [platform]: serializeDate(new Date()),
    },
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: dataToSave });
}

export async function getAccountsByPlatform(platform: Platform): Promise<Account[]> {
  const data = await getStoredData();
  return data.accounts.filter((a) => a.platform === platform);
}

export async function getAllAccounts(): Promise<Account[]> {
  const data = await getStoredData();
  return data.accounts;
}

export async function clearData(platform?: Platform): Promise<void> {
  if (platform) {
    const currentData = await getStoredData();
    const filteredAccounts = currentData.accounts.filter((a) => a.platform !== platform);

    const dataToSave = {
      accounts: filteredAccounts.map(serializeAccount),
      lastScanDate: {
        ...currentData.lastScanDate,
        [platform]: null,
      },
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: dataToSave });
  } else {
    await chrome.storage.local.remove(STORAGE_KEY);
  }
}

export async function getLastScanDate(platform: Platform): Promise<Date | null> {
  const data = await getStoredData();
  return data.lastScanDate[platform];
}
