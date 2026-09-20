import { afterEach,it,expect,vi } from 'vitest';
import { initialState } from '../packages/domain/models';
import { PostgresRepository } from '../apps/api/src/repository';
afterEach(()=>vi.useRealTimers());

it('幂等重放或只读事务不写入未变化的账号',async()=>{
  const account={findUnique:vi.fn(async()=>({state:initialState()})),update:vi.fn(),create:vi.fn()};
  const repo=new PostgresRepository({$transaction:async(fn:any)=>fn({account})});
  expect(await repo.transact('a',()=>({saved:true}))).toEqual({saved:true});
  expect(account.update).not.toHaveBeenCalled();expect(account.create).not.toHaveBeenCalled();
});
it.each(['P2034','P2002'])('事务冲突 %s 退避后重试整个事务',async(code)=>{
  vi.useFakeTimers();
  const transaction=vi.fn().mockRejectedValueOnce({code}).mockResolvedValueOnce('saved');
  const result=new PostgresRepository({$transaction:transaction}).transact('a',()=>{});
  await vi.runAllTimersAsync();expect(await result).toBe('saved');expect(transaction).toHaveBeenCalledTimes(2);
});
it('持续冲突有重试上限并返回可重试错误而非内部错误',async()=>{
  vi.useFakeTimers();const transaction=vi.fn().mockRejectedValue({code:'P2034'});
  const result=expect(new PostgresRepository({$transaction:transaction}).transact('a',()=>{})).rejects.toMatchObject({status:503,code:'TRANSACTION_BUSY'});
  await vi.runAllTimersAsync();await result;expect(transaction).toHaveBeenCalledTimes(8);
});

it('已有账号事务只允许更新，删除竞态不能走 upsert 恢复账号',async()=>{
  const account={findUnique:vi.fn(async()=>({id:'a',state:initialState()})),update:vi.fn(async()=>{throw Object.assign(new Error('deleted'),{code:'P2025'});}),create:vi.fn(),upsert:vi.fn()};
  const repo=new PostgresRepository({$transaction:async(fn:any)=>fn({account})});
  await expect(repo.transact('a',s=>{s.audit.push({event:'late',at:new Date().toISOString()});})).rejects.toMatchObject({status:401,code:'ACCOUNT_UNAVAILABLE'});
  expect(account.update).toHaveBeenCalledOnce();expect(account.create).not.toHaveBeenCalled();expect(account.upsert).not.toHaveBeenCalled();
});
it('只有显式创建请求可创建不存在的账号',async()=>{
  const account={findUnique:vi.fn(async()=>null),update:vi.fn(),create:vi.fn(async()=>({}))};
  const repo=new PostgresRepository({$transaction:async(fn:any)=>fn({account})});
  await expect(repo.transact('a',()=>{})).rejects.toMatchObject({code:'ACCOUNT_UNAVAILABLE'});expect(account.create).not.toHaveBeenCalled();
  await repo.transact('a',()=>{},true);expect(account.create).toHaveBeenCalledOnce();expect(account.update).not.toHaveBeenCalled();
});
