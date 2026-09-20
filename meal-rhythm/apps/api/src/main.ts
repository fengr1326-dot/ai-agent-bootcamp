import { createApp } from './app';
import { runtime } from './runtime';

async function main() {
  const dependencies=await runtime();
  const {app}=await createApp({repo:dependencies.repo,integrations:dependencies.integrations,guestEnabled:process.env.ALLOW_GUEST==='true',logger:true});
  await app.listen(Number(process.env.PORT ?? 3000),process.env.HOST ?? '127.0.0.1');
  console.log(`Meal Rhythm API listening at ${await app.getUrl()}`);
  const close=async()=>{await app.close();await dependencies.close();};
  process.once('SIGINT',()=>void close()); process.once('SIGTERM',()=>void close());
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
