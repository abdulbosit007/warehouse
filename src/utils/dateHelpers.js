// All date logic uses Tashkent local time (UTC+5).
// DB timestamps are stored in UTC, so we convert boundaries accordingly.

const TZ = "+05:00";
const TZ_MS = 5 * 60 * 60 * 1000; // 5 hours in milliseconds

export const nf = new Intl.NumberFormat();

/**
 * Returns "YYYY-MM-DD" for the given date in Tashkent time.
 * Works correctly regardless of the browser's own timezone.
 */
export const ymd = (d) => {
  const x = new Date(d);
  // Shift to Tashkent by adding the offset, then read UTC components
  const tz = new Date(x.getTime() + TZ_MS);
  const yyyy = tz.getUTCFullYear();
  const mm = String(tz.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tz.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Returns the ISO timestamp (UTC) of Tashkent midnight for the given date.
 * e.g. "2026-05-26" in Tashkent → "2026-05-25T19:00:00.000Z"
 */
export const startOfDayUTC = (date) => {
  const dateStr = ymd(date); // Tashkent calendar date
  return new Date(dateStr + "T00:00:00" + TZ).toISOString();
};

/**
 * Returns the ISO timestamp (UTC) of the NEXT Tashkent midnight after the given date.
 * e.g. "2026-05-26" in Tashkent → "2026-05-26T19:00:00.000Z"
 */
export const nextDayUTC = (date) => {
  const dateStr = ymd(date); // Tashkent calendar date
  // Parse as Tashkent midnight, then add exactly 24 h
  const d = new Date(dateStr + "T00:00:00" + TZ);
  d.setUTCHours(d.getUTCHours() + 24);
  return d.toISOString();
};

/**
 * Returns "YYYY-MM-DD" for today + `days` days, in Tashkent time.
 * Used for default loan due dates.
 */
export const todayPlus = (days) => {
  const todayStr = ymd(new Date()); // today in Tashkent
  // Parse as noon Tashkent to avoid any edge cases, then add days
  const d = new Date(todayStr + "T12:00:00" + TZ);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d); // return the resulting Tashkent date
};

/**
 * Returns an ISO timestamp ~1 year ago in UTC (used as a history cutoff).
 */
export const oneYearAgoISO = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 365);
  return d.toISOString();
};
