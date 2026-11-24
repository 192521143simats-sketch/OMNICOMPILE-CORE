import type {StoredArtifact} from "./database.js";

type Source={language:"c"|"python"|"java";sourceName:string;sourceText:string};
const safeName=(name:unknown,extension:string)=>typeof name==="string"&&name.length<=255&&/^[\p{L}\p{N}\p{Sc}\p{Pc}][\p{L}\p{N}\p{M}\p{Sc}\p{Pc}./-]*$/u.test(name)&&!name.split("/").some(part=>!part||part==="."||part==="..")&&name.endsWith(extension);
export const outputName=(sourceName:string,prefix:string,extension:string)=>`${prefix}${sourceName.slice(0,sourceName.lastIndexOf(".")).slice(0,255-prefix.length-extension.length)}${extension}`;
export function artifactDisposition(fileName:string){const base=fileName.split("/").at(-1)??"artifact",fallback=base.replace(/[^A-Za-z0-9._$-]/g,"_");return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(base).replace(/[!'()*]/g,value=>`%${value.charCodeAt(0).toString(16).toUpperCase()}`)}`;}
export function decodeCompilerOutput(value:unknown,maxEncodedLength=24_000_000){
  if(typeof value!=="string"||value.length>maxEncodedLength||!value.length||value.length%4!==0||! /^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error("Compiler output encoding is invalid");
  const bytes=Buffer.from(value,"base64");if(!bytes.length||bytes.toString("base64")!==value)throw new Error("Compiler output encoding is invalid");return bytes;
}
/** Structural integrity checks, not a claim that an untrusted worker is semantically verified. */
export function nativeArtifacts(source:Source,result:any):StoredArtifact[]{
  if(result?.operation!==`${source.language}_compile`)throw new Error("Compiler result does not match the assigned language");
  const original:StoredArtifact={artifactType:"SOURCE",fileName:source.sourceName,mediaType:{c:"text/x-c",python:"text/x-python",java:"text/x-java-source"}[source.language]+"; charset=utf-8",bytes:Buffer.from(source.sourceText,"utf8")};
  if(typeof result.generatedSource!=="string"||!result.generatedSource.trim()||Buffer.byteLength(result.generatedSource)>1_000_000)throw new Error("Final generated source is missing or oversized");
  const generated:StoredArtifact={...original,artifactType:"GENERATED_SOURCE",fileName:outputName(source.sourceName,"compiled_",source.sourceName.slice(source.sourceName.lastIndexOf("."))),bytes:Buffer.from(result.generatedSource,"utf8")};
  const bytes=decodeCompilerOutput(result.artifactBase64);
  if(source.language==="c"){
    if(typeof result.fileName!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result.fileName)||bytes.length<64||!(bytes.subarray(0,2).toString()==="MZ"||bytes.subarray(0,4).equals(Buffer.from([127,69,76,70]))))throw new Error("Native C executable is invalid");
    return[original,generated,{artifactType:"EXECUTABLE",fileName:result.fileName,mediaType:"application/octet-stream",bytes}];
  }
  if(source.language==="python"){
    if(bytes.length<17||bytes[2]!==13||bytes[3]!==10||bytes.readUInt32LE(4)!==0)throw new Error("Python bytecode header is invalid");
    return[original,generated,{artifactType:"BYTECODE",fileName:outputName(source.sourceName,"",".pyc"),mediaType:"application/x-python-bytecode",bytes}];
  }
  if(!safeName(result.fileName,".jar")||result.fileName.includes("/")||bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50||!Array.isArray(result.classes)||!result.classes.length||result.classes.length>1000)throw new Error("Java archive or class output is invalid");
  const names=new Set<string>(),classes=result.classes.map((item:any):StoredArtifact=>{
    if(!safeName(item.fileName,".class")||names.has(item.fileName))throw new Error("Java class filename is invalid");names.add(item.fileName);
    const classBytes=decodeCompilerOutput(item.contentBase64);if(classBytes.length<10||classBytes.readUInt32BE(0)!==0xcafebabe)throw new Error("Java class bytecode is invalid");
    return{artifactType:"BYTECODE",fileName:item.fileName,mediaType:"application/java-vm",bytes:classBytes};
  });
  // This checks structure only. Independent recompilation validates optimized
  // source before publication; preserve it when the optimizer changed the input.
  return[original,generated,...classes,{artifactType:"JAR",fileName:result.fileName,mediaType:"application/java-archive",bytes}];
}
