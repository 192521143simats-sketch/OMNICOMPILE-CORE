import {spawn} from "node:child_process";

export type PythonDiagnostic={severity:"error"|"warning";code:string;message:string;line:number|null;column:number|null};
export type PythonCompilation={language:"python";representation:"CPython AST + bytecode";pythonVersion:string;ast:string;optimizedAst:string;optimizedSource:string;bytecode:Buffer;artifactName:string;metrics:{originalAstNodes:number;optimizedAstNodes:number;nodesRemoved:number;optimizationEvidence?:{version:1;language:"python";method:string;transformations:number;measurement:{unit:"ast-nodes";before:number;after:number;reductionPercent:number|null};compiler:{name:string;version:string;options:string[]};artifactBytes:number;deadCodeElimination:{status:"applied"|"no-change";method:string;removedStatements:number;removedInstructions:null};runtimeSpeedupPercent:null}};diagnostics:PythonDiagnostic[];optimizations?:{description:string;line:number;count:number}[]};
export class PythonFrontendError extends Error{constructor(readonly diagnostics:PythonDiagnostic[]){super(diagnostics.map(d=>`${d.code}: ${d.message}${d.line?` at ${d.line}:${d.column??1}`:""}`).join("\n"));this.name="PythonFrontendError";}}

const pipelineScript=String.raw`
import ast, base64, importlib.util, json, marshal, struct, symtable, sys
request=json.loads(sys.stdin.read())
source=request['source']
filename=request['filename']
optimizations=[]
class Optimizer(ast.NodeTransformer):
    def generic_visit(self,node):
        # Annotations can be observable source strings (future annotations),
        # or deferred expressions. Never transform their subtrees.
        protected={name:getattr(node,name) for name in ('annotation','returns','type_params') if hasattr(node,name)}
        for name in protected: setattr(node,name,[] if name=='type_params' else None)
        try:
            return super().generic_visit(node)
        finally:
            for name,value in protected.items(): setattr(node,name,value)
    def safe(self,node):
        try:
            # Only bounded integer arithmetic; never execute submitted expressions.
            if isinstance(node,ast.BinOp):
                left,right=node.left.value,node.right.value
                if type(left) is not int or type(right) is not int or max(left.bit_length(),right.bit_length())>128: return node
                if isinstance(node.op,ast.Add): value=left+right
                elif isinstance(node.op,ast.Sub): value=left-right
                elif isinstance(node.op,ast.Mult): value=left*right
                else: return node
            else:
                operand=node.operand.value
                if type(operand) is not int or operand.bit_length()>128: return node
                if isinstance(node.op,ast.USub): value=-operand
                elif isinstance(node.op,ast.UAdd): value=operand
                elif isinstance(node.op,ast.Invert): value=~operand
                else: return node
            if value.bit_length()>128: return node
            optimizations.append({'description':'Folded bounded integer constant arithmetic','line':node.lineno,'count':1})
            return ast.copy_location(ast.Constant(value=value),node)
        except Exception:
            pass
        return node
    def visit_BinOp(self,node):
        node=self.generic_visit(node)
        return self.safe(node) if isinstance(node.left,ast.Constant) and isinstance(node.right,ast.Constant) else node
    def visit_UnaryOp(self,node):
        node=self.generic_visit(node)
        return self.safe(node) if isinstance(node.operand,ast.Constant) else node
class DeadCodeEliminator(ast.NodeTransformer):
    def __init__(self,protected_names):
        self.removed=0
        self.protected_names=protected_names
    def safe_to_remove(self,node):
        # Python determines locals and generator semantics from the entire AST,
        # including unreachable code. Keep every scope/binding-affecting node.
        protected=(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef,ast.Import,ast.ImportFrom,
                   ast.Global,ast.Nonlocal,ast.Yield,ast.YieldFrom,ast.Await,ast.ExceptHandler,
                   ast.AnnAssign,ast.arg)
        for item in ast.walk(node):
            if isinstance(item,protected): return False
            if isinstance(item,ast.Name) and not isinstance(item.ctx,ast.Load): return False
            if isinstance(item,ast.Name) and item.id in self.protected_names: return False
            if type(item).__name__ in ('MatchAs','MatchStar','MatchMapping','TypeAlias'): return False
        return True
    def record(self,statements):
        count=sum(1 for statement in statements for item in ast.walk(statement) if isinstance(item,ast.stmt))
        if count:
            self.removed+=count
            optimizations.append({'description':'Dead code elimination: removed unreachable statements','line':statements[0].lineno,'count':count})
    def generic_visit(self,node):
        node=super().generic_visit(node)
        for name,items in ast.iter_fields(node):
            if not isinstance(items,list) or not items or not all(isinstance(item,ast.stmt) for item in items): continue
            kept=[]
            terminated=False
            for statement in items:
                if terminated and self.safe_to_remove(statement):
                    self.record([statement])
                    continue
                kept.append(statement)
                if isinstance(statement,(ast.Return,ast.Raise,ast.Break,ast.Continue)): terminated=True
            setattr(node,name,kept)
        return node
    def visit_If(self,node):
        if isinstance(node.test,ast.Constant) and type(node.test.value) is bool:
            discarded=node.orelse if node.test.value else node.body
            selected=node.body if node.test.value else node.orelse
            if discarded and all(self.safe_to_remove(statement) for statement in discarded):
                self.record(discarded)
                # Keep a non-docstring statement at the original position:
                # removing an initial if must not create a new __doc__ value.
                kept=[ast.copy_location(ast.Pass(),node)]
                for statement in selected:
                    result=self.visit(statement)
                    if result is not None: kept.extend(result if isinstance(result,list) else [result])
                return kept
        return self.generic_visit(node)

def eliminate_dead_code(tree):
    # A dead load of an outer binding can still create a closure cell used by
    # live locals()/exec(). Use CPython's symbol tables to retain all captured
    # names, plus the implicit class/super cell, without mistaking globals for
    # closure variables. No submitted expression is evaluated.
    protected_names={'__class__','super'}
    tables=[symtable.symtable(source,filename,'exec')]
    while tables:
        table=tables.pop()
        protected_names.update(symbol.get_name() for symbol in table.get_symbols() if symbol.is_free() or symbol.is_nonlocal())
        tables.extend(table.get_children())
    elimination=DeadCodeEliminator(protected_names)
    return elimination.visit(tree),elimination.removed

try:
    tree=ast.parse(source,filename=filename,mode="exec",type_comments=True)
    compile(tree,filename,"exec",optimize=0)
    original_dump=ast.dump(tree,annotate_fields=True,include_attributes=True)
    original_nodes=sum(1 for _ in ast.walk(tree))
    optimized=Optimizer().visit(tree)
    optimized,dead_statements=eliminate_dead_code(optimized)
    optimized=ast.fix_missing_locations(optimized)
    optimized_source=ast.unparse(optimized)+"\n"
    compile(optimized,filename,"exec",optimize=0)
    reparsed=ast.parse(optimized_source,filename=filename,mode="exec",type_comments=True)
    code=compile(reparsed,filename,"exec",optimize=0)
    header=importlib.util.MAGIC_NUMBER+struct.pack("<III",0,0,0)
    bytecode=header+marshal.dumps(code)
    optimized_nodes=sum(1 for _ in ast.walk(reparsed))
    print(json.dumps({"ok":True,"pythonVersion":sys.version.split()[0],"ast":original_dump,"optimizedAst":ast.dump(reparsed,annotate_fields=True,include_attributes=True),"optimizedSource":optimized_source,"bytecode":base64.b64encode(bytecode).decode("ascii"),"metrics":{"originalAstNodes":original_nodes,"optimizedAstNodes":optimized_nodes,"nodesRemoved":original_nodes-optimized_nodes},"diagnostics":[],"deadCodeElimination":{"status":"applied" if dead_statements else "no-change","method":"Python AST unreachable statements and literal boolean branches; scope-sensitive code retained","removedStatements":dead_statements,"removedInstructions":None},"optimizations":optimizations}))
except SyntaxError as error:
    print(json.dumps({"ok":False,"diagnostics":[{"severity":"error","code":"PY_SYNTAX","message":error.msg,"line":error.lineno,"column":error.offset}]}))
except Exception:
    print(json.dumps({'ok':False,'diagnostics':[{'severity':'error','code':'PY_COMPILATION','message':'Python source could not be compiled within supported limits','line':None,'column':None}]}))
`;

export async function compilePython(source:string,pythonExecutable=process.env.PYTHON_EXECUTABLE??"python",sourceName="program.py"):Promise<PythonCompilation>{
  if(!source.trim())throw new PythonFrontendError([{severity:"error",code:"PY_EMPTY_SOURCE",message:"Python source is empty",line:null,column:null}]);
  if(Buffer.byteLength(source)>1_000_000)throw new PythonFrontendError([{severity:"error",code:"PY_SOURCE_TOO_LARGE",message:"Python source exceeds 1 MB",line:null,column:null}]);
  const filename=sourceName.split(/[\\/]/).pop()??"";
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,251}\.py$/i.test(filename))throw new PythonFrontendError([{severity:"error",code:"PY_SOURCE_NAME",message:"Python source name must be a .py filename",line:null,column:null}]);
  let response:any;
  try{
    const completed=await runPython(pythonExecutable,JSON.stringify({source,filename}));
    if(completed.code!==0)throw new Error("process failure");
    response=JSON.parse(completed.stdout);
  }catch{
    throw new PythonFrontendError([{severity:"error",code:"PY_TOOLCHAIN",message:"Python compiler unavailable or exceeded resource limits",line:null,column:null}]);
  }
  if(!response.ok)throw new PythonFrontendError(response.diagnostics);
  return{language:"python",representation:"CPython AST + bytecode",pythonVersion:response.pythonVersion,ast:response.ast,optimizedAst:response.optimizedAst,optimizedSource:response.optimizedSource,bytecode:Buffer.from(response.bytecode,"base64"),artifactName:filename.replace(/\.py$/i,".pyc"),metrics:{...response.metrics,optimizationEvidence:{version:1,language:"python",method:"Bounded integer AST constant folding and dead code elimination",transformations:response.optimizations.reduce((sum:number,item:{count:number})=>sum+item.count,0),measurement:{unit:"ast-nodes",before:response.metrics.originalAstNodes,after:response.metrics.optimizedAstNodes,reductionPercent:response.metrics.originalAstNodes?(response.metrics.originalAstNodes-response.metrics.optimizedAstNodes)*100/response.metrics.originalAstNodes:null},compiler:{name:"CPython",version:response.pythonVersion,options:["safe-integer-constant-folding","safe-dead-code-elimination","compile(optimize=0)"]},artifactBytes:Buffer.from(response.bytecode,"base64").length,deadCodeElimination:response.deadCodeElimination,runtimeSpeedupPercent:null}},diagnostics:response.diagnostics,optimizations:response.optimizations};
}
function runPython(executable:string,source:string){return new Promise<{code:number;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(executable,["-I","-S","-c",pipelineScript],{windowsHide:true}),stdout:Buffer[]=[],stderr:Buffer[]=[];let settled=false,outputBytes=0;const finish=(error?:Error,code=-1)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve({code,stdout:Buffer.concat(stdout).toString("utf8"),stderr:Buffer.concat(stderr).toString("utf8")});};const capture=(target:Buffer[])=>(chunk:Buffer)=>{outputBytes+=chunk.byteLength;if(outputBytes>8_000_000){child.kill();finish(new Error("Python compiler output exceeded 8 MB"));return;}target.push(chunk);};const timer=setTimeout(()=>{child.kill();finish(new Error("Python compiler timed out after 30 seconds"));},30_000);child.stdout.on("data",capture(stdout));child.stderr.on("data",capture(stderr));child.on("error",error=>finish(error));child.on("close",code=>finish(undefined,code??-1));child.stdin.end(source);});}
