import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function retireNetworkSchedulingPolicyMigration(){return{
  id:'0025_retire_network_scheduling_policy',
  definition:readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n'),
  async run(connection){
    await connection.query("UPDATE distributed_networks SET configuration_json=JSON_REMOVE(configuration_json,'$.policy') WHERE JSON_CONTAINS_PATH(configuration_json,'one','$.policy')");
  }
};}
