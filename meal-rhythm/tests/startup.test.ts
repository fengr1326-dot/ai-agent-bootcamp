import { afterEach,it,expect,vi } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { runtime } from '../apps/api/src/runtime';
import { createApp } from '../apps/api/src/app';
import { LocalRepository } from '../apps/api/src/repository';

afterEach(()=>vi.unstubAllEnvs());
it('已构建的正式入口进程能启动、响应健康检查并写入开发账号',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'meal-startup-'));
  const child=spawn(process.execPath,[resolve('dist/apps/api/src/main.js')],{
    cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:'0',ALLOW_GUEST:'true',AUTH_SECRET:'startup-smoke-only-secret-32-characters',DATABASE_URL:'',REDIS_URL:'',S3_BUCKET:'',DATA_DIR:directory}
  });
  const exited=once(child,'exit');
  try {
    const url=await new Promise<string>((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('API startup timed out')),8000);
      child.stdout!.on('data',chunk=>{output+=String(chunk);const match=output.match(/Meal Rhythm API listening at (http:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('API exited before becoming ready'));});
    });
    const health=await fetch(url+'/v1/health');expect(health.status).toBe(200);expect((await health.json() as any).data.storage).toBe('local');
    const login=await fetch(url+'/v1/auth/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    expect(login.status).toBe(200);expect((await new LocalRepository(directory).ids())).toHaveLength(1);
  } finally {if(child.exitCode===null)child.kill();await exited;await rm(directory,{recursive:true,force:true});}
});
it('生产环境不能绕过未经审核的营养数据发布限制',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('ALLOW_GUEST','false');
  for(const key of ['AUTH_SECRET','DATABASE_URL','REDIS_URL','APPLE_CLIENT_ID'])vi.stubEnv(key,'test-configuration-only');
  await expect(runtime()).rejects.toThrow('Production release blocked');
  vi.stubEnv('ALLOW_GUEST','true');await expect(runtime()).rejects.toThrow('Guest authentication is development-only');
});
it('开发环境的空密钥示例使用随机会话密钥而不导致启动失败',async()=>{
  vi.stubEnv('AUTH_SECRET','');
  const server=await createApp({repo:new LocalRepository(),guestEnabled:true});
  try {expect((await server.fastify.inject({method:'POST',url:'/v1/auth/guest',payload:{}})).statusCode).toBe(200);}
  finally {await server.app.close();}
});
