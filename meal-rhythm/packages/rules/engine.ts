import { DateTime } from 'luxon';
import { candidates, foods } from '../domain/catalog';
import { DayContext, Food, Meal, MealInput, NotificationPreferences, Nutrition, Nutrient, Profile, Range, Recommendation, nutrientKeys } from '../domain/models';

export const ruleVersion = 'rhythm-0.1.0-experimental';
export const zero = (): Nutrition => Object.fromEntries(nutrientKeys.map(k => [k, { min: 0, max: 0 }])) as Nutrition;
const round = (x: number) => Math.round(x * 10) / 10;
export function estimate(items: MealInput['items'], portion: MealInput['portion'], confidence: MealInput['confidence'], catalog: Food[] = foods): Nutrition {
  const result = zero();
  const scale = { small: 0.75, normal: 1, large: 1.3 }[portion];
  const error = { high: 0.1, medium: 0.25, low: 0.4 }[confidence];
  for (const item of items) {
    const entry = catalog.find(f => f.id === item.foodId);
    if (!entry) throw new Error(`未知食物：${item.foodId}`);
    for (const k of nutrientKeys) {
      const amount = entry.per100g[k] * item.grams * scale / 100;
      result[k].min += amount * (1 - error);
      result[k].max += amount * (1 + error);
    }
  }
  for (const k of nutrientKeys) result[k] = { min: round(result[k].min), max: round(result[k].max) };
  return result;
}
export function safety(profile: Profile) {
  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const reasons = [...profile.risks];
  const blocked = profile.age < 18 || bmi < 18.5 || bmi > 40 || reasons.length > 0;
  return { blocked, needsConstraints: !profile.constraintsConfirmed,
    message: blocked ? '当前情况需要专业支持，暂不提供个性化营养目标；仍可记录饮食。' : !profile.constraintsConfirmed ? '先确认过敏和忌口，再提供食物建议。' : null };
}
// Prototype coefficients require professional review before consumer release.
export function targetRanges(p: Profile): Nutrition | null {
  if (safety(p).blocked) return null;
  const baseline = (10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78)) * { low: 1.3, moderate: 1.5, high: 1.7 }[p.activity];
  const target = Math.max(1600, baseline * { feelGood: 1, leanFit: 0.9, buildShape: 1.08 }[p.direction]);
  const protein = p.weightKg * (p.direction === 'feelGood' ? 1 : 1.4);
  return { energy: { min: Math.round(target * 0.9), max: Math.round(target * 1.1) }, protein: { min: round(protein), max: round(protein * 1.25) }, fiber: { min: 25, max: 30 }, water: { min: 1800, max: 2500 } };
}
export function localDate(iso: string, timezone: string): string { return DateTime.fromISO(iso).setZone(timezone).toISODate()!; }
export function mealsForDay(meals: Meal[], context: DayContext, now: string) {
  // The user's waking day may cross midnight. Future/planned meals never count as intake.
  const from = +new Date(context.wakeAt), until = Math.min(+new Date(context.sleepAt), +new Date(now));
  return meals.filter(m => m.status === 'eaten' && +new Date(m.eatenAt) >= from && +new Date(m.eatenAt) <= until);
}
export function nutritionState(p: Profile, context: DayContext, meals: Meal[], now: string) {
  const consumed = zero(), dailyMeals = mealsForDay(meals, context, now);
  for (const meal of dailyMeals) for (const key of nutrientKeys) {
    consumed[key].min = round(consumed[key].min + meal.nutrition[key].min);
    consumed[key].max = round(consumed[key].max + meal.nutrition[key].max);
  }
  const targets = targetRanges(p);
  const bedtime = +new Date(context.sleepAt) - +new Date(now) < 90 * 60000 || context.ended;
  const gaps = targets ? nutrientKeys.map(key => {
    const remaining: Range = { min: round(Math.max(0, targets[key].min - consumed[key].max)), max: round(Math.max(0, targets[key].max - consumed[key].min)) };
    const status = consumed[key].min > targets[key].max ? 'possiblyExcess' : remaining.max === 0 ? 'sufficient' : dailyMeals.length === 0 ? 'insufficientData' : bedtime ? 'optional' : remaining.min / targets[key].min > 0.35 ? 'priority' : 'optional';
    return { key, remaining, status, label: { energy: '能量', protein: '蛋白质', fiber: '纤维', water: '水分' }[key], unit: key === 'energy' ? 'kcal' : key === 'water' ? 'ml' : 'g' };
  }) : [];
  gaps.sort((a, b) => (b.status === 'priority' ? 1 : 0) - (a.status === 'priority' ? 1 : 0));
  return { consumed, targets, gaps, highlights: gaps.filter(g => !['sufficient', 'possiblyExcess'].includes(g.status)).slice(0, 3), confidence: dailyMeals.length === 0 || dailyMeals.some(m => m.confidence === 'low') ? 'low' : 'medium', mealCount: dailyMeals.length, bedtime, ruleVersion };
}
export function nextWindow(context: DayContext, meals: Meal[], now: string) {
  const current = +new Date(now), wake = +new Date(context.wakeAt), sleep = +new Date(context.sleepAt);
  if (context.ended || current >= sleep - 60 * 60000) return { start: null, end: null, reason: '临近休息，不必追赶数字；按饥饿感做轻量调整。', mode: 'rest' };
  const last = mealsForDay(meals, context, now).sort((a,b) => +new Date(b.eatenAt)-+new Date(a.eatenAt))[0];
  let start = last ? +new Date(last.eatenAt) + ({ small: 180, normal: 240, large: 300 }[last.portion]) * 60000 : wake + 30 * 60000;
  let reason = last ? `根据上一餐${{ small: '较轻', normal: '的时间', large: '份量较大' }[last.portion]}调整。` : '从今天的实际起床时间开始。';
  if (context.hunger === 'hungry') { start -= 30 * 60000; reason += ' 如果已经饿了，可以提前。'; }
  if (context.hunger === 'notHungry') start += 30 * 60000;
  if (context.trainingAt) {
    const train = +new Date(context.trainingAt);
    if (train > current && Math.abs(start - train) < 90 * 60000) { start = train - 90 * 60000; reason += ' 为训练预留时间。'; }
  }
  if (context.snoozedUntil) start = Math.max(start, +new Date(context.snoozedUntil));
  start = Math.ceil(Math.max(start, current, wake) / (15 * 60000)) * 15 * 60000;
  if (start >= sleep - 60 * 60000) return { start: null, end: null, reason: '今天无需强追进食窗口。', mode: 'rest' };
  const end = Math.min(start + 45 * 60000, sleep - 60 * 60000);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), reason, mode: 'meal' };
}
export function allowedFood(f: Food, p: Profile): boolean {
  const normalize = (s: string) => s.trim().toLowerCase();
  const forbidden = [...p.allergies, ...p.excludedFoods].map(normalize);
  const labels = [f.id, f.name, ...f.aliases, ...f.allergens].map(normalize);
  return !forbidden.some(x => labels.some(y => x === y || (x.length > 1 && (y.includes(x) || x.includes(y)))));
}
export function recommend(p: Profile, state: ReturnType<typeof nutritionState>, feedback: { recommendationId: string; action: string }[], catalog: Food[] = foods): Recommendation[] {
  if (safety(p).blocked || !p.constraintsConfirmed || state.bedtime) return [];
  return candidates.filter(c => c.items.every(i => { const f = catalog.find(f => f.id === i.foodId); return !!f && allowedFood(f, p); }))
    .filter(c => !feedback.some(f => f.recommendationId === c.id && f.action === 'dislike'))
    .map(c => {
      const nutrition = estimate(c.items, 'normal', 'medium', catalog);
      const proteinGap = state.gaps.find(g => g.key === 'protein')!;
      const fiberGap = state.gaps.find(g => g.key === 'fiber')!;
      const score = (proteinGap.remaining.min > 0 ? nutrition.protein.min : 0) * (p.direction === 'feelGood' ? 1 : 1.5) + (fiberGap.remaining.min > 0 ? nutrition.fiber.min * 5 : 0) - c.minutes / 5 + Math.min(4, feedback.filter(f => f.recommendationId === c.id && f.action === 'adopt').length);
      const reasons = [proteinGap.remaining.min > 0 ? '提供蛋白质来源' : '保持食物多样性', fiberGap.remaining.min > 0 ? '增加蔬菜或全谷物，补充纤维' : '按当前场景选择容易准备的组合'];
      return { ...c, nutrition, score: round(score), reasons, ruleVersion };
    }).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0,3);
}
export function quietHour(hour: number, p: NotificationPreferences) {
  if (p.quietStart === p.quietEnd) return false;
  return p.quietStart < p.quietEnd ? hour >= p.quietStart && hour < p.quietEnd : hour >= p.quietStart || hour < p.quietEnd;
}
export function reminderAt(window: ReturnType<typeof nextWindow>, p: NotificationPreferences, timezone: string, now: string): string | null {
  if (!p.enabled || p.ignoredCount >= 3 || !window.start) return null;
  const at = DateTime.fromISO(window.start).minus({ minutes: 20 });
  if (at.toMillis() <= +new Date(now) || quietHour(at.setZone(timezone).hour, p)) return null;
  return at.toUTC().toISO()!;
}
