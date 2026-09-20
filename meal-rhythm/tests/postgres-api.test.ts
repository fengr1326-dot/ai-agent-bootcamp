import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/api/src/app';
import { PostgresRepository } from '../apps/api/src/repository';

describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL 支持的真实业务接口',()=>{
  let server:Awaited<ReturnType<typeof createApp>>,repo:PostgresRepository,token:string,user:string;
  const owned:string[]=[];
  const profile={direction:'feelGood',age:28,heightCm:170,weightKg:65,sex:'unspecified',activity:'moderate',timezone:'Asia/Shanghai',constraintsConfirmed:true};
  const meal={title:'数据库测试午餐',eatenAt:'2026-09-17T04:00:00Z',status:'eaten',portion:'normal',items:[{foodId:'rice',grams:150}],confidence:'medium'};
  const call=(method:string,url:string,body?:unknown,key=randomUUID())=>server.fastify.inject({method:method as any,url,headers:{authorization:`Bearer ${token}`,'idempotency-key':key},...(body===undefined?{}:{payload:body as any})});
  beforeEach(async()=>{
    repo=new PostgresRepository(new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}}));
    server=await createApp({repo,guestEnabled:true,secret:'postgres-integration-only-32-character-secret',clock:()=> '2026-09-17T06:00:00Z'});
    const session=await server.auth.guest();token=session.accessToken;user=session.userId;owned.push(user);
    expect((await call('PATCH','/v1/profile',profile)).statusCode).toBe(200);
  });
  afterEach(async()=>{for(const id of owned.splice(0))await repo.delete(id);await server.app.close();await repo.close();});
  it('并发相同请求只记录一餐且每日摄入一致',async()=>{
    const key=randomUUID();const results=await Promise.all(Array.from({length:16},()=>call('POST','/v1/meals',meal,key)));
    expect(results.map(r=>r.statusCode)).toEqual(Array(16).fill(200));expect(new Set(results.map(r=>r.json().data.id)).size).toBe(1);
    const day=(await call('GET','/v1/days/today')).json().data;expect(day.nutrition.mealCount).toBe(1);expect(day.meals).toHaveLength(1);
  });
  it('并发旧版本修正不能互相覆盖，事务异常不能部分写入',async()=>{
    const created=(await call('POST','/v1/meals',meal)).json().data;
    const responses=await Promise.all(['small','large'].map(portion=>call('PATCH',`/v1/meals/${created.id}`,{...meal,portion,revision:1})));
    expect(responses.map(r=>r.statusCode).sort()).toEqual([200,409]);
    await expect(repo.transact(user,s=>{s.meals=[];throw new Error('rollback');})).rejects.toThrow('rollback');
    expect((await repo.read(user))?.meals[0].revision).toBe(2);
  });
  it('另一账号无法读取餐次，删除后会话立即失效',async()=>{
    const created=(await call('POST','/v1/meals',meal)).json().data;
    const other=await server.auth.guest();owned.push(other.userId);
    const result=await server.fastify.inject({method:'GET',url:`/v1/meals/${created.id}`,headers:{authorization:`Bearer ${other.accessToken}`}});expect(result.statusCode).toBe(404);
    expect((await call('DELETE','/v1/account')).statusCode).toBe(200);expect((await call('GET','/v1/profile')).statusCode).toBe(401);
  });
  it('与删除并发的旧事务不能重新创建账号',async()=>{
    let announce!:()=>void,release!:()=>void;
    const entered=new Promise<void>(resolve=>announce=resolve),gate=new Promise<void>(resolve=>release=resolve);
    const write=repo.transact(user,async s=>{announce();await gate;s.audit.push({event:'late-write',at:new Date().toISOString()});});
    // Attach a handler before releasing the transaction, avoiding an unhandled rejection.
    const outcome=write.then(()=>({saved:true,error:''}),e=>({saved:false,error:String(e)}));
    await entered;
    try {await repo.delete(user);} finally {release();}
    const result=await outcome;expect(result.saved).toBe(false);expect(await repo.read(user)).toBeNull();
  });
});
