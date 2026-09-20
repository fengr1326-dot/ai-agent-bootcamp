import { basename,dirname,resolve } from 'node:path';
import { createServer } from 'node:net';

/** Only directories created directly under this project's test root may be removed. */
export function assertTestClusterPath(root:string,directory:string):string {
  const canonical=resolve(directory),parent=resolve(root);
  if(dirname(canonical)!==parent || !/^pg-test-[a-zA-Z0-9]+$/.test(basename(canonical)))throw new Error('Refusing cleanup outside the isolated PostgreSQL test directory');
  return canonical;
}
export async function freeLoopbackPort():Promise<number> {
  const server=createServer();
  return new Promise((resolve,reject)=>{
    server.once('error',reject);server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string'){server.close();reject(new Error('Unable to allocate test port'));return;}
      server.close(error=>error?reject(error):resolve(address.port));
    });
  });
}
