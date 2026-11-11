'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTripRole } from '@/lib/auth/guards';
import { ProviderError } from '@/lib/providers/types';
import { refreshPrices } from '@/lib/services/price-watch';
import type { ActionState } from './people';

/**
 * Price Watch: re-price every shortlisted google_flights option. Partial
 * success is real — checks for the pairs that worked are written — but the
 * caller still sees an honest failure note for the pairs that didn't.
 */
export async function refreshPricesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = z.string().uuid().parse(formData.get('tripId'));
  const { user } = await requireTripRole(tripId, 'editor');
  try {
    const r = await refreshPrices(user, tripId);
    revalidatePath(`/trips/${tripId}`, 'layout');
    if (r.failures.length > 0) {
      const f = r.failures[0];
      const more =
        r.failures.length > 1 ? ` (+${r.failures.length - 1} more)` : '';
      return {
        error: `Checked ${r.checked} of ${r.total} flights — Google Flights failed for ${f.label}${more} (${f.kind}). Try again later.`,
      };
    }
    return {};
  } catch (err) {
    if (err instanceof ProviderError) {
      return { error: `Price check failed — ${err.message}` };
    }
    throw err;
  }
}
