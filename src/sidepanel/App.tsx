import { useState, useEffect, useCallback } from 'react';
import type { Account, Platform, FilterType, ScanProgress, Message } from '../types';
import PlatformTabs from './components/PlatformTabs';
import FilterPanel from './components/FilterPanel';
import AccountList from './components/AccountList';

type ScanMode = 'full' | 'fast';

export default function App() {
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [filter, setFilter] = useState<FilterType>('both');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [limit, setLimit] = useState(100);
  const [foundCount, setFoundCount] = useState(0);
  const [scanMode, setScanMode] = useState<ScanMode>('fast');

  const filteredAccounts = accounts.filter((account) => {
    if (account.platform !== platform) return false;

    switch (filter) {
      case 'inactive':
        return account.isInactive;
      case 'not_following_back':
        return account.isNotFollowingBack;
      case 'both':
        return account.isInactive || account.isNotFollowingBack;
      default:
        return true;
    }
  });

  const loadAccounts = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' });
      if (response?.accounts) {
        setAccounts(response.accounts);
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const handleMessage = (message: Message) => {
      switch (message.type) {
        case 'SCAN_PROGRESS':
          setProgress(message.data as ScanProgress);
          setError(null);
          break;
        case 'ACCOUNTS_DATA':
          loadAccounts();
          setFoundCount(0);
          break;
        case 'ACCOUNT_FOUND':
          setFoundCount((prev) => prev + 1);
          break;
        case 'SCAN_ERROR':
          setError((message.data as { error: string }).error);
          setProgress(null);
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [loadAccounts]);

  const handleStartScan = async () => {
    setError(null);
    setFoundCount(0);
    setProgress({ platform, status: 'scanning', current: 0, total: 0, message: '開始中...' });

    try {
      await chrome.runtime.sendMessage({
        type: 'START_SCAN',
        platform,
        data: { startIndex, limit, scanMode },
      });
    } catch (err) {
      setError('スキャンを開始できませんでした');
      setProgress(null);
    }
  };

  const handleStopScan = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_SCAN', platform });
      setProgress(null);
    } catch (err) {
      console.error('Failed to stop scan:', err);
    }
  };

  const handleClearData = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_DATA', platform });
      setAccounts((prev) => prev.filter((a) => a.platform !== platform));
    } catch (err) {
      console.error('Failed to clear data:', err);
    }
  };

  const isScanning = progress?.status === 'scanning';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">SNS Follower Manager</h1>
        <p className="text-xs text-gray-500 mt-0.5">フォロワーを整理しましょう</p>
      </header>

      <div className="p-4 space-y-4">
        <PlatformTabs platform={platform} onChange={setPlatform} disabled={isScanning} />

        <FilterPanel filter={filter} onChange={setFilter} />

        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            スキャン設定
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-gray-600">スキャンモード</label>
            <div className="flex gap-2">
              <button
                onClick={() => setScanMode('fast')}
                disabled={isScanning}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors
                           ${scanMode === 'fast'
                             ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                             : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                           disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                高速モード
                <span className="block text-[10px] font-normal mt-0.5">フォローバックなしのみ</span>
              </button>
              <button
                onClick={() => setScanMode('full')}
                disabled={isScanning}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors
                           ${scanMode === 'full'
                             ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                             : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                           disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                通常モード
                <span className="block text-[10px] font-normal mt-0.5">投稿日もチェック</span>
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">開始位置</label>
              <input
                type="number"
                min={0}
                value={startIndex}
                onChange={(e) => setStartIndex(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={isScanning}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md
                           disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">処理件数</label>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isScanning}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md
                           disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {!isScanning ? (
            <button
              onClick={handleStartScan}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium text-sm
                         hover:bg-indigo-700 transition-colors"
            >
              スキャン開始
            </button>
          ) : (
            <button
              onClick={handleStopScan}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium text-sm
                         hover:bg-red-700 transition-colors"
            >
              中断
            </button>
          )}
          <button
            onClick={handleClearData}
            disabled={isScanning}
            className="px-4 py-2 rounded-lg font-medium text-sm border border-gray-300
                       text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            クリア
          </button>
        </div>

        {progress && progress.status === 'scanning' && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-indigo-900">スキャン中</span>
              </div>
              <span className="text-sm font-medium text-indigo-600">
                検出: {foundCount}件
              </span>
            </div>
            <p className="text-xs text-indigo-700">{progress.message}</p>
            {progress.total > 0 && (
              <div className="mt-2">
                <div className="bg-indigo-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-indigo-600 mt-1">
                  {progress.current} / {progress.total}
                </p>
              </div>
            )}
          </div>
        )}

        {progress && progress.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">{progress.message}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="text-sm text-gray-600">
          {filteredAccounts.length}件のアカウントが見つかりました
        </div>

        <AccountList accounts={filteredAccounts} />
      </div>
    </div>
  );
}
