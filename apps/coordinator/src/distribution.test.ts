import {expect,it} from 'vitest';
import {distributionMetadata,parseDistributionManifest} from './distribution.js';
const valid={platform:'WINDOWS',version:'0.1.1',fileName:'OMNICOMPILE-Setup.exe',sha256:'a'.repeat(64),sizeBytes:123,url:'https://downloads.omnicompile.tools/releases/OMNICOMPILE-Setup.exe'};
it('keeps unpublished packages unavailable without invented links',()=>{expect(distributionMetadata(parseDistributionManifest(undefined))).toEqual({platforms:[{platform:'WINDOWS',available:false,reason:'NOT_PUBLISHED'},{platform:'ANDROID',available:false,reason:'NOT_PUBLISHED'}]});});
it('returns only explicit validated language-free package metadata',()=>{expect(distributionMetadata(parseDistributionManifest(JSON.stringify([valid]))).platforms[0]).toEqual({...valid,available:true});});
it.each([{url:'http://downloads.omnicompile.tools/a.exe'},{url:'https://localhost/a.exe'},{url:'https://downloads.omnicompile.tools/a.exe?token=secret'},{url:'https://u:p@downloads.omnicompile.tools/a.exe'},{sha256:'invalid'},{sizeBytes:0},{fileName:'../secret.exe'},{language:'c'}])('rejects unsafe or misleading distribution metadata %j',change=>{expect(()=>parseDistributionManifest(JSON.stringify([{...valid,...change}]))).toThrow();});
it('rejects duplicate platform entries',()=>expect(()=>parseDistributionManifest(JSON.stringify([valid,valid]))).toThrow());
