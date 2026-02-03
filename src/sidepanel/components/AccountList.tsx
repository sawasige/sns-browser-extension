import type { Account } from '../../types';
import AccountCard from './AccountCard';

interface AccountListProps {
  accounts: Account[];
}

export default function AccountList({ accounts }: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-2">📭</div>
        <p className="text-gray-500 text-sm">
          該当するアカウントはありません
        </p>
        <p className="text-gray-400 text-xs mt-1">
          スキャンを実行して結果を表示
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {accounts.map((account) => (
        <AccountCard key={`${account.platform}-${account.id}`} account={account} />
      ))}
    </div>
  );
}
