/**
 * Trip window implied by selecting an option. Pure logic — unit-tested, no I/O.
 *
 * A selected flight anchors the trip dates: the outbound leg sets the start,
 * the return leg sets the end. A one-way selection (no return leg) must never
 * SHRINK an established window — that would drop days (and their items) off
 * the board — so the existing end is kept whenever it still covers the new
 * start, and the window only ever extends to include the depart day.
 */

export type SelectionWindowInput = {
  /** 'YYYY-MM-DD' the outbound leg departs on; null when the option has none. */
  departDay: string | null;
  /** 'YYYY-MM-DD' the return leg arrives back on; null = one-way option. */
  returnDay: string | null;
};

export function tripWindowForSelection(
  sel: SelectionWindowInput,
  current: { start: string | null; end: string | null },
): { startDate: string | null; endDate: string | null } {
  const start = sel.departDay ?? current.start;
  if (!start) return { startDate: current.start, endDate: current.end };
  if (sel.returnDay) {
    // Round trip: the flight anchors both ends. Guard against malformed data
    // (arrival before departure) so the window never ends before it starts.
    return { startDate: start, endDate: sel.returnDay < start ? start : sel.returnDay };
  }
  // One-way: keep the established end when it still covers the new start —
  // the window may only extend to include the depart day, never shrink to it.
  const end = current.end && current.end > start ? current.end : start;
  return { startDate: start, endDate: end };
}
