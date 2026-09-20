import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Queue,Worker } from 'bullmq';
import { PostgresRepository } from '../apps/api/src/repository';
import { redisConnection } from '../apps/api/src/integrations';

// Explicitly opt into disposable test services; never infer permission from production env.
describe.skipIf(!process.env.TEST_DATABASE_URL)('真实 PostgreSQL 集成',()=>{
  it('并发事务不丢写入，重连读取成功，删除后禁止复活',async()=>{
    const repo=new PostgresRepository(new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}}));const id=`test-${randomUUID()}`;
    try {
      await repo.transact(id,()=>{},true);
      await Promise.all(Array.from({length:3},(_,i)=>repo.transact(id,s=>{s.audit.push({event:`write-${i}`,at:new Date().toISOString()});})));
      expect((await repo.read(id))?.audit).toHaveLength(3);
      await repo.close();const reopened=new PostgresRepository(new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}}));
      try {expect((await reopened.read(id))?.audit).toHaveLength(3);await reopened.delete(id);await expect(reopened.transact(id,()=>{})).rejects.toThrow('账号已删除');}
      finally {await reopened.delete(id);await reopened.close();}
    } finally {await repo.delete(id);await repo.close();}
  });
});
describe.skipIf(!process.env.TEST_REDIS_URL)('真实 Redis 队列集成',()=>{
  it('失败任务会重试且相同 jobId 不会重复执行成功任务',async()=>{
    const name=`test-${randomUUID()}`,connection=redisConnection(process.env.TEST_REDIS_URL!);const queue=new Queue(name,{connection});let attempts=0;
    const worker=new Worker(name,async()=>{attempts++;if(attempts===1)throw new Error('temporary');return 'ready';},{connection});
    try {
      const completion=new Promise(resolve=>worker.once('completed',resolve));await worker.waitUntilReady();
      await queue.add('recognize',{test:true},{jobId:'one-job',attempts:2,backoff:{type:'fixed',delay:10}});await completion;
      await queue.add('recognize',{test:true},{jobId:'one-job'});expect(attempts).toBe(2);expect(await queue.getCompletedCount()).toBe(1);
    } finally {await worker.close();await queue.obliterate({force:true});await queue.close();}
  });
});
