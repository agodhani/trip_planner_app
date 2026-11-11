'use server';

import { z } from 'zod';
import { requireTripRole } from '@/lib/auth/guards';
import { tripPulse, type PulseResult } from '@/lib/services/pulse';

const pulseSchema = z.object({
  tripId: z.string().uuid(),
  sinceEventId: z.number().int().min(0),
  currentTab: z.string().max(40).optional(),
});

/**
 * The poll endpoint — a Server Action per the AGENTS rule that route
 * handlers stay GET-JSON. Any member (viewer+) heartbeats through it; the
 * role check inside requireTripRole is the only authorization needed.
 */
export async function tripPulseAction(input: unknown): Promise<PulseResult> {
  const { tripId, sinceEventId } = pulseSchema.parse(input);
  const { user } = await requireTripRole(tripId, 'viewer');
  return tripPulse(user, tripId, sinceEventId);
}
