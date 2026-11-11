/**
 * The option bin — pure decisions shared by services and tests.
 * A row is "binned" when removedAt is set; removal never destroys
 * votes/comments (sibling tables keyed by optionId), so restore is lossless.
 */

/** What re-shortlisting an already-persisted option means. */
export type ReaddOutcome = 'restore' | 'keep';

/**
 * addOption's externalId-conflict path already proved a row exists for
 * (trip, kind, source, externalId). A live row means the shortlist is
 * idempotent — return it untouched. A binned row means undelete: the row
 * comes back with its votes and comments instead of a fresh insert.
 */
export function readdOutcome(
  existing: { removedAt: Date | null } | null | undefined,
): ReaddOutcome {
  return existing?.removedAt ? 'restore' : 'keep';
}
