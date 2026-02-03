export type Platform = 'instagram' | 'twitter' | 'threads';

export type FilterType = 'inactive' | 'not_following_back' | 'both';

export interface Account {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  platform: Platform;
  lastPostDate: Date | null;
  isFollowingYou: boolean;
  isInactive: boolean;
  isNotFollowingBack: boolean;
  scannedAt: Date;
}

export interface ScanProgress {
  platform: Platform;
  status: 'idle' | 'scanning' | 'completed' | 'error';
  current: number;
  total: number;
  message: string;
}

export interface StorageData {
  accounts: Account[];
  lastScanDate: Record<Platform, Date | null>;
}

export type MessageType =
  | 'START_SCAN'
  | 'STOP_SCAN'
  | 'SCAN_PROGRESS'
  | 'SCAN_COMPLETE'
  | 'SCAN_ERROR'
  | 'GET_ACCOUNTS'
  | 'ACCOUNTS_DATA'
  | 'ACCOUNT_FOUND'
  | 'CLEAR_DATA';

export interface Message {
  type: MessageType;
  platform?: Platform;
  data?: unknown;
}

export interface ScanStartMessage extends Message {
  type: 'START_SCAN';
  platform: Platform;
}

export interface ScanProgressMessage extends Message {
  type: 'SCAN_PROGRESS';
  platform: Platform;
  data: ScanProgress;
}

export interface ScanCompleteMessage extends Message {
  type: 'SCAN_COMPLETE';
  platform: Platform;
  data: Account[];
}

export interface ScanErrorMessage extends Message {
  type: 'SCAN_ERROR';
  platform: Platform;
  data: { error: string };
}

export interface GetAccountsMessage extends Message {
  type: 'GET_ACCOUNTS';
  platform?: Platform;
}

export interface AccountsDataMessage extends Message {
  type: 'ACCOUNTS_DATA';
  data: Account[];
}

export interface ClearDataMessage extends Message {
  type: 'CLEAR_DATA';
  platform?: Platform;
}
