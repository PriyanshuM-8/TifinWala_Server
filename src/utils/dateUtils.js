/**
 * Date & Timezone Utilities for GharKaSwad
 * Standardized to "Asia/Kolkata" (UTC+05:30)
 * Deterministic calendar dates using canonical string keys (YYYY-MM-DD)
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Returns canonical date key (YYYY-MM-DD) in Asia/Kolkata for a given Date or current time
 * @param {Date} [date=new Date()]
 * @returns {string} e.g. "2026-12-01"
 */
export const getKolkataDateKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
};

/**
 * Parses a YYYY-MM-DD string into a UTC Date object representing 00:00:00.000 IST (UTC+05:30)
 * 00:00:00 IST corresponds to 18:30:00.000Z of the preceding UTC calendar day
 * @param {string} dateKey - Format "YYYY-MM-DD"
 * @returns {Date}
 */
export const parseDateKeyToKolkataDate = (dateKey) => {
  if (!dateKey || typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid dateKey format '${dateKey}'. Expected 'YYYY-MM-DD'.`);
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  // Date.UTC(year, month - 1, day, 0, 0, 0) is UTC midnight
  // Subtract 5 hours 30 minutes to get midnight in Asia/Kolkata (UTC+5:30)
  const utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000;
  return new Date(utcMillis);
};

/**
 * Calculates inclusive end date key (YYYY-MM-DD) by adding (durationDays - 1) calendar days
 * Example: startDateKey="2026-12-01", durationDays=5 => "2026-12-05"
 * @param {string} startDateKey
 * @param {number} durationDays
 * @returns {string}
 */
export const calculateInclusiveEndDateKey = (startDateKey, durationDays) => {
  if (!startDateKey || !/^\d{4}-\d{2}-\d{2}$/.test(startDateKey)) {
    throw new Error(`Invalid startDateKey '${startDateKey}'. Expected 'YYYY-MM-DD'.`);
  }
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new Error(`Invalid durationDays '${durationDays}'. Expected positive integer.`);
  }

  const [year, month, day] = startDateKey.split("-").map(Number);
  // Calendar arithmetic in UTC to avoid daylight saving or local timezone shifts
  const targetDate = new Date(Date.UTC(year, month - 1, day + (durationDays - 1)));
  const y = targetDate.getUTCFullYear();
  const m = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(targetDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Generates an array of all consecutive canonical date keys (YYYY-MM-DD) for the given duration
 * @param {string} startDateKey
 * @param {number} durationDays
 * @returns {string[]}
 */
export const generateDateKeysRange = (startDateKey, durationDays) => {
  const dateKeys = [];
  const [year, month, day] = startDateKey.split("-").map(Number);

  for (let i = 0; i < durationDays; i++) {
    const targetDate = new Date(Date.UTC(year, month - 1, day + i));
    const y = targetDate.getUTCFullYear();
    const m = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(targetDate.getUTCDate()).padStart(2, "0");
    dateKeys.push(`${y}-${m}-${d}`);
  }

  return dateKeys;
};

/**
 * Returns exact Date when skip cutoff closes: 8:00 PM (20:00) IST on the day prior to scheduledDateKey
 * 20:00 IST = 14:30:00.000 UTC
 * @param {string} scheduledDateKey
 * @returns {Date}
 */
export const getSkipCutoffTimestamp = (scheduledDateKey) => {
  const [year, month, day] = scheduledDateKey.split("-").map(Number);
  // Calendar day prior: day - 1 at 14:30:00.000 UTC (20:00:00.000 IST)
  const utcMillis = Date.UTC(year, month - 1, day - 1, 14, 30, 0, 0);
  return new Date(utcMillis);
};

/**
 * Checks whether the skip cutoff has elapsed for a given scheduledDateKey
 * Evaluates strictly using `>=` against the cutoff timestamp
 * @param {string} scheduledDateKey
 * @param {Date} [currentTime=new Date()]
 * @returns {boolean}
 */
export const isSkipCutoffElapsed = (scheduledDateKey, currentTime = new Date()) => {
  const cutoff = getSkipCutoffTimestamp(scheduledDateKey);
  const nowMs = currentTime instanceof Date ? currentTime.getTime() : new Date(currentTime).getTime();
  return nowMs >= cutoff.getTime();
};

/**
 * The chef acceptance and stock reservation window opens at 8:00 PM IST on the day prior
 * (identical to when skip cutoff closes, preventing concurrent conflict)
 * @param {string} scheduledDateKey
 * @returns {Date}
 */
export const getReservationWindowOpensAt = (scheduledDateKey) => {
  return getSkipCutoffTimestamp(scheduledDateKey);
};

/**
 * Checks if the stock reservation window has opened for a given scheduledDateKey
 * @param {string} scheduledDateKey
 * @param {Date} [currentTime=new Date()]
 * @returns {boolean}
 */
export const isReservationWindowOpen = (scheduledDateKey, currentTime = new Date()) => {
  const opensAt = getReservationWindowOpensAt(scheduledDateKey);
  const nowMs = currentTime instanceof Date ? currentTime.getTime() : new Date(currentTime).getTime();
  return nowMs >= opensAt.getTime();
};
