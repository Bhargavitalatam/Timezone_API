import { DateTime, IANAZone } from 'luxon';

export class InvalidTimezoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTimezoneError';
  }
}

export class InvalidLocalTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLocalTimeError';
  }
}

export class TimezoneUtil {
  private static ISO_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

  /**
   * Validates whether a timezone identifier is a valid IANA timezone name.
   */
  static isValidIanaZone(timezone: string): boolean {
    if (!timezone || typeof timezone !== 'string') {
      return false;
    }
    // Check with Luxon IANAZone
    if (!IANAZone.isValidZone(timezone)) {
      return false;
    }
    // Also verify with native Intl to ensure it's a valid timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parses local_start_time with timezone into a Luxon DateTime in UTC.
   * Throws InvalidLocalTimeError if format is invalid or if the time falls in a DST Spring Forward gap.
   */
  static parseLocalTimeToUtc(localStartTime: string, timezone: string): { startUtc: Date; dtLocal: DateTime } {
    if (!timezone || !this.isValidIanaZone(timezone)) {
      throw new InvalidTimezoneError(`Invalid IANA timezone: '${timezone}'`);
    }

    if (!localStartTime || typeof localStartTime !== 'string' || !this.ISO_LOCAL_REGEX.test(localStartTime)) {
      throw new InvalidLocalTimeError(
        `Invalid local_start_time format: '${localStartTime}'. Must match YYYY-MM-DDTHH:mm:ss without offset or Z.`
      );
    }

    const [datePart, timePart] = localStartTime.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);

    // Create DateTime in specified timezone
    const dt = DateTime.fromISO(localStartTime, { zone: timezone });

    if (!dt.isValid) {
      throw new InvalidLocalTimeError(`Invalid date or time: ${dt.invalidExplanation || 'malformed timestamp'}`);
    }

    // DST Spring Forward Gap Check:
    // When clocks jump forward (e.g. 01:59:59 -> 03:00:00), 02:30:00 does not exist.
    // Luxon adjusts the wall clock time forward. If the parsed year/month/day/hour/minute/second
    // does not match what was requested, it falls in an invalid DST gap.
    if (
      dt.year !== year ||
      dt.month !== month ||
      dt.day !== day ||
      dt.hour !== hour ||
      dt.minute !== minute ||
      dt.second !== second
    ) {
      throw new InvalidLocalTimeError(
        `Invalid local time due to Daylight Saving Time (DST) spring forward gap: '${localStartTime}' does not exist in timezone '${timezone}'.`
      );
    }

    // Convert to native JS Date in UTC
    const startUtc = dt.toUTC().toJSDate();

    return { startUtc, dtLocal: dt };
  }

  /**
   * Formats a UTC Date to an ISO-8601 string with explicit offset in the target timezone.
   * Example: 2024-10-15T10:00:00-05:00 (ends in offset, NOT Z).
   */
  static formatWithOffset(date: Date, timezone: string): string {
    const dt = DateTime.fromJSDate(date).setZone(timezone);
    if (!dt.isValid) {
      throw new InvalidTimezoneError(`Unable to format date in timezone '${timezone}'`);
    }
    const formatted = dt.toISO({ suppressMilliseconds: true });
    if (!formatted) {
      throw new Error(`Failed to format date to ISO-8601`);
    }
    return formatted;
  }
}
