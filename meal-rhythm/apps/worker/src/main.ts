import { Worker } from 'bullmq';
import { runtime } from '../../api/src/runtime';
import { redisConnection } from '../../api/src/integrations';

async function main() {
  if(!process.env.REDIS_URL) throw new Error('REDIS_URL is required for the dedicated worker');
  const deps=await runtime();
  const worker=new Worker('meal-recognition',async job=>{await deps.integrations.process(job.data.user,job.data.job);},{connection:redisConnection(process.env.REDIS_URL),concurrency:3});
  worker.on('failed',job=>console.error(JSON.stringify({event:'recognition_failed',jobId:job?.id})));
  const stop=async()=>{await worker.close();await deps.close();};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  console.log('Meal recognition worker ready');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
