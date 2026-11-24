import {isDeepStrictEqual} from 'node:util';
import {spawn} from 'node:child_process';
import {PythonFrontendError,compilePython} from './pipeline.js';

export type PythonUnitPlan={version:1;language:'python';prefix:string;units:Array<{ordinal:number;name:string;source:string;originalStartLine:number;prefixLines:number;contextNodes:number}>};
// Parse and validate only. Submitted modules, imports, decorators and class bodies are never executed.
const planner=String.raw`
import ast,json,sys
r=json.loads(sys.stdin.read());source=r['source'];filename=r['filename']
try:
 tree=ast.parse(source,filename=filename);compile(tree,filename,'exec',dont_inherit=True)
 nodes=list(tree.body);prefix_nodes=[]
 if nodes and isinstance(nodes[0],ast.Expr) and isinstance(nodes[0].value,ast.Constant) and type(nodes[0].value.value) is str:prefix_nodes.append(nodes.pop(0))
 while nodes and isinstance(nodes[0],ast.ImportFrom) and nodes[0].module=='__future__':prefix_nodes.append(nodes.pop(0))
 prefix=ast.unparse(ast.Module(body=prefix_nodes,type_ignores=[])) if prefix_nodes else ''
 def first(node):return min([node.lineno]+[item.lineno for item in getattr(node,'decorator_list',[])])
 groups=[]
 for node in nodes:
  if groups and first(node)<=groups[-1][-1].end_lineno:groups[-1].append(node)
  else:groups.append([node])
 # Keep semicolon-separated declarations, multiline statements and lexical scopes atomic.
 overlap=bool(prefix_nodes and nodes and prefix_nodes[-1].end_lineno>=first(nodes[0]))
 if overlap or len(prefix.encode())>16384 or len(groups)<2:
  units=[{'ordinal':0,'name':'module','source':source,'originalStartLine':1,'prefixLines':0,'contextNodes':0}];prefix=''
 else:
  width=max(1,(len(groups)+31)//32);chunks=[sum(groups[i:i+width],[]) for i in range(0,len(groups),width)]
  lines=source.splitlines(keepends=True);units=[]
  for ordinal,chunk in enumerate(chunks):
   start=first(chunk[0]);end=chunk[-1].end_lineno;body=''.join(lines[start-1:end])
   text=(prefix+'\n\n' if prefix else '')+'pass\n'+body
   units.append({'ordinal':ordinal,'name':','.join(getattr(node,'name',type(node).__name__) for node in chunk)[:300],'source':text,'originalStartLine':start,'prefixLines':len(prefix.splitlines())+2 if prefix else 1,'contextNodes':len(prefix_nodes)+1})
  if any(len(unit['source'].encode())>1000000 for unit in units) or sum(len(unit['source'].encode()) for unit in units)>4000000:
   units=[{'ordinal':0,'name':'module','source':source,'originalStartLine':1,'prefixLines':0,'contextNodes':0}];prefix=''
 print(json.dumps({'ok':True,'plan':{'version':1,'language':'python','prefix':prefix,'units':units}}))
except SyntaxError as e:
 print(json.dumps({'ok':False,'diagnostics':[{'severity':'error','code':'PY_SYNTAX','message':e.msg,'line':e.lineno,'column':e.offset}]}))
except Exception:
 print(json.dumps({'ok':False,'diagnostics':[{'severity':'error','code':'PY_PLAN_LIMIT','message':'Python source planning exceeded its supported resource limits','line':None,'column':None}]}))
`;
export async function planPythonUnits(source:string,filename:string,executable=process.env.PYTHON_EXECUTABLE??'python'):Promise<PythonUnitPlan>{
 if(Buffer.byteLength(source)>1_000_000)throw new Error('Python source exceeds 1 MB');
 const response=await runPlanner(executable,planner,{source,filename});
 if(!response.ok)throw new PythonFrontendError(response.diagnostics);
 return response.plan as PythonUnitPlan;
}
async function runPlanner(executable:string,script:string,input:unknown){return new Promise<any>((resolve,reject)=>{
  const child=spawn(executable,['-I','-S','-c',script],{windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks:Buffer[]=[];let size=0,settled=false;
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('Python planner response is invalid'));}};
  const timer=setTimeout(()=>{child.kill();finish(new Error('Python planner exceeded 30 seconds'));},30000);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>8_000_000){child.kill();finish(new Error('Python plan exceeds 8 MB'));}else chunks.push(chunk);});
  child.stderr.resume();child.on('error',finish);child.on('close',code=>finish(code===0?undefined:new Error('Python planner unavailable')));
  child.stdin.end(JSON.stringify(input));
 });}


const assembler=String.raw`
import ast,json,sys
r=json.loads(sys.stdin.read());nodes=[]
for i,part in enumerate(r['parts']):
 tree=ast.parse(part['source'],type_comments=True)
 if i==0 and part['contextNodes']:
  nodes.extend(tree.body[:part['contextNodes']-1])
 nodes.extend(tree.body[part['contextNodes']:])
print(json.dumps({'source':ast.unparse(ast.Module(body=nodes,type_ignores=[]))+'\n'}))
`;
/** Verify every compiled unit, then link declarations in original order; never execute user code here. */
export async function aggregatePythonUnits(source:string,sourceName:string,plan:PythonUnitPlan,results:any[],executable=process.env.PYTHON_EXECUTABLE??'python'){
 const canonical=await planPythonUnits(source,sourceName,executable);
 if(!isDeepStrictEqual(canonical,plan)||results.length!==plan.units.length)throw new Error('Python compilation plan does not match authoritative source');
 const parts=[];
 for(let index=0;index<plan.units.length;index++){
  const unit=plan.units[index]!,result=results[index];
  const verified=await compilePython(unit.source,executable,sourceName);
  if(result?.operation!=='python_compile'||typeof result.generatedSource!=='string')throw new Error('Python unit differs from independently compiled source');
  if(result.generatedSource!==verified.optimizedSource){const normalized=await compilePython(result.generatedSource,executable,sourceName);if(normalized.optimizedSource!==verified.optimizedSource)throw new Error('Python unit differs from independently compiled source');}
  parts.push({source:verified.optimizedSource,contextNodes:unit.contextNodes});
 }
 const assembled=await runPlanner(executable,assembler,{parts});
 const whole=await compilePython(source,executable,sourceName);
 let matched=false;
 try{matched=(await compilePython(assembled.source,executable,sourceName)).optimizedSource===whole.optimizedSource;}catch{/* Preserve whole-module binding semantics when an independently valid unit cannot be linked. */}
 const verification={method:'Independent per-unit compilation and ordered whole-module validation',language:'python'};
 return{operation:'python_compile',artifactBase64:whole.bytecode.toString('base64'),fileName:whole.artifactName,generatedSource:whole.optimizedSource,diagnostics:whole.diagnostics,optimizations:whole.optimizations,verification,metrics:{pythonVersion:whole.pythonVersion,...whole.metrics,verification,partitioning:{method:'CPython top-level lexical units; dependency order preserved during linking',unitCount:plan.units.length,assemblyMatched:matched,selectedSource:matched?'Verified ordered unit assembly':'Authoritative whole-module source (unit assembly mismatch)'}}};
}
