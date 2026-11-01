import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formFields } from '@/lib/form-data';

describe('formFields', () => {
  it('drops blank and whitespace-only fields, keeps the rest', () => {
    const fd = new FormData();
    fd.set('title', 'Taxi');
    fd.set('durationMin', '');
    fd.set('lat', '   ');
    fd.set('cost', '0');
    expect(formFields(fd)).toEqual({ title: 'Taxi', cost: '0' });
  });

  it('lets zod treat blank optional numbers as absent instead of 0', () => {
    const schema = z.object({
      durationMin: z.coerce.number().positive().optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
    });
    const fd = new FormData();
    fd.set('durationMin', '');
    fd.set('lat', '');
    // Raw entries: '' coerces to 0 → positive() fails and lat silently becomes 0.
    expect(schema.safeParse(Object.fromEntries(fd)).success).toBe(false);
    expect(schema.parse(formFields(fd))).toEqual({});
  });
});
