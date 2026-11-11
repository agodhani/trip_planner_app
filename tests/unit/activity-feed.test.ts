import { describe, expect, it } from 'vitest';
import {
  collapseEvents,
  eventTab,
  PRESENCE_HERE_MS,
  presenceState,
  type FeedEvent,
} from '@/lib/domain/activity-feed';

const ev = (id: number, verb: string, opts: Partial<FeedEvent> = {}): FeedEvent => ({
  id,
  verb,
  summary: `event ${id}`,
  actorId: 'u1',
  actorName: 'Ana',
  optionKind: null,
  ...opts,
});

describe('eventTab', () => {
  it('maps option events to their kind tab', () => {
    expect(eventTab('option.added', 'flight')).toBe('flights');
    expect(eventTab('option.selected', 'lodging')).toBe('stay');
    expect(eventTab('option.removed', 'activity')).toBe('activities');
  });

  it('sends options without a real tab to the shortlist', () => {
    expect(eventTab('option.added', 'transport')).toBe('shortlist');
    expect(eventTab('option.added', 'other')).toBe('shortlist');
    // Option row is gone (e.g. deleted before the event landed): still the
    // place shortlist entries live.
    expect(eventTab('option.added', null)).toBe('shortlist');
  });

  it('maps the verb families', () => {
    expect(eventTab('expense.added')).toBe('budget');
    expect(eventTab('itinerary.item_moved')).toBe('itinerary');
    expect(eventTab('itinerary.anchors_synced')).toBe('itinerary');
    expect(eventTab('transport.legs_computed')).toBe('transport');
    expect(eventTab('flights.scan_finished')).toBe('flights');
    // Price-watch events land on the Shortlist tab where the chips render.
    expect(eventTab('flights.prices_checked')).toBe('shortlist');
    expect(eventTab('flights.price_drop')).toBe('shortlist');
    expect(eventTab('flights.scan_started')).toBe('flights');
    expect(eventTab('member.joined')).toBe('people');
    expect(eventTab('invite.created')).toBe('people');
    expect(eventTab('traveler.renamed')).toBe('people');
    expect(eventTab('log.entry')).toBe('log');
    expect(eventTab('log.item_done')).toBe('log');
    expect(eventTab('trip.status')).toBe('log');
    expect(eventTab('comment.added')).toBe('overview');
    expect(eventTab('trip.created')).toBe('overview');
  });

  it('returns null for unmapped verbs so toasts stay honest', () => {
    expect(eventTab('mystery.happened')).toBeNull();
    expect(eventTab('option')).toBe('shortlist');
    expect(eventTab('')).toBeNull();
  });
});

describe('collapseEvents', () => {
  it('suppresses auto-consequence verbs but keeps manual intent', () => {
    const out = collapseEvents(
      [
        ev(1, 'itinerary.anchors_synced'),
        ev(2, 'transport.legs_synced'),
        ev(3, 'transport.legs_computed', { summary: 'Ana computed 4 route legs' }),
      ],
      'me',
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Ana computed 4 route legs · Getting around');
    expect(out[0].tab).toBe('transport');
  });

  it('drops the viewer’s own events before collapsing', () => {
    const out = collapseEvents(
      [ev(1, 'option.added', { actorId: 'me' }), ev(2, 'option.added', { actorId: 'u2', actorName: 'Bo' })],
      'me',
    );
    expect(out).toHaveLength(1);
    expect(out[0].ids).toEqual([2]);
  });

  it('collapses consecutive same-actor item_moved runs', () => {
    const out = collapseEvents(
      [ev(1, 'itinerary.item_moved'), ev(2, 'itinerary.item_moved'), ev(3, 'itinerary.item_moved')],
      'me',
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Ana rearranged the itinerary · Itinerary');
    expect(out[0].tab).toBe('itinerary');
    expect(out[0].ids).toEqual([1, 2, 3]);
  });

  it('keeps a lone move and splits interleaved actors', () => {
    const out = collapseEvents(
      [
        ev(1, 'itinerary.item_moved', { actorId: 'a', actorName: 'Ana', summary: 'Ana moved X' }),
        ev(2, 'itinerary.item_moved', { actorId: 'b', actorName: 'Bo', summary: 'Bo moved Y' }),
        ev(3, 'itinerary.item_moved', { actorId: 'a', actorName: 'Ana', summary: 'Ana moved Z' }),
      ],
      'me',
    );
    // No consecutive same-actor run of 2+: three separate toasts.
    expect(out.map((o) => o.text)).toEqual([
      'Ana moved X · Itinerary',
      'Bo moved Y · Itinerary',
      'Ana moved Z · Itinerary',
    ]);
  });

  it('batches an actor with more than 3 remaining events', () => {
    const out = collapseEvents(
      [
        ev(1, 'option.added', { summary: 'Ana shortlisted A', optionKind: 'lodging' }),
        ev(2, 'expense.added'),
        ev(3, 'itinerary.item_added'),
        ev(4, 'comment.added'),
        ev(5, 'option.added', { actorId: 'u2', actorName: 'Bo', optionKind: 'flight' }),
      ],
      'me',
    );
    expect(out).toHaveLength(2);
    // 4 items remain for Ana → one batch pointing at her most recent tab.
    expect(out[0].text).toBe('Ana made 4 updates · Overview');
    expect(out[0].tab).toBe('overview');
    expect(out[0].ids).toEqual([1, 2, 3, 4]);
    expect(out[1].text).toBe('event 5 · Flights');
  });

  it('does not batch at exactly 3 events, and a move-run counts as one', () => {
    const out = collapseEvents(
      [
        ev(1, 'itinerary.item_moved'),
        ev(2, 'itinerary.item_moved'),
        ev(3, 'option.added'),
        ev(4, 'expense.added'),
      ],
      'me',
    );
    // Run collapse leaves 3 items (rearranged + 2 singles) — under the limit.
    expect(out).toHaveLength(3);
    expect(out[0].text).toBe('Ana rearranged the itinerary · Itinerary');
  });

  it('emits text-only toasts for unmapped verbs (View honesty)', () => {
    const out = collapseEvents([ev(1, 'weird.thing', { summary: 'Ana did something' })], 'me');
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Ana did something');
    expect(out[0].tab).toBeNull();
  });

  it('handles a null actor without crashing', () => {
    const out = collapseEvents(
      [ev(1, 'option.added', { actorId: null, actorName: null, optionKind: 'flight' })],
      'me',
    );
    expect(out[0].text).toBe('event 1 · Flights');
  });
});

describe('presenceState', () => {
  const now = 1_700_000_000_000;
  it('is null for members who never pulsed', () => {
    expect(presenceState(null, now)).toBeNull();
    expect(presenceState(undefined, now)).toBeNull();
    expect(presenceState('not-a-date', now)).toBeNull();
  });
  it('is here within the window and away past it', () => {
    const at = (msAgo: number) => new Date(now - msAgo);
    expect(presenceState(at(0), now)).toBe('here');
    expect(presenceState(at(PRESENCE_HERE_MS), now)).toBe('here');
    expect(presenceState(at(PRESENCE_HERE_MS + 1), now)).toBe('away');
    expect(presenceState(at(10 * 60_000), now)).toBe('away');
    // Clock skew: a slightly-future heartbeat still reads as here.
    expect(presenceState(at(-5_000), now)).toBe('here');
  });
});
