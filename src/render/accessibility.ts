export type ActionKey =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'dash'
  | 'interact'
  | 'pulse'
  | 'pause';

export type KeyBindings = Record<ActionKey, string>;

export const ACTION_LABELS: Record<ActionKey, string> = {
  moveUp: 'Đi tiến',
  moveDown: 'Đi lùi',
  moveLeft: 'Đi trái',
  moveRight: 'Đi phải',
  jump: 'Nhảy',
  dash: 'Lướt (Dash)',
  interact: 'Tương tác / Nạp đèn',
  pulse: 'Tỏa Sáng (Pulse)',
  pause: 'Tạm dừng',
};

export const DEFAULT_KEYBINDS: KeyBindings = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'Escape',
};

const KEYBINDS_STORAGE = 'ddl_keybinds_v1';

export function loadKeyBindings(): KeyBindings {
  try {
    const raw = window.localStorage.getItem(KEYBINDS_STORAGE);
    if (!raw) return { ...DEFAULT_KEYBINDS };
    const parsed = JSON.parse(raw) as Partial<KeyBindings>;
    return { ...DEFAULT_KEYBINDS, ...parsed };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

export function saveKeyBindings(kb: KeyBindings): void {
  window.localStorage.setItem(KEYBINDS_STORAGE, JSON.stringify(kb));
}

export function findKeyConflict(kb: KeyBindings, action: ActionKey, code: string): ActionKey | null {
  for (const [k, v] of Object.entries(kb) as Array<[ActionKey, string]>) {
    if (k !== action && v === code) return k;
  }
  return null;
}

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  return code;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

const LB_LOCAL_STORAGE = 'ddl_leaderboard_v1';

export function formatLocalIsoTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const tzMin = -date.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const absMin = Math.abs(tzMin);
  const tzH = pad(Math.floor(absMin / 60));
  const tzM = pad(absMin % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${tzH}:${tzM}`;
}

export function validatePlayerName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 3 && trimmed.length <= 12 && /^[\p{L}\p{N}_]+$/u.test(trimmed);
}

function sortTop10(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.achieved_at.localeCompare(b.achieved_at);
    })
    .slice(0, 10);
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      const data = (await res.json()) as { entries: LeaderboardEntry[] };
      if (Array.isArray(data.entries)) {
        window.localStorage.setItem(LB_LOCAL_STORAGE, JSON.stringify(data.entries));
        return sortTop10(data.entries);
      }
    }
  } catch {
    // fallback to localStorage if running under vite dev without run.mjs server
  }
  try {
    const raw = window.localStorage.getItem(LB_LOCAL_STORAGE);
    return raw ? sortTop10(JSON.parse(raw) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

export async function submitLeaderboardEntry(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = (await res.json()) as { entries: LeaderboardEntry[] };
      window.localStorage.setItem(LB_LOCAL_STORAGE, JSON.stringify(data.entries));
      return sortTop10(data.entries);
    }
  } catch {
    // fallback to localStorage
  }
  const existing = await fetchLeaderboard();
  const next = sortTop10([...existing, entry]);
  window.localStorage.setItem(LB_LOCAL_STORAGE, JSON.stringify(next));
  return next;
}
