import { z } from 'zod';

export const directionSchema = z.enum(['feelGood', 'leanFit', 'buildShape']);
export const rangeSchema = z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() });
export type Range = z.infer<typeof rangeSchema>;
export const nutrientKeys = ['energy', 'protein', 'fiber', 'water'] as const;
export type Nutrient = typeof nutrientKeys[number];
export type Nutrition = Record<Nutrient, Range>;
export const profileSchema = z.object({
  direction: directionSchema, focus: z.string().max(100).default('吃得更均衡'),
  age: z.number().int().min(13).max(100), heightCm: z.number().min(100).max(230),
  weightKg: z.number().min(25).max(250), sex: z.enum(['female', 'male', 'unspecified']),
  activity: z.enum(['low', 'moderate', 'high']),
  timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }, '无效时区'),
  allergies: z.array(z.string().min(1).max(50)).max(30).default([]),
  excludedFoods: z.array(z.string().min(1).max(80)).max(50).default([]),
  risks: z.array(z.enum(['pregnancy', 'clinical', 'eatingDisorder', 'extremeGoal'])).default([]),
  constraintsConfirmed: z.boolean(), modelImprovementConsent: z.boolean().default(false)
}).strict();
export type Profile = z.infer<typeof profileSchema>;
export const instant = z.string().datetime({ offset: true });
export const contextSchema = z.object({
  wakeAt: instant, sleepAt: instant, trainingAt: instant.nullable().default(null),
  hunger: z.enum(['normal', 'hungry', 'notHungry']).default('normal'),
  snoozedUntil: instant.nullable().default(null), ended: z.boolean().default(false)
}).strict().refine(v => {
  const hours = (+new Date(v.sleepAt) - +new Date(v.wakeAt)) / 3600000;
  return hours >= 4 && hours <= 24;
}, '睡眠时间必须在起床后 4 至 24 小时内');
export type DayContext = z.infer<typeof contextSchema>;
export const itemSchema = z.object({ foodId: z.string().min(1).max(80), grams: z.number().positive().max(3000) }).strict();
export const mealInputSchema = z.object({
  title: z.string().trim().min(1).max(120), eatenAt: instant,
  status: z.enum(['planned', 'eaten']), portion: z.enum(['small', 'normal', 'large']).default('normal'),
  items: z.array(itemSchema).min(1).max(20), confidence: z.enum(['high', 'medium', 'low']).default('medium')
}).strict();
export type MealInput = z.infer<typeof mealInputSchema>;
export interface Meal extends MealInput { id: string; revision: number; nutrition: Nutrition; createdAt: string; updatedAt: string; sourceVersion: string }
export const notificationSchema = z.object({
  enabled: z.boolean(), quietStart: z.number().int().min(0).max(23), quietEnd: z.number().int().min(0).max(23),
  ignoredCount: z.number().int().min(0).max(100).default(0)
}).strict();
export type NotificationPreferences = z.infer<typeof notificationSchema>;
export interface NotificationJob { id: string; at: string; title: string; body: string; status: 'scheduled' | 'cancelled' | 'sent'; attempts: number }
export interface Food { id: string; name: string; aliases: string[]; per100g: Record<Nutrient, number>; allergens: string[]; category: string; source: string }
export interface Candidate { id: string; title: string; items: z.infer<typeof itemSchema>[]; scene: string; minutes: number; substitution: string }
export interface Recommendation extends Candidate { reasons: string[]; score: number; nutrition: Nutrition; ruleVersion: string }
export interface Recognition { id: string; mealId: string | null; uploadId: string | null; text: string | null; status: 'queued' | 'processing' | 'ready' | 'failed' | 'confirmed'; items: z.infer<typeof itemSchema>[]; confidence: 'high' | 'medium' | 'low'; warning: string; provider: string; model: string; confirmedMealId: string | null; createdAt: string }
export interface Upload { id: string; key: string; expiresAt: string; mime: string; ready: boolean }
export interface AccountState {
  profile: Profile | null; contexts: Record<string, DayContext>; meals: Meal[];
  notifications: NotificationJob[]; notificationPreferences: NotificationPreferences;
  feedback: { recommendationId: string; action: string; at: string }[];
  recognition: Recognition[]; uploads: Upload[]; deviceTokens: Record<string, string>;
  refreshHashes: string[]; idempotency: Record<string, { hash: string; result: unknown; at: string }>;
  audit: { event: string; at: string }[];
}
export function initialState(): AccountState {
  return { profile: null, contexts: {}, meals: [], notifications: [], notificationPreferences: { enabled: false, quietStart: 22, quietEnd: 8, ignoredCount: 0 }, feedback: [], recognition: [], uploads: [], deviceTokens: {}, refreshHashes: [], idempotency: {}, audit: [] };
}
