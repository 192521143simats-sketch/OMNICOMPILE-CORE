import {readFileSync} from 'node:fs';
import {createDockerExecutor} from '../apps/coordinator/src/docker-executor.ts';
import {assertIsolatedTarget} from './Integration-Target.mjs';
const target=assertIsolatedTarget();
const port=Number(process.env.OMNICOMPILE_TEST_BROKER_PORT);
if(!Number.isInteger(port)||port<1024||[4100,4102,5173,3307].includes(port))throw new Error('Owned random broker port required');
const app=createDockerExecutor(readFileSync(process.env.OMNICOMPILE_EXECUTOR_TOKEN_FILE,'utf8').trim(),undefined,{instance:target.instance});
await app.listen({host:'127.0.0.1',port});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close());
