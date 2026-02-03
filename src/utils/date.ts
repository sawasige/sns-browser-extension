const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function isInactiveForOneYear(lastPostDate: Date | string | null): boolean {
  if (!lastPostDate) {
    // 日付が取得できない場合は非アクティブとみなさない
    return false;
  }
  // Convert string to Date if needed
  const dateObj = typeof lastPostDate === 'string' ? new Date(lastPostDate) : lastPostDate;
  if (isNaN(dateObj.getTime())) {
    return false;
  }
  const now = new Date();
  return now.getTime() - dateObj.getTime() > ONE_YEAR_MS;
}

export function formatRelativeDate(date: Date | string | null): string {
  if (!date) {
    return '投稿なし';
  }

  // Convert string to Date if needed
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) {
    return '投稿なし';
  }

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今日';
  } else if (diffDays === 1) {
    return '昨日';
  } else if (diffDays < 7) {
    return `${diffDays}日前`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}週間前`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}ヶ月前`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years}年以上前`;
  }
}

export function parseRelativeDate(text: string): Date | null {
  const now = new Date();

  // Common patterns for relative dates
  const patterns: [RegExp, (match: RegExpMatchArray) => Date | null][] = [
    // English patterns
    [/(\d+)\s*seconds?\s*ago/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 1000)],
    [/(\d+)\s*minutes?\s*ago/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 60 * 1000)],
    [/(\d+)\s*hours?\s*ago/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 60 * 60 * 1000)],
    [/(\d+)\s*days?\s*ago/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 24 * 60 * 60 * 1000)],
    [/(\d+)\s*weeks?\s*ago/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 7 * 24 * 60 * 60 * 1000)],
    [/(\d+)\s*months?\s*ago/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 30 * 24 * 60 * 60 * 1000)],
    [/(\d+)\s*years?\s*ago/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 365 * 24 * 60 * 60 * 1000)],
    // Japanese patterns
    [/(\d+)秒前/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 1000)],
    [/(\d+)分前/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 60 * 1000)],
    [/(\d+)時間前/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 60 * 60 * 1000)],
    [/(\d+)日前/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 24 * 60 * 60 * 1000)],
    [/(\d+)週間前/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 7 * 24 * 60 * 60 * 1000)],
    [/(\d+)ヶ月前/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 30 * 24 * 60 * 60 * 1000)],
    [/(\d+)年前/i, (m) => new Date(now.getTime() - parseInt(m[1]) * 365 * 24 * 60 * 60 * 1000)],
  ];

  for (const [pattern, parser] of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parser(match);
    }
  }

  // Try to parse as absolute date
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}
