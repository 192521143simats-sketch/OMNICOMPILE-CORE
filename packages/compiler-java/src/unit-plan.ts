import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {compileJava,command,javaRuntimePath} from './pipeline.js';

type Method={start:number;end:number;name:string};
export type JavaUnitPlan={version:1;language:'java';methods:Method[];units:Array<{ordinal:number;methodOrdinals:number[];source:string}>};
const parser=String.raw`
import java.nio.file.*;
import java.util.*;
import javax.tools.*;
import com.sun.source.tree.*;
import com.sun.source.util.*;
class OmniMethodUnits {
 public static void main(String[] args)throws Exception {
  String source=Files.readString(Path.of(java.net.URI.create(args[0])));
  JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();
  try(StandardJavaFileManager fm=compiler.getStandardFileManager(null,null,null)) {
   JavaFileObject file=new SimpleJavaFileObject(java.net.URI.create("string:///Main.java"),JavaFileObject.Kind.SOURCE){public CharSequence getCharContent(boolean ignored){return source;}};
   DiagnosticCollector<JavaFileObject> diagnostics=new DiagnosticCollector<>();
   JavacTask task=(JavacTask)compiler.getTask(null,fm,diagnostics,List.of("-proc:none"),null,List.of(file));
   List<CompilationUnitTree> roots=new ArrayList<>();for(CompilationUnitTree root:task.parse())roots.add(root);
   for(Diagnostic<?> d:diagnostics.getDiagnostics())if(d.getKind()==Diagnostic.Kind.ERROR)throw new IllegalArgumentException("Java source parse failed");
   Trees trees=Trees.instance(task);SourcePositions positions=trees.getSourcePositions();
   List<String> lines=new ArrayList<>();
   for(CompilationUnitTree root:roots)new TreeScanner<Void,Void>() {
    public Void visitMethod(MethodTree method,Void ignored) {
     if(method.getReturnType()!=null && method.getBody()!=null) {
      long start=positions.getStartPosition(root,method.getBody()),end=positions.getEndPosition(root,method.getBody());
      if(start<0||end<=start||end>source.length())throw new IllegalArgumentException("Invalid method bounds");
      lines.add(start+","+end+","+method.getName().toString());
     }
     // Local/anonymous classes inside a method stay in its atomic lexical scope.
     return null;
    }
   }.scan(root,null);
   System.out.print(String.join("\n",lines));
  }
 }
}
`;
async function methodRanges(source:string):Promise<Method[]>{
 const workspace=await mkdtemp(join(tmpdir(),'omnicompile-java-plan-'));
 try{
  const input=join(workspace,'source.txt'),helper=join(workspace,'OmniMethodUnits.java');await writeFile(input,source);await writeFile(helper,parser);
  const output=await command(await javaRuntimePath(),['-Xmx256m','-Dfile.encoding=UTF-8',helper,pathToFileURL(input).href]);
  if(output.code!==0)throw new Error('Java declaration planning failed');
  return output.stdout.trim()?output.stdout.trim().split(/\r?\n/).map(line=>{const [start,end,...name]=line.split(',');return {start:Number(start),end:Number(end),name:name.join(',')};}).sort((a,b)=>a.start-b.start):[];
 }finally{await rm(workspace,{recursive:true,force:true});}
}
function replaceBodies(source:string,replacements:Array<Method&{body:string}>){let result=source;for(const item of [...replacements].sort((a,b)=>b.start-a.start))result=result.slice(0,item.start)+item.body+result.slice(item.end);return result;}
export async function planJavaUnits(source:string,sourceName:string):Promise<JavaUnitPlan>{return buildJavaPlan(source,sourceName,true);}
async function buildJavaPlan(source:string,sourceName:string,validate:boolean):Promise<JavaUnitPlan>{
 // Parse only when the module stays atomic; its assigned worker performs real compilation.
 // Before masking multiple bodies, validate every original body. Never run user code.
 let methods:Method[];
 try{methods=await methodRanges(source);}catch(error){await compileJava(source,sourceName);throw error;}
 if(methods.length<2||methods.some((item,index)=>index>0&&item.start<methods[index-1]!.end))return{version:1,language:'java',methods:[],units:[{ordinal:0,methodOrdinals:[],source}]};
 if(validate)await compileJava(source,sourceName);
 const width=Math.max(1,Math.ceil(methods.length/4)),units:JavaUnitPlan['units']=[];
 for(let from=0;from<methods.length;from+=width){const selected=methods.slice(from,from+width),methodOrdinals=selected.map((_,offset)=>from+offset);units.push({ordinal:units.length,methodOrdinals,source:replaceBodies(source,methods.filter((_,index)=>!methodOrdinals.includes(index)).map(item=>({...item,body:'{ throw null; }'})))});}
 if(units.reduce((sum,unit)=>sum+Buffer.byteLength(unit.source),0)>8_000_000)throw new Error('Java compilation plan exceeds 8 MB');
 return{version:1,language:'java',methods,units};
}
export async function aggregateJavaUnits(source:string,sourceName:string,plan:JavaUnitPlan,results:any[]){
 const canonical=await buildJavaPlan(source,sourceName,false);
 if(!isDeepStrictEqual(plan,canonical)||results.length!==plan.units.length)throw new Error('Java compilation plan does not match authoritative source');
 const replacements:Array<Method&{body:string}>=[];let contextMatched=true;
 for(let index=0;index<plan.units.length;index++){
  const unit=plan.units[index]!,result=results[index],verified=await compileJava(unit.source,sourceName);
  if(result?.operation!=='java_compile'||typeof result.generatedSource!=='string')throw new Error('Java unit differs from independently compiled source');
  if(result.generatedSource!==verified.generatedSource&&(await compileJava(result.generatedSource,sourceName)).generatedSource!==verified.generatedSource)throw new Error('Java unit differs from independently compiled source');
  if(plan.methods.length){const ranges=await methodRanges(verified.generatedSource);if(ranges.length!==plan.methods.length){contextMatched=false;continue;}
   for(const ordinal of unit.methodOrdinals){const original=plan.methods[ordinal]!,compiled=ranges[ordinal]!;if(compiled.name!==original.name){contextMatched=false;continue;}replacements.push({...original,body:verified.generatedSource.slice(compiled.start,compiled.end)});}
  }
 }
 const whole=await compileJava(source,sourceName);let matched=!plan.methods.length;
 if(plan.methods.length&&contextMatched&&replacements.length===plan.methods.length){try{matched=(await compileJava(replaceBodies(source,replacements),sourceName)).generatedSource===whole.generatedSource;}catch{/* Publish only independently validated whole-program semantics. */}}
 const verification={method:'Independent method-unit compilation with complete declaration context and whole-program validation',language:'java'};
 return{operation:'java_compile',artifactBase64:whole.jar.bytes.toString('base64'),fileName:whole.jar.fileName,generatedSource:whole.generatedSource,runnableJar:whole.jar.runnable,classes:Object.entries(whole.classes).map(([fileName,bytes])=>({fileName,contentBase64:bytes.toString('base64')})),diagnostics:whole.diagnostics,verification,metrics:{jdkVersion:whole.jdkVersion,...whole.metrics,verification,partitioning:{method:'Java method bodies with shared declaration/type context; constructors and initializers preserved',unitCount:plan.units.length,assemblyMatched:matched,selectedSource:matched?'Verified method-unit assembly':'Authoritative whole-program source (unit assembly mismatch)'}}};
}
