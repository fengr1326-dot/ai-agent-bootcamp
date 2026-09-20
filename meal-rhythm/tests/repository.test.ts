import { it,expect,vi } from 'vitest';
import { initialState } from '../packages/domain/models';
import { PostgresRepository } from '../apps/api/src/repository';

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
