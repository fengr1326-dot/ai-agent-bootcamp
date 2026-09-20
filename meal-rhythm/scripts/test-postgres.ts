import { mkdtemp,mkdir,realpath,rm } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { assertTestClusterPath,freeLoopbackPort } from './temporary-postgres';

type Cluster={initialise():Promise<void>;start():Promise<void>;stop():Promise<void>;createDatabase(name:string):Promise<void>};
async function run(script:string,args:string[],env:NodeJS.ProcessEnv) {
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,[script,...args],{stdio:'inherit',windowsHide:true,env});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Test command exited with status ${code}`)));
  });
}
async function main() {
  // Dynamic package import works with its ESM-only package and our CJS service build.
  const name:string='embedded-postgres';
  const {default:EmbeddedPostgres}=await import(name) as {default:new(options:Record<string,unknown>)=>Cluster};
  const root=resolve('.data','test-clusters');await mkdir(root,{recursive:true});
  const directory=await mkdtemp(join(root,'pg-test-'));assertTestClusterPath(root,directory);
  const port=await freeLoopbackPort(),password=randomBytes(24).toString('hex');
  const cluster=new EmbeddedPostgres({databaseDir:directory,port,user:'meal_test',password,authMethod:'scram-sha-256',persistent:true,createPostgresUser:false,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
  let started=false;
  try {
    console.log('Starting an isolated PostgreSQL 17 test cluster on loopback.');
    await cluster.initialise();await cluster.start();started=true;await cluster.createDatabase('mealrhythm_test');
    const url=`postgresql://meal_test:${password}@127.0.0.1:${port}/mealrhythm_test`;
    const env={...process.env,DATABASE_URL:url,TEST_DATABASE_URL:url,TEST_REDIS_URL:''};
    await run(resolve('node_modules/prisma/build/index.js'),['migrate','deploy'],env);
    if(process.argv.includes('--self-test-failure'))throw new Error('Intentional failure: verifying the runner returns a non-zero exit code');
    await run(resolve('node_modules/vitest/vitest.mjs'),['run','tests/infrastructure.test.ts','tests/postgres-api.test.ts'],env);
    console.log('Real PostgreSQL migration and integration checks passed. Redis was not exercised.');
  } finally {
    // The library only stops its own child process. It does not remove data with persistent:true.
    if(started)await cluster.stop();
    const canonicalRoot=await realpath(root),canonicalDirectory=await realpath(directory);
    assertTestClusterPath(canonicalRoot,canonicalDirectory);
    await rm(canonicalDirectory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    console.log('Removed only this run’s temporary database cluster; no user data was touched.');
  }
}
// The dependency installs a beforeExit hook that otherwise resets exitCode to zero.
// main() has already awaited cleanup before explicit failure termination here.
void main().catch(error=>{console.error(error instanceof Error?error.message:'PostgreSQL test failed');process.exit(1);});
