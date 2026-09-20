import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalRepository } from '../apps/api/src/repository';
import { ExternalIntegrations } from '../apps/api/src/integrations';
import { Service } from '../apps/api/src/service';
import { profileSchema, Recognition } from '../packages/domain/models';

const profile=profileSchema.parse({direction:'feelGood',age:28,heightCm:170,weightKg:65,sex:'unspecified',activity:'moderate',timezone:'Asia/Shanghai',constraintsConfirmed:true});
const job=():Recognition=>({id:randomUUID(),mealId:null,uploadId:null,text:'鸡肉饭',status:'queued',items:[],confidence:'low',warning:'',provider:'',model:'',confirmedMealId:null,createdAt:new Date().toISOString()});
describe('持久化和外部识别边界',()=>{
  it('进程重建后草稿与资料仍存在',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'meal-rhythm-test-'));
    try { const a=new LocalRepository(directory);await a.transact('alice',s=>{s.profile=profile;},true);const b=new LocalRepository(directory);expect((await b.read('alice'))?.profile).toEqual(profile);expect(await b.read('bob')).toBeNull();await b.delete('alice');expect(await a.read('alice')).toBeNull(); }
    finally {await rm(directory,{recursive:true,force:true});}
  });
  it('失败事务不保存部分结果',async()=>{const repo=new LocalRepository();await repo.transact('a',()=>{},true);await expect(repo.transact('a',s=>{s.profile=profile;throw new Error('rollback');})).rejects.toThrow('rollback');expect((await repo.read('a'))?.profile).toBeNull();});
  it('未配置识别不会产生假食物',async()=>{const repo=new LocalRepository(),j=job();await repo.transact('a',s=>s.recognition.push(j),true);const provider=new ExternalIntegrations(repo,{});await expect(provider.process('a',j.id)).rejects.toThrow();const actual=(await repo.read('a'))!.recognition[0];expect(actual.status).toBe('failed');expect(actual.items).toEqual([]);await provider.close();});
  it('兼容 API 只接受目录中食物并保存来源',async()=>{
    const repo=new LocalRepository(),j=job();await repo.transact('a',s=>s.recognition.push(j),true);
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[{foodId:'chicken',grams:120}],confidence:'medium',warning:'份量需要确认'})}}]}),{status:200}));
    const provider=new ExternalIntegrations(repo,{VISION_API_URL:'https://vision.example.test/v1/chat/completions',VISION_API_KEY:'test-only',VISION_MODEL:'model-under-test'},fetcher as any);
    await provider.process('a',j.id);const actual=(await repo.read('a'))!.recognition[0];expect(actual.status).toBe('ready');expect(actual.provider).toBe('vision.example.test');expect(actual.model).toBe('model-under-test');expect(actual.items[0].foodId).toBe('chicken');await provider.close();
  });
  it('模型输出未知食物或恶意结构时拒绝',async()=>{
    const repo=new LocalRepository(),j=job();await repo.transact('a',s=>s.recognition.push(j),true);
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[{foodId:'invented-food',grams:100}],confidence:'high',warning:''})}}]})));
    const provider=new ExternalIntegrations(repo,{VISION_API_URL:'https://vision.example.test',VISION_API_KEY:'test-only',VISION_MODEL:'test'},fetcher as any);
    await expect(provider.process('a',j.id)).rejects.toThrow();expect((await repo.read('a'))!.recognition[0].status).toBe('failed');await provider.close();
  });
  it('重复确认识别结果不会重复记录',async()=>{
    const repo=new LocalRepository(),j={...job(),status:'ready' as const,items:[{foodId:'rice',grams:150}]};await repo.transact('a',s=>{s.profile=profile;s.recognition.push(j);},true);
    const service=new Service(repo);const input={title:'米饭',eatenAt:new Date().toISOString(),status:'eaten',portion:'normal',confidence:'medium',items:j.items};
    const first:any=await service.write('a','confirmRecognition',{id:j.id},input,randomUUID());const again:any=await service.write('a','confirmRecognition',{id:j.id},input,randomUUID());expect(first.id).toBe(again.id);expect((await repo.read('a'))!.meals).toHaveLength(1);
  });
});
