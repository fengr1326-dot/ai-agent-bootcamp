import { expect, it } from 'vitest';
import { createApp } from '../apps/api/src/app';
import { LocalRepository } from '../apps/api/src/repository';

it('启动真实 TCP 服务并完成手机同样的 HTTP 登录与资料读写',async()=>{
  const {app}=await createApp({repo:new LocalRepository(),guestEnabled:true,secret:'http-smoke-test-secret-32-characters-long'});
  try {
    await app.listen(0,'127.0.0.1');const address=await app.getUrl();
    const health=await fetch(address+'/v1/health');expect(health.ok).toBe(true);
    const session=await (await fetch(address+'/v1/auth/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json() as any;
    const response=await fetch(address+'/v1/profile',{headers:{Authorization:`Bearer ${session.data.accessToken}`}});expect(response.status).toBe(200);expect((await response.json() as any).data).toBeNull();
  } finally {await app.close();}
});
