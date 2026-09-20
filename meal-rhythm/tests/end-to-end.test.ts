import { it,expect,vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app';
import { LocalRepository } from '../apps/api/src/repository';
import { ExternalIntegrations } from '../apps/api/src/integrations';
import { responseSchemas } from '../packages/contracts/responses';

it('真实 HTTP 全流程：首次设置 → 吃前 → 文字识别 → 修正确认 → 重启读取 → 导出删除',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'meal-e2e-'));
  const vision=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    const input=JSON.parse(body);expect(input.model).toBe('e2e-model');expect(input.messages[1].content[0].text).toBe('鸡肉饭');
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[{foodId:'chicken',grams:120},{foodId:'rice',grams:150}],confidence:'medium',warning:'请确认份量'})}}]}));
  });
  vision.listen(0,'127.0.0.1');await once(vision,'listening');
  const repo=new LocalRepository(directory);
  const integrations=new ExternalIntegrations(repo,{VISION_API_URL:`http://127.0.0.1:${(vision.address() as any).port}`,VISION_API_KEY:'test-only',VISION_MODEL:'e2e-model'});
  let processingError='';const process=integrations.process.bind(integrations);
  vi.spyOn(integrations,'process').mockImplementation(async(user,id)=>{try {await process(user,id);} catch(e) {processingError=String(e);throw e;}});
  const server=await createApp({repo,integrations,guestEnabled:true,secret:'e2e-only-secret-more-than-32-characters',clock:()=> '2026-09-17T06:00:00.000Z'});
  let token='';
  try {
    await server.app.listen(0,'127.0.0.1');const url=await server.app.getUrl();
    const call=async(method:string,path:string,body?:unknown,operation?:string,key=randomUUID())=>{
      const response=await fetch(url+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),Authorization:`Bearer ${token}`,'Idempotency-Key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const envelope=await response.json() as any;expect(response.status,JSON.stringify(envelope)).toBe(200);
      if(operation)expect(responseSchemas[operation].safeParse(envelope.data).success,operation).toBe(true);
      return envelope.data;
    };
    const session=await call('POST','/v1/auth/guest',{},'guest');token=session.accessToken;
    await call('PATCH','/v1/profile',{direction:'feelGood',age:28,heightCm:170,weightKg:65,sex:'unspecified',activity:'moderate',timezone:'Asia/Shanghai',constraintsConfirmed:true},'saveProfile');
    await call('PUT','/v1/days/2026-09-17/context',{wakeAt:'2026-09-17T00:00:00.000Z',sleepAt:'2026-09-17T15:00:00.000Z'},'context');
    const planned={title:'准备吃午餐',eatenAt:'2026-09-17T04:00:00.000Z',status:'planned',portion:'normal',confidence:'medium',items:[{foodId:'rice',grams:150}]};
    await call('POST','/v1/pre-meal',planned,'preMeal');
    expect((await call('GET','/v1/days/today',undefined,'day')).nutrition.mealCount).toBe(0);
    const recognition=await call('POST','/v1/recognition-jobs',{text:'鸡肉饭',consent:true},'recognize');
    let job=recognition;
    for(let i=0;i<100 && !['ready','failed'].includes(job.status);i++){await delay(10);job=await call('GET',`/v1/recognition-jobs/${job.id}`,undefined,'recognition');}
    expect(job.status,processingError).toBe('ready');
    const confirmed={...planned,title:'午餐',status:'eaten',items:job.items};const key=randomUUID();
    const meal=await call('POST',`/v1/recognition-jobs/${job.id}/confirm`,confirmed,'confirmRecognition',key);
    expect((await call('POST',`/v1/recognition-jobs/${job.id}/confirm`,confirmed,'confirmRecognition',key)).id).toBe(meal.id);
    await call('PATCH',`/v1/meals/${meal.id}`,{...confirmed,portion:'small',revision:1},'updateMeal');
    const day=await call('GET','/v1/days/today',undefined,'day');expect(day.nutrition.mealCount).toBe(1);expect(day.meals[0].revision).toBe(2);
    expect((await new LocalRepository(directory).read(session.userId))?.meals).toHaveLength(1);
    const exported=await call('POST','/v1/data-exports',{},'export');expect(exported.meals).toHaveLength(1);expect(exported.refreshHashes).toBeUndefined();
    await call('DELETE','/v1/account',undefined,'deleteAccount');expect(await new LocalRepository(directory).read(session.userId)).toBeNull();
    expect((await fetch(url+'/v1/profile',{headers:{Authorization:`Bearer ${token}`}})).status).toBe(401);
  } finally {
    await server.app.close();await integrations.close();await repo.close();vision.close();await once(vision,'close');await rm(directory,{recursive:true,force:true});
  }
});
