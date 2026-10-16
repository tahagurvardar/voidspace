import { z } from 'zod';
import {
  FOCUS_SESSION_STATUSES,
  GRAPHICS_QUALITIES,
  MOTION_PREFERENCES,
  THOUGHT_CATEGORIES,
} from '@/types';

export const THOUGHT_MAX_LENGTH = 2000;
export const FOCUS_MIN_MINUTES = 1;
export const FOCUS_MAX_MINUTES = 180;

/** Earliest plausible timestamp (2000-01-01) — rejects garbage like 0 or negative values. */
const MIN_TIMESTAMP = Date.UTC(2000, 0, 1);
/** Allow a little clock skew between devices, but nothing absurd. */
const MAX_FUTURE_SKEW_MS = 1000 * 60 * 60 * 24 * 2;

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'IDs may only contain letters, digits, "-" and "_"');

const timestampSchema = z
  .number()
  .int()
  .min(MIN_TIMESTAMP)
  .refine((v) => v <= Date.now() + MAX_FUTURE_SKEW_MS, 'Timestamp is too far in the future');

/** Thought text as typed by the user: trimmed, non-empty, bounded. */
export const thoughtContentSchema = z
  .string()
  .trim()
  .min(1, 'Write something first.')
  .max(THOUGHT_MAX_LENGTH, `Thoughts can be up to ${THOUGHT_MAX_LENGTH} characters.`);

export const thoughtCategorySchema = z.enum(THOUGHT_CATEGORIES).nullable();

export const thoughtSchema = z
  .object({
    id: idSchema,
    content: thoughtContentSchema,
    category: thoughtCategorySchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .refine((t) => t.updatedAt >= t.createdAt, {
    message: 'updatedAt must not be earlier than createdAt',
    path: ['updatedAt'],
  });

export const focusSessionSchema = z
  .object({
    id: idSchema,
    plannedDurationSeconds: z
      .number()
      .int()
      .min(FOCUS_MIN_MINUTES * 60)
      .max(FOCUS_MAX_MINUTES * 60),
    actualFocusedSeconds: z.number().int().min(0),
    startedAt: timestampSchema,
    endedAt: timestampSchema,
    status: z.enum(FOCUS_SESSION_STATUSES),
  })
  .refine((s) => s.endedAt >= s.startedAt, { message: 'endedAt precedes startedAt', path: ['endedAt'] })
  .refine((s) => s.actualFocusedSeconds <= s.plannedDurationSeconds, {
    message: 'Focused time exceeds planned duration',
    path: ['actualFocusedSeconds'],
  })
  .refine((s) => s.status !== 'completed' || s.actualFocusedSeconds === s.plannedDurationSeconds, {
    message: 'A completed session must cover its planned duration',
    path: ['status'],
  });

export const preferencesSchema = z.object({
  soundEnabled: z.boolean(),
  volume: z.number().min(0).max(1),
  motionPreference: z.enum(MOTION_PREFERENCES),
  graphicsQuality: z.enum(GRAPHICS_QUALITIES),
  defaultFocusDuration: z.number().int().min(FOCUS_MIN_MINUTES).max(FOCUS_MAX_MINUTES),
  focusChime: z.boolean(),
});

/** Partial preferences are accepted so older backups with fewer fields still import. */
export const partialPreferencesSchema = preferencesSchema.partial();

export const focusMinutesSchema = z.coerce
  .number()
  .int('Use whole minutes.')
  .min(FOCUS_MIN_MINUTES, `Minimum is ${FOCUS_MIN_MINUTES} minute.`)
  .max(FOCUS_MAX_MINUTES, `Maximum is ${FOCUS_MAX_MINUTES} minutes.`);

/** Formats the first Zod issue as a short human message. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid data.';
  const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}
