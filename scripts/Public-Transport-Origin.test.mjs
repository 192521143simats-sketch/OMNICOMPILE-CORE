import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicTransportOrigin} from './Public-Transport-Origin.mjs';
test('accepts supported operator-provided HTTPS origins',()=>{
 assert.equal(publicTransportOrigin('https://known.ngrok-free.app'),'https://known.ngrok-free.app');
 assert.equal(publicTransportOrigin('https://known.trycloudflare.com/'),'https://known.trycloudflare.com');
 assert.equal(publicTransportOrigin('https://omnicompile-server.tail4c8dab.ts.net/'),'https://omnicompile-server.tail4c8dab.ts.net');
 assert.throws(()=>publicTransportOrigin('https://other.tail4c8dab.ts.net'));
 assert.throws(()=>publicTransportOrigin('https://omnicompile-server.tail4c8dab.ts.net.evil.com'));
});
test('rejects credential forwarding to arbitrary hosts, paths or cleartext',()=>{
 for(const value of ['http://known.trycloudflare.com','https://known.trycloudflare.com.evil.test','https://localhost','https://known.trycloudflare.com/api','https://user:secret@known.trycloudflare.com','https://known.trycloudflare.com:444','https://known.trycloudflare.com?token=private'])assert.throws(()=>publicTransportOrigin(value));
});
