import type { Account } from '../../types';
import { formatRelativeDate } from '../../utils/date';

interface AccountCardProps {
  account: Account;
}

export default function AccountCard({ account }: AccountCardProps) {
  const badges: { label: string; color: string }[] = [];

  if (account.isInactive) {
    badges.push({ label: '1年以上投稿なし', color: 'bg-orange-100 text-orange-700' });
  }

  if (account.isNotFollowingBack) {
    badges.push({ label: 'フォローバックなし', color: 'bg-red-100 text-red-700' });
  }

  return (
    <a
      href={account.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200
                 hover:border-gray-300 hover:shadow-sm transition-all group"
    >
      <img
        src={account.avatarUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect fill="%23e5e7eb" width="40" height="40" rx="20"/%3E%3C/svg%3E'}
        alt={account.displayName}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        onError={(e) => {
          e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect fill="%23e5e7eb" width="40" height="40" rx="20"/%3E%3C/svg%3E';
        }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate group-hover:text-indigo-600">
            {account.displayName}
          </span>
          <svg
            className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </div>

        <p className="text-sm text-gray-500">@{account.username}</p>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {badges.map((badge, i) => (
            <span
              key={i}
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}
            >
              {badge.label}
            </span>
          ))}
        </div>

        <p className="mt-1 text-xs text-gray-400">
          最終投稿: {formatRelativeDate(account.lastPostDate)}
        </p>
      </div>
    </a>
  );
}
