'use server';

import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  clearLoginFailures,
  loginRateLimitOk,
  recordLoginFailure,
} from '@/lib/auth/rateLimit';
import {
  createSession,
  destroySession,
} from '@/lib/auth/session';
import { safeNextPath } from '@/lib/auth/guards';
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from '@/lib/auth/password';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

export type AuthFormState = { error?: string };

const signupSchema = z.object({
  email: z
    .preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string())
    .pipe(z.email('Enter a valid email address').max(320)),
  name: z.string().trim().min(1, 'Name is required').max(120),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
  timezone: z.string().max(100).default(''),
  next: z.string().default(''),
});

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
    timezone: formData.get('timezone'),
    next: formData.get('next'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { name, password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const timezone = parsed.data.timezone;
  const homeTimezone =
    timezone && DateTime.now().setZone(timezone).isValid
      ? timezone
      : 'America/New_York';

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return { error: 'An account with that email already exists' };
  }

  let user: { id: string };
  try {
    [user] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash: await hashPassword(password),
        homeTimezone,
      })
      .returning({ id: users.id });
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === '23505'
    ) {
      return { error: 'An account with that email already exists' };
    }
    throw err;
  }

  await createSession(user.id);
  redirect(safeNextPath(parsed.data.next) ?? '/trips');
}

const loginSchema = z.object({
  email: z.email('Enter a valid email address').max(320),
  password: z.string().min(1, 'Password is required').max(200),
  next: z.string().default(''),
});

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const email = parsed.data.email.trim().toLowerCase();
  const ip = await clientIp();

  if (!loginRateLimitOk(ip, email)) {
    return { error: 'Too many failed attempts. Try again later.' };
  }

  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = rows[0];
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    recordLoginFailure(ip, email);
    return { error: 'Incorrect email or password' };
  }

  clearLoginFailures(ip, email);
  await createSession(user.id);
  redirect(safeNextPath(parsed.data.next) ?? '/trips');
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/');
}
