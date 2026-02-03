import type { FilterType } from '../../types';

interface FilterPanelProps {
  filter: FilterType;
  onChange: (filter: FilterType) => void;
}

const filters: { id: FilterType; label: string; description: string }[] = [
  { id: 'all', label: '全員表示', description: 'スキャンした全アカウント' },
  { id: 'both', label: '条件一致', description: '1年以上投稿なし または フォローバックなし' },
  { id: 'inactive', label: '1年以上投稿なし', description: '1年以上投稿がないアカウント' },
  { id: 'not_following_back', label: 'フォローバックなし', description: 'フォローバックしていないアカウント' },
];

export default function FilterPanel({ filter, onChange }: FilterPanelProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        フィルター
      </label>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            title={f.description}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.id
                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
