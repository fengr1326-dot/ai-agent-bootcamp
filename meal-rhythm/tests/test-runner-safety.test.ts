import { it,expect } from 'vitest';
import { resolve,join } from 'node:path';
import { assertTestClusterPath,freeLoopbackPort } from '../scripts/temporary-postgres';

it('临时数据库清理只允许指定根目录下独立生成的测试目录',()=>{
  const root=resolve('.data/test-clusters');
  expect(assertTestClusterPath(root,join(root,'pg-test-abc123'))).toBe(join(root,'pg-test-abc123'));
  for(const target of [root,resolve('.'),resolve('.data/accounts'),join(root,'..','pg-test-abc'),join(root,'pg-test-abc','nested'),join(root,'production')])expect(()=>assertTestClusterPath(root,target)).toThrow('Refusing cleanup');
});
it('数据库测试端口由回环地址动态分配',async()=>{expect(await freeLoopbackPort()).toBeGreaterThan(0);});
