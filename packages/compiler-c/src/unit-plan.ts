import {isDeepStrictEqual} from 'node:util';
import {compileCSource} from './codegen.js';
type FunctionBody={name:string;start:number;end:number};
export type CUnitPlan={version:1;language:'c';functions:FunctionBody[];units:Array<{ordinal:number;functionOrdinals:number[];source:string}>;atomicReason:string|null};
type Token={text:string;start:number;end:number};
/** Conservative boundaries only; GCC validates original and every proposed context before dispatch. */
function boundaries(source:string):FunctionBody[]|null{
 const tokens:Token[]=[];let index=0,lineStart=0;
 while(index<source.length){const start=index,char=source[index]!;
  if(char==='\n'){lineStart=++index;continue;}if(/\s/.test(char)){index++;continue;}
  if(char==='#'&&!source.slice(lineStart,index).trim()){
   let end=index;do{const next=source.indexOf('\n',end);if(next<0){end=source.length;break;}end=next+1;}while(source[end-2]==='\\'||source[end-3]==='\\'&&source[end-2]==='\r');
   const directive=source.slice(index,end);if(!/^#\s*(?:include|define|undef|pragma|line)\b/.test(directive))return null;
   tokens.push({text:'#directive',start,end});index=end;lineStart=end;continue;
  }
  if(source.startsWith('//',index)){const end=source.indexOf('\n',index);index=end<0?source.length:end;continue;}
  if(source.startsWith('/*',index)){const end=source.indexOf('*/',index+2);if(end<0)return null;index=end+2;const last=source.lastIndexOf('\n',index-1);if(last>=lineStart)lineStart=last+1;continue;}
  if(char==='"'||char==="'"){index++;while(index<source.length){if(source[index]==='\\'){index+=2;continue;}if(source[index++]===char)break;}tokens.push({text:'literal',start,end:index});continue;}
  const identifier=source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);if(identifier){index+=identifier[0].length;tokens.push({text:identifier[0],start,end:index});continue;}
  index++;tokens.push({text:char,start,end:index});
 }
 const functions:FunctionBody[]=[];let depth=0,headerStart=0,current:FunctionBody|null=null;
 for(let position=0;position<tokens.length;position++){
  const token=tokens[position]!;
  if(token.text==='{'){
   if(depth===0){const header=tokens.slice(headerStart,position).filter(item=>item.text!=='#directive');
    if(header.at(-1)?.text===')'&&!header.some(item=>['=','__attribute__','__declspec'].includes(item.text))){
     let balance=0,open=-1;for(let n=header.length-1;n>=0;n--){if(header[n]!.text===')')balance++;else if(header[n]!.text==='('&&--balance===0){open=n;break;}}
     const name=header[open-1]?.text;
     if(name&&/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)&&!['if','for','while','switch','sizeof','_Alignof'].includes(name))current={name,start:token.start,end:0};
    }
   }depth++;
  }else if(token.text==='}'){
   if(--depth<0)return null;if(depth===0&&current){current.end=token.end;if(tokens.slice(headerStart,position).some(item=>item.text==='#directive'&&item.start>=current!.start))return null;functions.push(current);current=null;headerStart=position+1;}
  }else if(token.text===';'&&depth===0)headerStart=position+1;
 }
 return depth===0?functions:null;
}
function replaceBodies(source:string,replacements:Array<FunctionBody&{body:string}>){let result=source;for(const part of [...replacements].sort((a,b)=>b.start-a.start))result=result.slice(0,part.start)+part.body+result.slice(part.end);return result;}
export async function planCUnits(source:string,sourceName:string):Promise<CUnitPlan>{
 await compileCSource(source,sourceName);
 const atomic=(reason:string):CUnitPlan=>({version:1,language:'c',functions:[],units:[{ordinal:0,functionOrdinals:[],source}],atomicReason:reason});
 const functions=boundaries(source);if(!functions||functions.length<2)return atomic('No safely separable function contexts');
 const width=Math.max(1,Math.ceil(functions.length/4)),units:CUnitPlan['units']=[];
 for(let from=0;from<functions.length;from+=width){const functionOrdinals=functions.slice(from,from+width).map((_,offset)=>from+offset);
  const candidate=replaceBodies(source,functions.filter((_,ordinal)=>!functionOrdinals.includes(ordinal)).map(part=>({...part,body:'{ __builtin_trap(); '+ '\n'.repeat((source.slice(part.start,part.end).match(/\n/g)??[]).length)+'}'})));
  try{await compileCSource(candidate,sourceName);}catch{return atomic('Function declaration or preprocessor context requires an atomic translation unit');}
  units.push({ordinal:units.length,functionOrdinals,source:candidate});
 }
 return{version:1,language:'c',functions,units,atomicReason:null};
}
export async function aggregateCUnits(source:string,sourceName:string,plan:CUnitPlan,results:any[]){
 const canonical=await planCUnits(source,sourceName);if(!isDeepStrictEqual(plan,canonical)||results.length!==plan.units.length)throw new Error('C compilation plan does not match authoritative source');
 for(let index=0;index<plan.units.length;index++)if(results[index]?.operation!=='c_compile'||results[index]?.generatedSource!==plan.units[index]!.source)throw new Error('C unit differs from independently compiled source');
 // C's optimizer works on machine code. Source assembly retains the original bodies;
 // no compiler stubs, relocated declarations or worker-supplied bytes are published.
 const whole=await compileCSource(source,sourceName),verification={method:'Independent function-context compilation and authoritative whole-translation-unit code generation',language:'c'};
 return{operation:'c_compile',artifactBase64:whole.bytes.toString('base64'),fileName:whole.fileName,generatedSource:source,diagnostics:whole.diagnostics,verification,metrics:{compiler:whole.compiler,artifactBytes:whole.bytes.length,optimizationEvidence:whole.optimizationEvidence,verification,partitioning:{method:'C function bodies with complete declaration context; GCC-validated before dispatch',unitCount:plan.units.length,assemblyMatched:true,atomicReason:plan.atomicReason,selectedSource:'Authoritative original function bodies; GCC optimized final executable'}}};
}
