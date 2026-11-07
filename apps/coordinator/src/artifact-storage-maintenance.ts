import {config} from './config.js';
import {Store} from './database.js';

// Operator-only entry point. Listing/deletion is never exposed as a worker/API action.
const args=process.argv.slice(2);
if(args[0]!=='--reconcile-once'||args.some(argument=>!['--reconcile-once','--apply'].includes(argument)))throw new Error('Use --reconcile-once for a dry run, or --reconcile-once --apply for bounded orphan cleanup');
if(!process.env.OMNICOMPILE_ARTIFACT_ENDPOINT)throw new Error('Artifact object storage must be explicitly configured');
const store=await Store.connect(config.database);
try{console.log(JSON.stringify(await store.reconcileArtifactStorage({apply:args.includes('--apply')})));}
finally{await store.close();}
