import type { Platform } from '../../types';

interface PlatformTabsProps {
  platform: Platform;
  onChange: (platform: Platform) => void;
  disabled?: boolean;
}

const platforms: { id: Platform; label: string; icon: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: '📷' },
  { id: 'twitter', label: 'X', icon: '𝕏' },
  { id: 'threads', label: 'Threads', icon: '@' },
];

export default function PlatformTabs({ platform, onChange, disabled }: PlatformTabsProps) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-1">
      {platforms.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          disabled={disabled}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium
                      transition-all ${
                        platform === p.id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span>{p.icon}</span>
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}
