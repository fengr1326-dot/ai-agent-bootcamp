import 'reflect-metadata';
import { Module, HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import rateLimit from '@fastify/rate-limit';
import { randomBytes } from 'node:crypto';
import { ZodError } from 'zod';
import { routes, openapiDocument } from '../../../packages/contracts/routes';
import { Auth } from './auth';
import { DomainError, LocalRepository, Repository } from './repository';
import { Integrations, Service } from './service';

@Module({})
class AppModule {}
export interface AppOptions { repo?: Repository; secret?: string; guestEnabled?: boolean; integrations?: Integrations; clock?: () => string; logger?: boolean }
export async function createApp(options: AppOptions = {}) {
  const repo=options.repo ?? new LocalRepository(process.env.DATA_DIR ?? '.data/accounts');
  const service=new Service(repo,options.integrations,options.clock);
  const secret=options.secret ?? (process.env.AUTH_SECRET || randomBytes(32).toString('hex'));
  const auth=new Auth(repo,secret,process.env.APPLE_CLIENT_ID);
  const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter({ logger:false, bodyLimit:1024*1024, requestIdHeader:false }),{logger:options.logger?['error','warn','log']:false});
  const fastify=app.getHttpAdapter().getInstance();
  await fastify.register(rateLimit,{max:120,timeWindow:'1 minute',errorResponseBuilder:(request)=>({statusCode:429,code:'RATE_LIMIT',message:'请求过于频繁，请稍后重试',requestId:request.id})});
  app.useGlobalFilters({catch(error:any,host:any) {
    const request=host.switchToHttp().getRequest(),reply=host.switchToHttp().getResponse();
    const candidate=error instanceof HttpException?error.getStatus():error.statusCode;
    const status=candidate>=400&&candidate<=599 ? candidate : 500;
    reply.header('Cache-Control','no-store').header('X-Request-Id',request.id).code(status).send({code:status===429?'RATE_LIMIT':status>=500?'INTERNAL_ERROR':'INVALID_REQUEST',message:status===429?'请求过于频繁，请稍后重试':status>=500?'服务暂时不可用':'请求格式不正确，请检查内容和大小',requestId:request.id});
  }});
  for(const route of routes) {
    fastify.route({method:route.method,url:route.path.replace(/\{(\w+)\}/g,':$1'),
      config: {rateLimit: 'public' in route && route.method==='POST' ? {max:10,timeWindow:'1 minute'} : undefined},
      handler:async (request:any,reply:any)=>{
        reply.header('Cache-Control','no-store'); reply.header('X-Request-Id',request.id);
        try {
          const body='body' in route ? route.body.parse(request.body ?? {}) : undefined;
          let data: unknown;
          if('public' in route) {
            switch(route.operation) {
              case 'health': data={status:'ok',version:'0.1.0',storage:repo instanceof LocalRepository?'local':'postgresql',experimental:true}; break;
              case 'openapi': return reply.send(openapiDocument());
              case 'guest': if(!options.guestEnabled) throw new DomainError(404,'NOT_FOUND','接口不存在'); data=await auth.guest(); break;
              case 'apple': data=await auth.apple((body as any).identityToken,(body as any).nonce); break;
              case 'refresh': data=await auth.refresh((body as any).refreshToken); break;
            }
          } else {
            const user=await auth.identify(request.headers.authorization);
            data=route.method==='GET' ? await service.read(user,route.operation,request.params,request.query) : await service.write(user,route.operation,request.params,body,request.headers['idempotency-key'] ?? '');
          }
          return reply.code(200).send({data,requestId:request.id});
        } catch(e) {
          if(e instanceof ZodError) return reply.code(400).send({code:'VALIDATION_ERROR',message:'请检查输入内容',fields:e.issues.map(i=>({path:i.path.join('.'),message:i.message})),requestId:request.id});
          if(e instanceof DomainError) return reply.code(e.status).send({code:e.code,message:e.message,requestId:request.id});
          // Never log tokens, body, photographs, profile or nutrition values.
          if(options.logger) console.error(JSON.stringify({event:'request_failed',requestId:request.id,operation:route.operation,type:(e as Error).name}));
          return reply.code(500).send({code:'INTERNAL_ERROR',message:'服务暂时不可用，请稍后重试',requestId:request.id});
        }
      }
    });
  }
  await app.init(); await fastify.ready();
  return {app,fastify,service,auth,repo};
}
