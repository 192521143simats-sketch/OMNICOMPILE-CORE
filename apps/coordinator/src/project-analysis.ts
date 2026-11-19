import {projectInputSchema,type ProjectInput,type ProjectAnalysis} from '@omnicompile/contracts';

type Token={text:string;line:number;literal:boolean};
// A bounded lexical scan discards comments and keeps literals opaque. It is not
// a language parser or preprocessor; its uncertainty is part of the result.
function tokens(source:string,python:boolean,limit:number,onLimit:()=>void):Token[]{
  const result:Token[]=[];
  let i=0,line=0;
  while(i<source.length){
    if(result.length>=limit){onLimit();break;}
    const c=source[i]!;
    if(c==='\n'){line++;i++;continue;}
    if(/\s/.test(c)){i++;continue;}
    if(c==='\\'&&source[i+1]==='\n'){i+=2;continue;}
    if(python&&c==='#'||!python&&source.slice(i,i+2)==='//'){
      while(i<source.length&&source[i]!=='\n')i++;continue;
    }
    if(!python&&source.slice(i,i+2)==='/*'){
      i+=2;while(i<source.length&&source.slice(i,i+2)!=='*/'){if(source[i]==='\n')line++;i++;}i+=2;continue;
    }
    if(c==='"'||c==="'"){
      const startLine=line;
      const quote=python&&source.slice(i,i+3)===c.repeat(3)?c.repeat(3):c;
      i+=quote.length;let text='';
      while(i<source.length&&source.slice(i,i+quote.length)!==quote){
        if(source[i]==='\\'){text+=source.slice(i,i+2);i+=2;continue;}
        if(source[i]==='\n')line++;text+=source[i++];
      }
      i+=quote.length;result.push({text,line:startLine,literal:true});continue;
    }
    if(/[A-Za-z_$]/.test(c)){
      const start=i++;while(i<source.length&&/[A-Za-z0-9_$]/.test(source[i]!))i++;
      result.push({text:source.slice(start,i),line,literal:false});continue;
    }
    result.push({text:c,line,literal:false});i++;
  }
  return result;
}
const identifier=(token:Token|undefined)=>Boolean(token&&!token.literal&&/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token.text));
function dotted(list:Token[],start:number){
  let end=start,text='';
  const line=list[start]?.line;
  while(list[end]?.text==='.'&&list[end]?.line===line){text+='.';end++;}
  if(identifier(list[end])&&list[end]?.text!=='import'&&list[end]?.line===line){
    text+=list[end++]!.text;
    while(list[end]?.text==='.'&&list[end]?.line===line&&list[end+1]?.line===line&&
      (identifier(list[end+1])||list[end+1]?.text==='*')){
      text+='.'+list[end+1]!.text;end+=2;
    }
  }
  return {text,end};
}
function localPath(directory:string,target:string):string|undefined{
  if(!target||target.startsWith('/')||target.includes('\\')||target.includes(':'))return undefined;
  const parts=directory?directory.split('/'):[];
  for(const segment of target.split('/')){
    if(segment==='..'){if(!parts.length)return undefined;parts.pop();}
    else if(segment!=='.'&&segment)parts.push(segment);
  }
  return parts.join('/');
}
function components(files:ProjectAnalysis['files']):string[][]{
  const graph=new Map(files.map(file=>[file.path,file.dependencies]));
  const seen=new Map<string,number>(),low=new Map<string,number>(),stack:string[]=[],active=new Set<string>(),groups:string[][]=[];
  let next=0;
  const visit=(path:string)=>{
    seen.set(path,next);low.set(path,next++);stack.push(path);active.add(path);
    for(const dependency of graph.get(path)??[]){
      if(!seen.has(dependency)){visit(dependency);low.set(path,Math.min(low.get(path)!,low.get(dependency)!));}
      else if(active.has(dependency))low.set(path,Math.min(low.get(path)!,seen.get(dependency)!));
    }
    if(low.get(path)===seen.get(path)){
      const group:string[]=[];let member:string;
      do{member=stack.pop()!;active.delete(member);group.push(member);}while(member!==path);
      groups.push(group.sort());
    }
  };
  for(const path of [...graph.keys()].sort())if(!seen.has(path))visit(path);
  return groups;
}

export function analyzeProject(value:ProjectInput):ProjectAnalysis{
  const input=projectInputSchema.parse(value);
  const paths=new Set(input.files.map(file=>file.path));
  const diagnostics:ProjectAnalysis['diagnostics']=[];
  const diagnosed=new Set<string>();
  const warn=(path:string,code:string,message:string,severity:'warning'|'error'='warning')=>{
    const key=path+':'+code;if(diagnosed.has(key))return;diagnosed.add(key);
    diagnostics.push({severity,code,message,path});
  };
  let tokenBudget=100_000;
  const scans=new Map(input.files.map(file=>{
    const scanned=tokens(file.content,input.language==='python',tokenBudget,()=>
      warn(file.path,'TOKEN_SCAN_LIMIT','The project lexical token budget was reached; remaining source requires toolchain validation.'));
    tokenBudget-=scanned.length;
    return [file.path,scanned];
  }));
  const javaPackages=new Map<string,string>();
  if(input.language==='java')for(const [path,list] of scans){
    const index=list.findIndex(token=>!token.literal&&token.text==='package');
    javaPackages.set(path,index<0?'':dotted(list,index+1).text);
  }
  const files=input.files.map(file=>{
    const dependencies=new Set<string>(),externalDependencies=new Set<string>();
    const list=scans.get(file.path)!;
    const directory=file.path.includes('/')?file.path.slice(0,file.path.lastIndexOf('/')):'';
    const add=(set:Set<string>,name:string)=>{
      if(set.size<128&&name.length<=255)set.add(name);
      else warn(file.path,'DEPENDENCY_SCAN_LIMIT','Dependency output was bounded; toolchain validation must discover remaining dependencies.');
    };
    const local=(path:string)=>add(dependencies,path);
    const external=(name:string)=>add(externalDependencies,name);
    if(input.language==='c'){
      let conditionalDepth=0;
      for(let i=0;i<list.length;i++){
        const token=list[i]!;
        if(token.literal||token.text!=='#'||i>0&&list[i-1]!.line===token.line)continue;
        const directive=list[i+1];
        if(directive?.literal||directive?.line!==token.line)continue;
        if(['if','ifdef','ifndef'].includes(directive.text)){conditionalDepth++;continue;}
        if(directive.text==='endif'){conditionalDepth=Math.max(0,conditionalDepth-1);continue;}
        if(directive.text!=='include')continue;
        const target=list[i+2];
        if(target?.literal){
          const resolved=localPath(directory,target.text);
          if(resolved&&paths.has(resolved))local(resolved);
          else if(conditionalDepth)warn(file.path,'C_INCLUDE_CONDITIONAL_UNRESOLVED','A conditional quoted include is absent from the manifest; its active branch requires compiler validation.');
          else warn(file.path,'C_INCLUDE_UNRESOLVED','A quoted include is absent from the manifest; compiler include search paths must resolve it.');
        }else if(target?.text==='<'){
          let name='',end=i+3;
          while(end<list.length&&list[end]!.line===token.line&&list[end]!.text!=='>')name+=list[end++]!.text;
          if(list[end]?.text==='>')external(name);
          else warn(file.path,'C_INCLUDE_UNCERTAIN','An include directive needs compiler validation.');
        }else warn(file.path,'C_INCLUDE_UNCERTAIN','Macro or nonliteral include resolution requires compiler validation.');
      }
    }else if(input.language==='python'){
      warn(file.path,'PYTHON_IMPORT_UNCERTAIN','Static imports are conservative; dynamic imports, package initialization and module search paths require Python validation.');
      const resolve=(module:string,relative:boolean)=>{
        const target=module.replaceAll('.','/');
        const candidates=[target+'.py',target+'/__init__.py'];
        const found=candidates.find(path=>paths.has(path));
        if(found){local(found);const parts=found.split('/');parts.pop();
          while(parts.length){const init=parts.join('/')+'/__init__.py';if(paths.has(init)&&init!==found)local(init);parts.pop();}
        }else if(!relative)external(module);
        return Boolean(found);
      };
      let fromStatement=false;
      for(let i=0;i<list.length;i++){
        if(i===0||list[i]!.line!==list[i-1]!.line||list[i-1]!.text===';')fromStatement=false;
        if(list[i]!.literal)continue;
        if(list[i]!.text==='import'){
          // A from-import is handled with its module rather than imported symbols.
          if(fromStatement)continue;
          let cursor=i+1;
          while(identifier(list[cursor])){
            const module=dotted(list,cursor);resolve(module.text,false);cursor=module.end;
            if(list[cursor]?.text==='as')cursor+=2;
            if(list[cursor]?.text!==',')break;cursor++;
          }
        }else if(list[i]!.text==='from'){
          fromStatement=true;
          const module=dotted(list,i+1);let base=module.text;
          const relative=base.startsWith('.');
          if(relative){
            const dots=/^\.+/.exec(base)![0].length;
            const parts=directory?directory.split('/'):[];
            if(dots>parts.length){warn(file.path,'PYTHON_RELATIVE_IMPORT_UNRESOLVED','A relative import cannot be resolved within the submitted project.');continue;}
            base=[...parts.slice(0,parts.length-dots+1),base.slice(dots).replaceAll('.','/')].filter(Boolean).join('/');
          }else base=base.replaceAll('.','/');
          const found=base?resolve(base.replaceAll('/','.'),relative):false;
          if(list[module.end]?.text==='import'){
            let cursor=module.end+1;
            if(list[cursor]?.text==='(')cursor++;
            while(identifier(list[cursor])){
              const imported=list[cursor]!.text;
              const candidate=[base,imported].filter(Boolean).join('/');
              if(paths.has(candidate+'.py')||paths.has(candidate+'/__init__.py'))resolve(candidate.replaceAll('/','.'),true);
              else if(relative&&!found)warn(file.path,'PYTHON_RELATIVE_IMPORT_UNRESOLVED','A relative imported name may be a symbol or an unavailable module; Python validation is required.');
              cursor++;if(list[cursor]?.text==='as')cursor+=2;
              if(list[cursor]?.text!==',')break;cursor++;
            }
          }
        }
      }
    }else{
      warn(file.path,'JAVA_IMPORT_UNCERTAIN','Same-package sources are conservatively linked; classpath, wildcard imports, nested types and symbols require javac validation.');
      const ownPackage=javaPackages.get(file.path)!;
      for(const [other,pkg] of javaPackages)if(other!==file.path&&pkg===ownPackage)local(other);
      for(let i=0;i<list.length;i++)if(!list[i]!.literal&&list[i]!.text==='import'){
        const start=list[i+1]?.text==='static'?i+2:i+1;
        const imported=dotted(list,start).text;
        let found=false;
        for(const other of input.files){
          const pkg=javaPackages.get(other.path)!;
          const type=[pkg,other.path.split('/').at(-1)!.slice(0,-5)].filter(Boolean).join('.');
          if(imported===type||imported.startsWith(type+'.')||imported===pkg+'.*'){
            if(other.path!==file.path)local(other.path);found=true;
          }
        }
        if(!found&&imported)external(imported);
      }
    }
    return {path:file.path,dependencies:[...dependencies].sort(),externalDependencies:[...externalDependencies].sort()};
  });
  return {language:input.language,sourceBytes:input.files.reduce((sum,file)=>sum+new TextEncoder().encode(file.content).length,0),
    files,groups:components(files),diagnostics,status:diagnostics.some(item=>item.severity==='error')?'INVALID':'REQUIRES_TOOLCHAIN_VALIDATION',
    notes:[
      'Analysis only: no compilation, execution, filesystem writes or semantic correctness validation was performed.',
      'Groups are deterministic dependency-first SCC groups of the detected dependency graph, not compilable units or proof of safe parallel execution. Cycles are not universally invalid.',
      'Conditional compilation, macros, dynamic imports, package initialization, generated files and classpath resolution require the actual toolchain.',
      'Manifest paths use case-fold collision checks for portability to Windows; entryPoint is a submitted source path.',
    ]};
}
