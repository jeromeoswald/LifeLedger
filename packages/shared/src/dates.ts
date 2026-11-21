/** Local calendar dates are 'YYYY-MM-DD' strings in the user's time zone; times are 'HH:mm'. */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function zonedParts(instant: Date, tz: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(instant)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function parseDate(date: string): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) throw new Error(`Invalid date: ${date}`);
  return { y, m, d };
}

export const isValidDate = (date: string) => {
  try {
    parseDate(date);
    return true;
  } catch {
    return false;
  }
};

const toUtcMs = (date: string) => {
  const { y, m, d } = parseDate(date);
  return Date.UTC(y, m - 1, d);
};
const fromUtcMs = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Calendar date of an instant in a time zone. */
export function localDate(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Wall-clock time of an instant in a time zone. */
export function localTime(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** The instant when the wall clock in `tz` shows `date time` (DST-safe). */
export function zonedToInstant(date: string, time: string, tz: string): Date {
  const { y, m, d } = parseDate(date);
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  };
  let t = wall - offsetAt(wall);
  const second = offsetAt(t);
  if (wall - second !== t) t = wall - second;
  return new Date(t);
}

export const addDays = (date: string, n: number) => fromUtcMs(toUtcMs(date) + n * DAY_MS);

export const daysBetween = (from: string, to: string) => Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);

/** 0 = Sunday … 6 = Saturday */
export const weekday = (date: string) => new Date(toUtcMs(date)).getUTCDay();

/** Monday of the week containing `date` (UAE work week starts Monday). */
export const startOfWeek = (date: string) => addDays(date, -((weekday(date) + 6) % 7));

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Same day-of-month `n` months later, clamped to the month's length. */
export function addMonths(date: string, n: number, day?: number): string {
  const { y, m, d } = parseDate(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(day ?? d, daysInMonth(ny, nm)))}`;
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
