import 'server-only';
import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3030'),
  SERPAPI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  CONTACT_EMAIL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GOOGLE_FLIGHTS_HL: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default('en-US'),
  ),
  GOOGLE_FLIGHTS_GL: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default('US'),
  ),
  GOOGLE_FLIGHTS_CONCURRENCY: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).default(3),
  ),
  FLIGHT_SCAN_MAX_PAIRS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).default(40),
  ),
  PROVIDER_FIXTURES_DIR: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional(),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment: ${parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')}`,
  );
}

if (
  parsed.data.PROVIDER_FIXTURES_DIR !== undefined &&
  process.env.NODE_ENV === 'production'
) {
  throw new Error(
    'PROVIDER_FIXTURES_DIR must not be set in production: fixture replay is test-only.',
  );
}

export const env = parsed.data;

export function userAgent(): string {
  return `TripPlanner/0.1 (+${env.APP_URL}${env.CONTACT_EMAIL ? `; ${env.CONTACT_EMAIL}` : ''})`;
}
