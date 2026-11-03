import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {delimiter,join} from "node:path";
import {spawn} from "node:child_process";
import {pathToFileURL} from "node:url";
export type JavaDiagnostic={severity:"error"|"warning";message:string;line?:number|null;column?:number|null;code?:string};
export type JavaCompilation={language:"java";representation:"JVM bytecode";jdkVersion:string;primaryClass:string;bytecodeIR:string;generatedSource:string;sourceName:string;classes:Record<string,Buffer>;jar:{fileName:string;bytes:Buffer;runnable:boolean;mainClass?:string};diagnostics:JavaDiagnostic[];metrics:{classCount:number;classBytes:number;jarBytes:number}};
export class JavaFrontendError extends Error{constructor(readonly diagnostics:JavaDiagnostic[]){super(diagnostics.map(d=>`${d.severity}: ${d.message}`).join("\n"));this.name="JavaFrontendError";}}
export async function compileJava(source:string, sourceName?:string):Promise<JavaCompilation>{
 const fail=(message:string):never=>{throw new JavaFrontendError([{severity:"error",message}]);};
 if(Buffer.byteLength(source,"utf8")>1_000_000)fail("Java source exceeds 1 MB");
 if(!source.trim())fail("Java source is empty");
 const declaration=sourceDeclaration(source);
 sourceName??=`${declaration.name??"Main"}.java`;
 if(!/^(?:[\p{L}\p{N}\p{M}\p{Pc}\p{Sc}_$-]+\/)*[\p{L}\p{N}\p{M}\p{Pc}\p{Sc}_$-]+\.java$/iu.test(sourceName))fail("Invalid Java source filename");
 const internalSourceName=sourceName.slice(0,-5)+".java";
 const primaryClass=[declaration.packageName,declaration.name??sourceName.split("/").at(-1)!.slice(0,-5)].filter(Boolean).join(".");
 const jdk=await locateJdk(),workspace=await mkdtemp(join(tmpdir(),"omnicompile-java-")),classesDir=join(workspace,"classes"),sourceDir=join(workspace,"source"),sourcePath=join(sourceDir,...internalSourceName.split("/")),jarPath=join(workspace,"output.jar");
 const deadline=Date.now()+30_000;let invocation=0;
 const localeArgs=["-J-Dfile.encoding=UTF-8","-J-Dstdout.encoding=UTF-8","-J-Dstderr.encoding=UTF-8","-J-Duser.language=en","-J-Duser.country=US"];
 const run=async(executable:string,args:string[])=>{
  try{
   if(executable===jdk.javap)return await command(executable,[...localeArgs,...args],Math.max(1,deadline-Date.now()));
   const argFile=join(workspace,`tool-${invocation++}.args`);
   const launcherArgs=args.filter(arg=>arg.startsWith("-J")),toolArgs=args.filter(arg=>!arg.startsWith("-J"));
   await writeFile(argFile,toolArgs.map(arg=>JSON.stringify(arg)).join("\n"),"utf8");
   return await command(executable,[...localeArgs,...launcherArgs,`@${argFile}`],Math.max(1,deadline-Date.now()));
  }
  catch(error){
   if(error&&typeof error==="object"&&"code" in error)return fail(error.code==="ENOENT"?"A required Java toolchain executable is unavailable":"Java toolchain could not be started");
   return fail(error instanceof Error?error.message:"Java toolchain failed");
  }
 };
 try{
  await mkdir(classesDir);await mkdir(join(sourcePath,".."),{recursive:true});await writeFile(sourcePath,source,"utf8");
  const compiled=await run(jdk.javac,["-J-Xmx256m","-proc:none","-encoding","UTF-8","-g:none","-Xlint:all","-classpath",classesDir,"-sourcepath",sourceDir,"-d",classesDir,sourcePath]);
  const diagnostics=parseDiagnostics(compiled.stderr||compiled.stdout,workspace);
  if(compiled.code!==0)throw new JavaFrontendError(diagnostics.length?diagnostics:[{severity:"error",message:"Java compilation failed"}]);
  const files=(await readdir(classesDir,{recursive:true})).map(String).filter(name=>name.endsWith(".class")).sort();
  const classes:Record<string,Buffer>={},signatures=new Map<string,string>();let classBytes=0;
  if(files.length>256)fail("Java compilation exceeds 256 classes");
  for(const name of files){const bytes=await readFile(join(classesDir,name));classBytes+=bytes.length;if(classBytes>8_000_000)fail("Java class output exceeds 8 MB");classes[name.replaceAll("\\","/")]=bytes;}
  const names=Object.keys(classes).map(name=>name.slice(0,-6).replaceAll("/","."));
  const inspected=await run(jdk.javap,["-classpath",classesDir,"-c","-p","-s",...Object.keys(classes).map(name=>pathToFileURL(join(classesDir,name)).href)]);
  if(inspected.code!==0)fail("Java bytecode inspection failed");
  // Each javap header marks a compiled class. Method descriptors are authoritative,
  // including varargs; source text and comments cannot create an entry point.
  const blocks=inspected.stdout.split(/(?=^(?:public |protected |private |abstract |final |static )*(?:class|interface|enum) )/m);
  for(const block of blocks){const header=block.match(/^(?:public |protected |private |abstract |final |static )*(?:class|interface|enum) ([^\s<{]+)(?:<[^\n]+?>)?(?: extends ([^\s<{]+))?/m);if(header)signatures.set(header[1]!,block);}
  const hasMain=(name:string,seen=new Set<string>()):boolean=>{
   if(seen.has(name))return false;seen.add(name);const block=signatures.get(name);if(!block)return false;
   if(/^\s*public static (?:final |synchronized |strictfp )*void main\([^\n]*\);\r?\n\s*descriptor: \(\[Ljava\/lang\/String;\)V/m.test(block))return true;
   const parent=block.match(/\bclass [^\n]+? extends ([^\s<{]+)/)?.[1];return parent?hasMain(parent,seen):false;
  };
  const mainClass=[primaryClass,...names.filter(name=>name!==primaryClass)].find(name=>hasMain(name));
  const packed=await run(jdk.jar,["--create","--file",jarPath,...(mainClass?["--main-class",mainClass]:[]),"-C",classesDir,"."]);
  if(packed.code!==0)fail("Java JAR packaging failed");
  const jarBytes=await readFile(jarPath);if(jarBytes.length>8_000_000)fail("Java JAR output exceeds 8 MB");
  const version=await run(jdk.javac,["-version"]);
  return{language:"java",representation:"JVM bytecode",jdkVersion:(version.stderr||version.stdout).trim(),primaryClass,bytecodeIR:inspected.stdout,generatedSource:source,sourceName,classes,jar:{fileName:`${primaryClass.split(".").at(-1)}.jar`,bytes:jarBytes,runnable:!!mainClass,...(mainClass?{mainClass}:{})},diagnostics,metrics:{classCount:files.length,classBytes,jarBytes:jarBytes.length}};
 }finally{await rm(workspace,{recursive:true,force:true});}
}

function parseDiagnostics(output:string,workspace:string):JavaDiagnostic[]{
 const clean=output.replaceAll(workspace,"<source>").replaceAll(workspace.replaceAll("\\","/"),"<source>");
 const lines=clean.split(/\r?\n/),diagnostics:JavaDiagnostic[]=[];
 let current:JavaDiagnostic|undefined;
 for(const line of lines){
  const located=line.match(/^.*?\.java:(\d+): (error|warning): (.*)$/);
  const global=line.match(/^(error|warning): (.*)$/);
  if(located||global){
   const severity=(located?.[2]??global?.[1]) as "error"|"warning";
   current={severity,message:located?.[3]??global?.[2]??"Java compiler diagnostic",code:severity==="error"?"JAVA_COMPILER_ERROR":"JAVA_COMPILER_WARNING",...(located?{line:Number(located[1])}:{})};
   diagnostics.push(current);continue;
  }
  if(!current)continue;
  if(/^\s*\^\s*$/.test(line)&&current.line!==undefined){current.column=line.indexOf("^")+1;continue;}
  if(/^\s*(?:symbol|location|required|found|reason):/.test(line))current.message+="\n"+line.trim();
 }
 return diagnostics;
}

function sourceDeclaration(source:string):{name:string|undefined;packageName:string|undefined}{
 // Java translates Unicode escapes before tokenization. Strip literals/comments
 // after translation, preserving delimiters for top-level declaration tracking.
 const translated=source.replace(/\\u+([0-9a-fA-F]{4})/g,(_,hex:string)=>String.fromCharCode(parseInt(hex,16)));
 const tokens=translated.match(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"""[\s\S]*?"""|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[\p{L}\p{Pc}\p{Sc}_$][\p{L}\p{N}\p{M}\p{Pc}\p{Sc}\p{Cf}_$]*|[^\s]/gu)??[];
 let depth=0,parenDepth=0,isPublic=false,packageName:string|undefined;const types:{name:string;public:boolean}[]=[];
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i]!;if(token.startsWith("//")||token.startsWith("/*")||token.startsWith('"')||token.startsWith("'"))continue;
  if(token==="("){parenDepth++;continue;}if(token===")"){parenDepth--;continue;}
  if(token==="{"){depth++;continue;}if(token==="}"){depth--;if(depth===0&&parenDepth===0)isPublic=false;continue;}if(depth!==0||parenDepth!==0)continue;
  if(token===";"){isPublic=false;continue;}if(token==="public")isPublic=true;
  if(token==="package"){const parts:string[]=[];while(tokens[++i]&&tokens[i]!==";")parts.push(tokens[i]!);packageName=parts.join("");isPublic=false;}
  if(["class","record","enum","interface"].includes(token)&&tokens[i-1]!=="."){const name=tokens[i+1];if(name&&/^[\p{L}\p{Pc}\p{Sc}_$][\p{L}\p{N}\p{M}\p{Pc}\p{Sc}\p{Cf}_$]*$/u.test(name))types.push({name,public:isPublic});}
 }
 return{name:(types.find(type=>type.public)??types[0])?.name,packageName};
}
async function locateJdk(){const homes=[process.env.OMNICOMPILE_JDK_HOME,process.env.JAVA_HOME,"C:\\Program Files\\Java\\jdk-21.0.12.1"].filter(Boolean) as string[];if(process.platform==="win32"&&existsSync("C:\\Program Files\\Java")){for(const name of await readdir("C:\\Program Files\\Java"))if(name.startsWith("jdk-"))homes.push(join("C:\\Program Files\\Java",name));}for(const home of homes){const suffix=process.platform==="win32"?".exe":"",bin=join(home,"bin"),javac=join(bin,`javac${suffix}`);if(existsSync(javac))return{javac,javap:join(bin,`javap${suffix}`),jar:join(bin,`jar${suffix}`),java:join(bin,`java${suffix}`)};}const pathDirs=(process.env.PATH??"").split(delimiter);for(const bin of pathDirs){const suffix=process.platform==="win32"?".exe":"",javac=join(bin,`javac${suffix}`);if(existsSync(javac))return{javac,javap:join(bin,`javap${suffix}`),jar:join(bin,`jar${suffix}`),java:join(bin,`java${suffix}`)};}throw new Error("JDK compiler not found. Set OMNICOMPILE_JDK_HOME or JAVA_HOME to a JDK 21 installation.");}
export async function javaRuntimePath(){return(await locateJdk()).java;}
function command(executable:string,args:string[],timeout=30_000){return new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true}),stdout:Buffer[]=[],stderr:Buffer[]=[];let settled=false,outputBytes=0;const finish=(error?:Error,code=-1)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve({code,stdout:Buffer.concat(stdout).toString("utf8"),stderr:Buffer.concat(stderr).toString("utf8")});};const capture=(target:Buffer[])=>(chunk:Buffer)=>{outputBytes+=chunk.byteLength;if(outputBytes>8_000_000){child.kill();finish(new Error("Java toolchain output exceeded 8 MB"));return;}target.push(chunk);};const timer=setTimeout(()=>{child.kill();finish(new Error("Java toolchain timed out after 30 seconds"));},timeout);child.stdout.on("data",capture(stdout));child.stderr.on("data",capture(stderr));child.on("error",error=>finish(error));child.on("close",code=>finish(undefined,code??-1));});}
