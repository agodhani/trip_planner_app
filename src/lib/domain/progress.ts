/** Rule-based planning progress: drives the Overview checklist and tab marks. */

import { money, plural } from '@/lib/ui-format';

export type StepKey = 'flights' | 'stay' | 'activities' | 'itinerary' | 'transport' | 'budget';
export type StepState = 'done' | 'started' | 'todo';
export type Step = { key: StepKey; state: StepState; summary: string };
export type TripProgress = { steps: Step[]; next: StepKey | null; shortlistCount: number };

export type ProgressInput = {
  options: { kind: string; status: string; title: string }[];
  scanned: boolean;
  scheduledItems: number;
  daysCovered: number;
  days: number;
  chosenLegs: number;
  expenses: number;
  spent: number;
  currency: string;
};

function pickStep(
  key: 'flights' | 'stay', options: ProgressInput['options'], kind: string, idle: string, extra?: string,
): Step {
  const mine = options.filter((o) => o.kind === kind && o.status !== 'rejected');
  const chosen = mine.find((o) => o.status === 'booked') ?? mine.find((o) => o.status === 'selected');
  if (chosen) {
    return { key, state: 'done', summary: `${chosen.status === 'booked' ? 'Booked' : 'Selected'}: ${chosen.title}` };
  }
  if (mine.length) return { key, state: 'started', summary: `${plural(mine.length, 'option')} shortlisted — select one` };
  if (extra) return { key, state: 'started', summary: extra };
  return { key, state: 'todo', summary: idle };
}

export function summarizeProgress(p: ProgressInput): TripProgress {
  const acts = p.options.filter((o) => o.kind === 'activity' && o.status !== 'rejected').length;
  const steps: Step[] = [
    pickStep('flights', p.options, 'flight', 'Search fares for your dates',
      p.scanned ? 'Prices are in — pick a flight' : undefined),
    pickStep('stay', p.options, 'lodging', 'Find a hotel, hostel, or rental'),
    acts
      ? { key: 'activities', state: 'started', summary: `${plural(acts, 'idea')} shortlisted` }
      : { key: 'activities', state: 'todo', summary: 'Browse things to do and shortlist ideas' },
    p.scheduledItems === 0
      ? { key: 'itinerary', state: 'todo', summary: 'Arrange your days' }
      : {
        key: 'itinerary',
        state: p.days > 0 && p.daysCovered >= p.days ? 'done' : 'started',
        summary: `${plural(p.scheduledItems, 'item')} planned${p.days ? ` · ${p.daysCovered} of ${plural(p.days, 'day')} filled` : ''}`,
      },
    p.chosenLegs
      ? { key: 'transport', state: 'done', summary: `${plural(p.chosenLegs, 'route')} planned` }
      : { key: 'transport', state: 'todo', summary: 'Optional — plan how you get between stops' },
    p.expenses
      ? { key: 'budget', state: 'started', summary: `${plural(p.expenses, 'expense')} · ${money(p.spent, p.currency)} spent` }
      : { key: 'budget', state: 'todo', summary: 'Log spending as you go' },
  ];
  const by = (k: StepKey) => steps.find((s) => s.key === k)!;
  const next: StepKey | null =
    by('flights').state !== 'done' ? 'flights'
    : by('stay').state !== 'done' ? 'stay'
    : by('activities').state === 'todo' ? 'activities'
    : by('itinerary').state === 'todo' ? 'itinerary'
    : null;
  return {
    steps, next,
    shortlistCount: p.options.filter((o) => o.status !== 'rejected').length,
  };
}
