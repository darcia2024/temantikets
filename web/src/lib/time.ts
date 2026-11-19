export const TZ_WIB = "Asia/Jakarta";
export const TZ_CAIRO = "Africa/Cairo";

function offsetMinutes(utc: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utc.getTime()) / 60000);
}

/** Convert a `datetime-local` value ("2026-11-20T14:30") in `timeZone` to a UTC Date. */
export function localToUtc(value: string | null | undefined, timeZone: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes handle DST edges (Cairo observes summer time).
  let guess = naive - offsetMinutes(new Date(naive), timeZone) * 60000;
  guess = naive - offsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess);
}

/** Format a UTC date back into a `datetime-local` value for `timeZone`. */
export function utcToLocalInput(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "";
  const local = new Date(date.getTime() + offsetMinutes(date, timeZone) * 60000);
  return local.toISOString().slice(0, 16);
}

export function fmtDateTime(date: Date | null | undefined, timeZone: string = TZ_WIB): string {
  if (!date) return "-";
  const label = timeZone === TZ_CAIRO ? "Kairo" : "WIB";
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date) + ` ${label}`
  );
}

export function fmtDate(value: Date | string | null | undefined, timeZone: string = TZ_WIB): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value + "T00:00:00Z") : value;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: typeof value === "string" ? "UTC" : timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** "2 jam 15 menit lagi" / "lewat 40 menit" */
export function fmtCountdown(target: Date | null | undefined, now: Date = new Date()): string {
  if (!target) return "-";
  const diff = target.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const parts = d > 0 ? `${d} hari ${h} jam` : h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
  return diff >= 0 ? `${parts} lagi` : `lewat ${parts}`;
}

/** Add business days (Mon-Fri) to a date. Used for the OK to Board estimate. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d;
}

export function routeTimeZone(route: string): string {
  return route.startsWith("CAI") ? TZ_CAIRO : TZ_WIB;
}

/** Departure time in the origin airport's local time (WIB for CGK, Cairo for CAI). */
export function fmtDepart(b: { departAt: Date | null; route: string }): string {
  return fmtDateTime(b.departAt, routeTimeZone(b.route));
}
