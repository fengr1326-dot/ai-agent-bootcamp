import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { AccountState, DayContext, Meal, MealInput, Profile, Recognition } from '../../../packages/domain/models';
import { foods, catalogVersion, candidates } from '../../../packages/domain/catalog';
import { allowedFood, estimate, localDate, nextWindow, nutritionState, recommend, reminderAt, safety } from '../../../packages/rules/engine';
import { digest } from './auth';
import { DomainError, Repository } from './repository';

export interface Integrations {
  presign(user: string, id: string, mime: string): Promise<{ key: string; url: string }>;
  enqueue(user: string, job: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}
export class Service {
  constructor(public repo: Repository, public integrations?: Integrations, public clock = () => new Date().toISOString()) {}
  private requireProfile(s: AccountState): Profile {
    if (!s.profile) throw new DomainError(409, 'PROFILE_REQUIRED', '请先完成初始资料');
    return s.profile;
  }
  dayContext(s: AccountState, date: string): DayContext {
    const p = this.requireProfile(s);
    const day = DateTime.fromISO(date, { zone: p.timezone });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day.isValid) throw new DomainError(400, 'INVALID_DATE', '日期格式应为 YYYY-MM-DD');
    return s.contexts[date] ?? { wakeAt: day.set({ hour: 8 }).toUTC().toISO()!, sleepAt: day.set({ hour: 23 }).toUTC().toISO()!, trainingAt: null, hunger: 'normal', snoozedUntil: null, ended: false };
  }
  todayDate(s: AccountState) {
    const p = this.requireProfile(s), now = this.clock();
    const active = Object.entries(s.contexts).filter(([,c]) => +new Date(c.wakeAt) <= +new Date(now) && +new Date(c.sleepAt) > +new Date(now)).sort((a,b)=>b[0].localeCompare(a[0]))[0];
    return active?.[0] ?? localDate(now, p.timezone);
  }
  day(s: AccountState, date: string) {
    const p = this.requireProfile(s), context = this.dayContext(s,date), now = this.clock();
    const state = nutritionState(p, context, s.meals, now), window = nextWindow(context,s.meals,now);
    const meals = s.meals.filter(m=>+new Date(m.eatenAt)>=+new Date(context.wakeAt) && +new Date(m.eatenAt)<=+new Date(context.sleepAt)).sort((a,b)=>b.eatenAt.localeCompare(a.eatenAt));
    return { date, context, window, nutrition: state, meals, recommendations: recommend(p,state,s.feedback), safety: safety(p), notificationPreferences: s.notificationPreferences, catalogVersion, experimental: true };
  }
  reschedule(s: AccountState) {
    for (const job of s.notifications) if (job.status === 'scheduled') job.status = +new Date(job.at)<=+new Date(this.clock()) ? 'sent' : 'cancelled';
    if (!s.profile) return;
    const date = this.todayDate(s), day = this.day(s,date);
    if (day.safety.blocked || day.safety.needsConstraints) return;
    // Conservative local-delivery budget: elapsed schedules count even if OS delivery is unknown.
    const calendarDate=localDate(this.clock(),s.profile.timezone);
    if(s.notifications.filter(n=>n.status==='sent'&&localDate(n.at,s.profile!.timezone)===calendarDate).length>=3) return;
    const at = reminderAt(day.window,s.notificationPreferences,s.profile.timezone,this.clock());
    const key = `window-${date}-${day.window.start}`;
    // A sent notification is never recreated. Unsent jobs are replaced, not duplicated.
    const existing = s.notifications.find(n=>n.id===key);
    if (at && existing?.status !== 'sent') {
      if (existing) { existing.at=at; existing.status='scheduled'; }
      else s.notifications.push({ id:key,at,title:'下一餐的小提醒',body:'有空时看看今天的下一步建议。',status:'scheduled',attempts:0 });
    }
    s.notifications = s.notifications.slice(-100);
  }
  makeMeal(input: MealInput, id: string = randomUUID()): Meal {
    if (input.status === 'eaten' && +new Date(input.eatenAt) > +new Date(this.clock()) + 60000) throw new DomainError(400,'FUTURE_MEAL','尚未吃的餐请选择准备吃');
    let nutrition;
    try { nutrition = estimate(input.items,input.portion,input.confidence); }
    catch (e) { throw new DomainError(400,'UNKNOWN_FOOD',(e as Error).message); }
    return { ...input,id,nutrition,revision:1,createdAt:this.clock(),updatedAt:this.clock(),sourceVersion:catalogVersion };
  }
  private getMeal(s: AccountState,id: string) { const meal=s.meals.find(m=>m.id===id); if(!meal) throw new DomainError(404,'MEAL_NOT_FOUND','找不到这条餐次'); return meal; }
  private getJob(s: AccountState,id: string) { const job=s.recognition.find(j=>j.id===id); if(!job) throw new DomainError(404,'JOB_NOT_FOUND','找不到识别任务'); return job; }
  async read(user: string,operation: string,params: Record<string,string>,query: Record<string,string>) {
    const s=await this.repo.read(user); if(!s) throw new DomainError(401,'UNAUTHORIZED','请先登录');
    switch(operation) {
      case 'profile': return s.profile;
      case 'foods': return { version:catalogVersion,experimental:true,items: foods.filter(f=>!query.q || [f.name,...f.aliases].some(x=>x.includes(query.q))) };
      case 'day': return this.day(s,params.date === 'today' ? this.todayDate(s) : params.date);
      case 'nutrition': return this.day(s,params.date === 'today' ? this.todayDate(s) : params.date).nutrition;
      case 'meal': return this.getMeal(s,params.id);
      case 'meals': {
        const sorted=[...s.meals].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
        const index=query.cursor ? sorted.findIndex(m=>m.id===query.cursor)+1 : 0;
        if(query.cursor && index===0) throw new DomainError(400,'INVALID_CURSOR','分页游标已失效');
        const items=sorted.slice(index,index+20);
        return {items,nextCursor:sorted.length>index+20 ? items.at(-1)!.id : null};
      }
      case 'recommendations': return this.day(s,this.todayDate(s)).recommendations;
      case 'recognition': return this.getJob(s,params.id);
      case 'notifications': return s.notifications.filter(n=>n.status==='scheduled');
      case 'trends': {
        const p=this.requireProfile(s), today=DateTime.fromISO(this.clock()).setZone(p.timezone);
        return {days:Array.from({length:7},(_,i)=>{ const date=today.minus({days:6-i}).toISODate()!; const day=this.day(s,date); return {date,mealCount:day.nutrition.mealCount,consumed:day.nutrition.consumed,confidence:day.nutrition.confidence}; }),message:'趋势用于理解自己的节奏，不需要补记过去。'};
      }
      default: throw new DomainError(404,'NOT_FOUND','接口不存在');
    }
  }
  async write(user: string,operation: string,params: Record<string,string>,input: any,key: string) {
    if(!/^[\w-]{8,128}$/.test(key)) throw new DomainError(400,'IDEMPOTENCY_REQUIRED','写操作需要 8 至 128 位 Idempotency-Key');
    const hash=digest(JSON.stringify({operation,params,input}));
    if(operation==='deleteAccount') {
      const state=await this.repo.read(user);
      if(state?.uploads.length) { if(!this.integrations) throw new DomainError(503,'STORAGE_UNAVAILABLE','照片删除服务暂不可用'); await this.integrations.remove(state.uploads.map(u=>u.key)); }
      await this.repo.delete(user); return {deleted:true};
    }
    // Presigning has no durable external side effects; generate once outside a retryable DB transaction.
    const presignId=operation==='presign' ? randomUUID() : null;
    const signed=presignId ? await this.integrations?.presign(user,presignId,input.mime) : null;
    const result = await this.repo.transact(user, async s=>{
      const saved=s.idempotency[key];
      if(saved) { if(saved.hash!==hash) throw new DomainError(409,'IDEMPOTENCY_CONFLICT','同一请求编号不能用于不同内容'); return saved.result; }
      let result: any;
      switch(operation) {
        case 'saveProfile': s.profile=input; this.reschedule(s); result=s.profile; break;
        case 'context': {
          const p=this.requireProfile(s);
          if(localDate(input.wakeAt,p.timezone)!==params.date) throw new DomainError(400,'DATE_MISMATCH','起床时间与本地日期不一致');
          if(input.trainingAt && (+new Date(input.trainingAt)<+new Date(input.wakeAt) || +new Date(input.trainingAt)>+new Date(input.sleepAt))) throw new DomainError(400,'TRAINING_OUTSIDE_DAY','训练时间应在当天起床和睡眠之间');
          s.contexts[params.date]=input; this.reschedule(s); result=this.day(s,params.date); break;
        }
        case 'createMeal': this.requireProfile(s); result=this.makeMeal(input); s.meals.push(result); this.reschedule(s); break;
        case 'updateMeal': {
          const old=this.getMeal(s,params.id);
          if(old.revision!==input.revision) throw new DomainError(409,'REVISION_CONFLICT','餐次已在其他位置更新，请刷新后重试');
          const {revision,...body}=input;
          result={...this.makeMeal(body,old.id),createdAt:old.createdAt,revision:revision+1};
          s.meals=s.meals.map(m=>m.id===old.id?result:m); this.reschedule(s); break;
        }
        case 'deleteMeal': this.getMeal(s,params.id); s.meals=s.meals.filter(m=>m.id!==params.id); this.reschedule(s); result={deleted:true}; break;
        case 'preMeal': {
          const p=this.requireProfile(s), simulated=this.makeMeal({...input,status:'planned'});
          const safe=safety(p), forbidden=simulated.items.filter(i=>{
            const f=foods.find(f=>f.id===i.foodId)!;
            return !allowedFood(f,p);
          });
          result={meal:simulated,canRecommend:!safe.blocked&&!safe.needsConstraints&&forbidden.length===0,judgment:safe.message ?? (forbidden.length ? '含有你标记的不吃项，请更换。' : '可以作为候选，份量按实际情况确认。'),keep:simulated.nutrition.protein.min>15?'保留这份蛋白质来源':'保留自己喜欢的部分',adjustments:simulated.nutrition.fiber.min<4?['可以加一份蔬菜']:['保持当前搭配'],warning:'油、酱汁和份量只能估算；不会自动记为已吃。'}; break;
        }
        case 'feedback': if(!candidates.some(c=>c.id===params.id)) throw new DomainError(404,'RECOMMENDATION_NOT_FOUND','推荐不存在'); s.feedback.push({recommendationId:params.id,action:input.action,at:this.clock()}); result={saved:true}; break;
        case 'notificationPreferences': s.notificationPreferences=input; this.reschedule(s); result=input; break;
        case 'device': s.deviceTokens[params.id]=input.token; result={saved:true}; break;
        case 'respondNotification': {
          const notification=s.notifications.find(n=>n.id===params.id);
          if(!notification) throw new DomainError(404,'NOTIFICATION_NOT_FOUND','提醒不存在');
          if(notification.status==='cancelled') {result={saved:true};break;}
          notification.status='sent';
          if(input.action==='ignored') s.notificationPreferences.ignoredCount++;
          if(input.action==='opened') s.notificationPreferences.ignoredCount=0;
          if(input.action==='snooze') { const date=this.todayDate(s); s.contexts[date]={...this.dayContext(s,date),snoozedUntil:input.until ?? new Date(+new Date(this.clock())+30*60000).toISOString()}; }
          this.reschedule(s); result={saved:true}; break;
        }
        case 'presign': {
          if(!signed) throw new DomainError(503,'STORAGE_NOT_CONFIGURED','尚未配置图片存储，可先用文字记录');
          const expiresAt=new Date(+new Date(this.clock())+15*60000).toISOString();
          s.uploads.push({id:presignId!,key:signed.key,expiresAt,mime:input.mime,ready:false});
          result={uploadId:presignId,url:signed.url,expiresAt}; break;
        }
        case 'recognize': {
          this.requireProfile(s);
          if(input.mealId) this.getMeal(s,input.mealId);
          if(input.uploadId && !s.uploads.some(u=>u.id===input.uploadId)) throw new DomainError(404,'UPLOAD_NOT_FOUND','照片不存在');
          result={id:randomUUID(),mealId:input.mealId??null,uploadId:input.uploadId??null,text:input.text??null,status:'queued',items:[],confidence:'low',warning:'等待识别；结果需要你确认。',provider:'',model:'',confirmedMealId:null,createdAt:this.clock()} satisfies Recognition;
          s.recognition.push(result); break;
        }
        case 'confirmRecognition': {
          const job=this.getJob(s,params.id);
          if(job.status==='confirmed') { result=this.getMeal(s,job.confirmedMealId!); break; }
          if(job.status!=='ready') throw new DomainError(409,'JOB_NOT_READY','识别尚未完成，可改用手动记录');
          result=this.makeMeal(input,job.mealId??undefined);
          if(job.mealId) { const old=this.getMeal(s,job.mealId); result.revision=old.revision+1; result.createdAt=old.createdAt; s.meals=s.meals.map(m=>m.id===old.id?result:m); }
          else s.meals.push(result);
          job.status='confirmed'; job.confirmedMealId=result.id; this.reschedule(s); break;
        }
        case 'export': result={exportedAt:this.clock(),profile:s.profile,contexts:s.contexts,meals:s.meals,feedback:s.feedback,notificationPreferences:s.notificationPreferences,recognition:s.recognition.map(({text,...j})=>j),photoCount:s.uploads.length}; break;
        default: throw new DomainError(404,'NOT_FOUND','接口不存在');
      }
      s.audit.push({event:operation,at:this.clock()}); s.audit=s.audit.slice(-500);
      s.idempotency[key]={hash,result,at:this.clock()};
      // A bounded 24-hour deduplication window; documented to clients.
      for(const [k,v] of Object.entries(s.idempotency)) if(+new Date(v.at)<+new Date(this.clock())-86400000) delete s.idempotency[k];
      return result;
    });
    if(operation==='recognize' && this.integrations) await this.integrations.enqueue(user,(result as Recognition).id);
    return result;
  }
}
