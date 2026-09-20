import { LocalRepository, PostgresRepository } from './repository';
import { ExternalIntegrations } from './integrations';

export async function runtime() {
  if(process.env.NODE_ENV==='production') {
    for(const key of ['AUTH_SECRET','DATABASE_URL','REDIS_URL','APPLE_CLIENT_ID']) if(!process.env[key]) throw new Error(`${key} is required in production`);
    if(process.env.ALLOW_GUEST==='true') throw new Error('Guest authentication is development-only');
    throw new Error('Production release blocked: nutrition catalog and rules require professional validation. See docs/implementation-status.md.');
  }
  const repo=process.env.DATABASE_URL ? new PostgresRepository(new (await import('@prisma/client')).PrismaClient()) : new LocalRepository(process.env.DATA_DIR ?? '.data/accounts');
  const integrations=new ExternalIntegrations(repo);
  return {repo,integrations,close:async()=>{await integrations.close();await repo.close();}};
}
