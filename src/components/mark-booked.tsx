'use client';

import { optionStatusAction } from '@/lib/actions/options';
import { SubmitButton } from '@/components/submit-button';
import { money } from '@/lib/ui-format';

const btn = 'rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
const inp = 'rounded-lg border border-neutral-300 px-2 py-1 text-sm';
const lbl = 'flex flex-col gap-1 text-xs font-medium text-neutral-600';

type Section = 'flights' | 'stay' | 'activities' | 'transport' | 'itinerary' | 'budget' | 'log' | 'shortlist';

/**
 * "Mark booked" popover — confirmation # plus the booked→spent bridge: what
 * was actually paid and whether to log it as a trip expense right away.
 * Shared by the shortlist cards and the compare sheet's Decide row so both
 * paths log payments identically. Pure <details> — no JS state, accessible.
 */
export function MarkBookedControl({
  tripId, section, optionId, price, currency, align = 'right',
}: {
  tripId: string;
  section: Section;
  optionId: string;
  price: number | null;
  currency: string | null;
  /** Which side the popover hugs — 'left' inside the compare sheet cells. */
  align?: 'left' | 'right';
}) {
  return (
    <details className="relative">
      <summary
        className={`${btn} inline-flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden`}
      >
        Mark booked
      </summary>
      <form
        action={optionStatusAction}
        className={`absolute top-full z-30 mt-1 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="section" value={section} />
        <input type="hidden" name="optionId" value={optionId} />
        <input type="hidden" name="status" value="booked" />
        <div className="flex flex-col gap-2">
          <label className={lbl}>
            Confirmation # (optional)
            <input name="bookingRef" className={inp} />
          </label>
          <div className="flex gap-2">
            <label className={`${lbl} flex-1`}>
              Paid amount
              <input
                name="paidAmount" type="number" step="0.01" min="0"
                placeholder={price != null ? price.toFixed(2) : '0.00'}
                className={inp}
              />
            </label>
            <label className={`${lbl} w-20`}>
              Currency
              <input
                name="paidCurrency" maxLength={3}
                placeholder={currency ?? 'USD'}
                className={`${inp} uppercase`}
              />
            </label>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-neutral-700">
            <input
              type="checkbox" name="logExpense"
              // Default on when there is a price to log — untick for
              // booked-but-pay-later (the full price stays committed).
              defaultChecked={price != null}
              className="accent-teal-600"
            />
            Log as expense
          </label>
          <p className="text-xs text-neutral-500">
            {price != null
              ? `Blank amount logs the listed ${money(price, currency ?? 'USD', 2)} — type what you actually paid if it differs.`
              : 'Enter what you paid to log it as an expense, or untick the box to book now and pay later.'}
          </p>
          <SubmitButton className={btn}>Mark booked</SubmitButton>
        </div>
      </form>
    </details>
  );
}
