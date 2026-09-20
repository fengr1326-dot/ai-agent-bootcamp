import { describe, expect, it } from 'vitest';
import { profileSchema, Meal, DayContext, Profile } from '../packages/domain/models';
import { estimate, nextWindow, nutritionState, recommend, safety, targetRanges, reminderAt, quietHour, localDate } from '../packages/rules/engine';
const p = profileSchema.parse({ direction: 'feelGood', age: 28, heightCm: 170, weightKg: 65, sex: 'unspecified', activity: 'moderate', timezone: 'Asia/Shanghai', constraintsConfirmed: true });
const context: DayContext = { wakeAt: '2026-09-17T03:00:00Z', sleepAt: '2026-09-17T16:00:00Z', trainingAt: null, hunger: 'normal', snoozedUntil: null, ended: false };
const now = '2026-09-17T07:00:00Z';
const meal = (overrides: Partial<Meal> = {}): Meal => ({ id: 'meal', revision: 1, title: '午餐', eatenAt: '2026-09-17T04:00:00Z', status: 'eaten', portion: 'normal', items: [{ foodId: 'chicken', grams: 120 }], confidence: 'medium', nutrition: estimate([{ foodId: 'chicken', grams: 120 }], 'normal', 'medium'), createdAt: now, updatedAt: now, sourceVersion: 'test', ...overrides });
describe('持续场景回归：时间、营养、安全、通知', () => {
  it('晚起从实际起床生成窗口', () => expect(nextWindow(context, [], context.wakeAt).start).toBe('2026-09-17T03:30:00.000Z'));
  it('已吃餐成为新锚点', () => expect(nextWindow(context, [meal()], now).start).toBe('2026-09-17T08:00:00.000Z'));
  it('小餐提前', () => expect(nextWindow(context, [meal({ portion: 'small' })], now).start).toBe('2026-09-17T07:00:00.000Z'));
  it('大餐延后', () => expect(nextWindow(context, [meal({ portion: 'large' })], now).start).toBe('2026-09-17T09:00:00.000Z'));
  it('饥饿提前半小时', () => expect(nextWindow({ ...context, hunger: 'hungry' }, [meal()], now).start).toBe('2026-09-17T07:30:00.000Z'));
  it('推迟生效', () => expect(nextWindow({ ...context, snoozedUntil: '2026-09-17T10:00:00Z' }, [meal()], now).start).toBe('2026-09-17T10:00:00.000Z'));
  it('训练前预留时间', () => expect(nextWindow({ ...context, trainingAt: '2026-09-17T09:00:00Z' }, [meal()], now).start).toBe('2026-09-17T07:30:00.000Z'));
  it('睡前不追赶', () => expect(nextWindow(context, [meal()], '2026-09-17T15:30:00Z').mode).toBe('rest'));
  it('结束今天停止窗口', () => expect(nextWindow({ ...context, ended: true }, [], now).start).toBeNull());
  it('窗口过期以现在为起点', () => expect(+new Date(nextWindow(context, [], now).start!)).toBeGreaterThanOrEqual(+new Date(now)));
  it('计划餐不计摄入', () => expect(nutritionState(p, context, [meal({ status: 'planned' })], now).consumed.protein.max).toBe(0));
  it('未来餐不计摄入', () => expect(nutritionState(p, context, [meal({ eatenAt: '2026-09-17T12:00:00Z' })], now).mealCount).toBe(0));
  it('摄入更新缺口', () => expect(nutritionState(p, context, [meal()], now).gaps.find(g=>g.key==='protein')!.remaining.max).toBeLessThan(nutritionState(p, context, [], now).gaps.find(g=>g.key==='protein')!.remaining.max));
  it('无记录显示数据不足', () => expect(nutritionState(p, context, [], now).confidence).toBe('low'));
  it('睡前缺口不催促', () => expect(nutritionState(p, context, [meal()], '2026-09-17T15:30:00Z').gaps.some(g=>g.status==='priority')).toBe(false));
  it('范围随置信度变宽', () => expect(estimate(meal().items,'normal','low').protein.max).toBeGreaterThan(estimate(meal().items,'normal','high').protein.max));
  it('未知食物不虚构营养', () => expect(()=>estimate([{foodId:'unknown',grams:100}],'normal','high')).toThrow());
  for (const [label, change] of Object.entries({ minor: { age: 16 }, underweight: { weightKg: 40 }, pregnancy: { risks: ['pregnancy'] }, clinical: { risks: ['clinical'] }, extremeGoal: { risks: ['extremeGoal'] }, disorder: { risks: ['eatingDisorder'] } })) {
    it(`风险 ${label} 停止个性化目标`, () => expect(targetRanges({ ...p, ...change } as Profile)).toBeNull());
  }
  it('没有确认忌口不推荐', () => expect(recommend({ ...p, constraintsConfirmed:false },nutritionState(p,context,[],now),[])).toHaveLength(0));
  it('乳过敏过滤所有乳制品', () => expect(recommend({ ...p, allergies:['milk'] },nutritionState(p,context,[],now),[]).some(c=>c.items.some(i=>i.foodId==='yogurt'))).toBe(false));
  it('明确不喜欢不再推荐', () => expect(recommend(p,nutritionState(p,context,[],now),[{recommendationId:'chicken-bowl',action:'dislike'}]).some(c=>c.id==='chicken-bowl')).toBe(false));
  it('只输出三个推荐', () => expect(recommend(p,nutritionState(p,context,[],now),[])).toHaveLength(3));
  it('默认通知关闭', () => expect(reminderAt(nextWindow(context,[meal()],now),{enabled:false,quietStart:22,quietEnd:8,ignoredCount:0},p.timezone,now)).toBeNull());
  it('忽略三次停止提醒', () => expect(reminderAt(nextWindow(context,[meal()],now),{enabled:true,quietStart:22,quietEnd:8,ignoredCount:3},p.timezone,now)).toBeNull());
  it('安静时段跨午夜', () => expect([23,0,7,8,15].map(hour=>quietHour(hour,{enabled:true,quietStart:22,quietEnd:8,ignoredCount:0}))).toEqual([true,true,true,false,false]));
  it('本地日期使用时区', () => expect(localDate('2026-09-17T18:00:00Z','Asia/Shanghai')).toBe('2026-09-18'));
  it('安全状态无强制身体评分', () => expect(safety(p).blocked).toBe(false));
});
