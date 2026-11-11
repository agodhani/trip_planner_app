import { describe, expect, it } from 'vitest';
import { tripWindowForSelection } from '@/lib/domain/trip-window';

describe('tripWindowForSelection', () => {
  it('round trip anchors both ends of the window', () => {
    expect(
      tripWindowForSelection(
        { departDay: '2026-12-04', returnDay: '2026-12-11' },
        { start: null, end: null },
      ),
    ).toEqual({ startDate: '2026-12-04', endDate: '2026-12-11' });
  });

  it('regression: a one-way flight must not collapse a longer window to the depart day', () => {
    // 7-day trip; user selects an outbound-only option. Previously the
    // fallback (return ?? depart) shrank endDate to the depart date and the
    // board dropped days 2..N.
    expect(
      tripWindowForSelection(
        { departDay: '2026-12-04', returnDay: null },
        { start: '2026-12-04', end: '2026-12-11' },
      ),
    ).toEqual({ startDate: '2026-12-04', endDate: '2026-12-11' });
  });

  it('one-way selection may still move the start while keeping the established end', () => {
    expect(
      tripWindowForSelection(
        { departDay: '2026-12-06', returnDay: null },
        { start: '2026-12-04', end: '2026-12-11' },
      ),
    ).toEqual({ startDate: '2026-12-06', endDate: '2026-12-11' });
  });

  it('keeps a strategy-derived end when explicit dates were never set', () => {
    expect(
      tripWindowForSelection(
        { departDay: '2026-12-05', returnDay: null },
        { start: null, end: '2026-12-08' },
      ),
    ).toEqual({ startDate: '2026-12-05', endDate: '2026-12-08' });
  });

  it('extends (never leaves end before start) when the depart lands past the current end', () => {
    expect(
      tripWindowForSelection(
        { departDay: '2026-12-20', returnDay: null },
        { start: '2026-12-04', end: '2026-12-11' },
      ),
    ).toEqual({ startDate: '2026-12-20', endDate: '2026-12-20' });
  });

  it('one-way with no established window still ends on the depart day', () => {
    expect(
      tripWindowForSelection(
        { departDay: '2026-12-04', returnDay: null },
        { start: null, end: null },
      ),
    ).toEqual({ startDate: '2026-12-04', endDate: '2026-12-04' });
  });

  it('a return leg arriving before the depart day is clamped to the start', () => {
    expect(
      tripWindowForSelection(
        { departDay: '2026-12-11', returnDay: '2026-12-04' },
        { start: null, end: null },
      ),
    ).toEqual({ startDate: '2026-12-11', endDate: '2026-12-11' });
  });

  it('option without flight data leaves the window alone', () => {
    expect(
      tripWindowForSelection(
        { departDay: null, returnDay: null },
        { start: '2026-12-04', end: '2026-12-11' },
      ),
    ).toEqual({ startDate: '2026-12-04', endDate: '2026-12-11' });
  });
});
