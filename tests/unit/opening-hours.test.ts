import { describe, expect, it } from 'vitest';
import {
  closedWeekdays, hoursWarning, parseDayHours, parseWeek, weekdayOf, weekSummary,
} from '@/lib/domain/opening-hours';

const MON = '2026-11-09'; // Monday
const SUN = '2026-11-08'; // Sunday
const SAT = '2026-11-07'; // Saturday

describe('parseDayHours', () => {
  const iv = (raw: string) => {
    const d = parseDayHours(raw);
    if (d.kind !== 'hours') throw new Error(`expected hours for ${raw}`);
    return d.intervals;
  };
  it('parses AM/PM ranges with narrow spaces and en dashes', () => {
    expect(iv('10 AM–7 PM')).toEqual([{ open: 600, close: 1140 }]);
    expect(iv('10 AM-7 PM')).toEqual([{ open: 600, close: 1140 }]);
  });
  it('a bare start inherits the end meridiem (12:40 PM, not 12:40 AM)', () => {
    expect(iv('12:40–7:55 PM')).toEqual([{ open: 760, close: 1195 }]);
  });
  it('strips parenthetical holiday notes', () => {
    expect(parseDayHours("Closed (All Souls Day might affect these hours)").kind).toBe('closed');
    expect(iv("10 AM–7 PM (All Saints' Day might affect these hours)"))
      .toEqual([{ open: 600, close: 1140 }]);
  });
  it('parses open 24 hours, multi-range, overnight and 24-hour forms', () => {
    expect(parseDayHours('Open 24 hours').kind).toBe('open24');
    expect(iv('9 AM–12 PM, 1–5 PM'))
      .toEqual([{ open: 540, close: 720 }, { open: 780, close: 1020 }]);
    expect(iv('6 PM–2 AM')).toEqual([{ open: 1080, close: 1560 }]);
    expect(iv('11 AM–12 AM')).toEqual([{ open: 660, close: 1440 }]);
    expect(iv('10:00–19:00')).toEqual([{ open: 600, close: 1140 }]);
  });
  it('unparseable input is unknown, never a throw', () => {
    expect(parseDayHours('').kind).toBe('unknown');
    expect(parseDayHours('Hours vary').kind).toBe('unknown');
    expect(parseDayHours('whenever').kind).toBe('unknown');
  });
});

describe('week helpers', () => {
  const carmo = {
    monday: '10 AM–6 PM', tuesday: '10 AM–6 PM', wednesday: '10 AM–6 PM',
    thursday: '10 AM–6 PM', friday: '10 AM–6 PM', saturday: '10 AM–6 PM',
    sunday: 'Closed',
  };
  const maat = {
    monday: '10 AM–7 PM', tuesday: 'Closed', wednesday: '10 AM–7 PM',
    thursday: '10 AM–7 PM', friday: '10 AM–7 PM',
    saturday: '10 AM–7 PM', sunday: "10 AM–7 PM (All Saints' Day might affect these hours)",
  };
  it('weekdayOf uses UTC', () => {
    expect(weekdayOf(SUN)).toBe('sunday');
    expect(weekdayOf(MON)).toBe('monday');
  });
  it('closedWeekdays is Monday-first', () => {
    expect(closedWeekdays(carmo)).toEqual(['sunday']);
    expect(closedWeekdays({ ...maat, monday: 'Closed' })).toEqual(['monday', 'tuesday']);
    expect(closedWeekdays({})).toEqual([]);
  });
  it('weekSummary groups consecutive identical days', () => {
    expect(weekSummary(carmo)).toBe('Mon–Sat 10 AM–6 PM · Sun Closed');
    expect(weekSummary(maat)).toBe('Mon 10 AM–7 PM · Tue Closed · Wed–Sun 10 AM–7 PM');
    expect(weekSummary({})).toBeNull();
    expect(weekSummary(null)).toBeNull();
  });
});

describe('hoursWarning', () => {
  const sunClosed = { sunday: 'Closed', monday: '10 AM–6 PM' };
  const daily = { sunday: '10 AM–6 PM', friday: '6 PM–2 AM', saturday: '10 AM–6 PM' };
  it('warns on closed days', () => {
    expect(hoursWarning(sunClosed, SUN)).toEqual({
      kind: 'closed', message: 'Closed on Sundays (Google Maps hours)',
    });
  });
  it('warns before opening and past closing, silent inside', () => {
    expect(hoursWarning(daily, SUN, '09:30')).toEqual({
      kind: 'outside', message: 'Open 10 AM–6 PM on Sundays; 09:30 is outside these hours',
    });
    expect(hoursWarning(daily, SUN, '14:00')).toBeNull();
    expect(hoursWarning(daily, SUN, '10:00', '19:00')).toEqual({
      kind: 'outside', message: 'Open 10 AM–6 PM on Sundays; 10:00–19:00 is outside these hours',
    });
  });
  it('a start after midnight is covered by the previous day running late', () => {
    expect(hoursWarning(daily, SAT, '01:00')).toBeNull();
  });
  it('no data, unknown days and no start never warn', () => {
    expect(hoursWarning(null, SUN, '10:00')).toBeNull();
    expect(hoursWarning({}, SUN, '10:00')).toBeNull();
    expect(hoursWarning({ garbage: 1 }, SUN, '10:00')).toBeNull();
    expect(hoursWarning({ sunday: 'Hours vary' }, SUN, '10:00')).toBeNull();
    expect(hoursWarning(sunClosed, SUN)).toEqual({
      kind: 'closed', message: 'Closed on Sundays (Google Maps hours)',
    });
    expect(hoursWarning(daily, SUN)).toBeNull();
  });
  it('parseWeek ignores non-object input and non-string days', () => {
    expect(parseWeek(null)).toEqual({});
    expect(parseWeek('x')).toEqual({});
    expect(parseWeek({ monday: 5, tuesday: 'Closed' }).tuesday?.kind).toBe('closed');
  });
});
