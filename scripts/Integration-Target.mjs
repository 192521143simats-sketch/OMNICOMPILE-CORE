export function assertIsolatedTarget(env=process.env) {
  const base=env.OMNICOMPILE_TEST_BASE,instance=env.OMNICOMPILE_TEST_INSTANCE,database=env.DB_NAME;
  if(!base || !/^[a-f0-9]{16}$/.test(instance??'') || database!==`omnicompile_test_${instance}`) throw new Error('Integration verification requires an isolated test database and instance. Use npm run verify:integration.');
  const url=new URL(base);
  if(url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname) || !url.port || ['4100','5173'].includes(url.port) || url.pathname!=='/' || url.search || url.hash || url.username || url.password) throw new Error('Integration verification requires an isolated loopback coordinator port.');
  return {base:url.origin,instance,database};
}

export async function verifyIsolatedCoordinator(target,request=fetch) {
  const response=await request(`${target.base}/ready`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok) throw new Error('Isolated coordinator is not ready.');
  const value=await response.json();
  if(value.status!=='ready' || value.testInstance!==target.instance) throw new Error('Isolated coordinator identity mismatch; refusing integration writes.');
}
