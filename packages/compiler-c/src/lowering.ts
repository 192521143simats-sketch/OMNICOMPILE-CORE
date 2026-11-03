import type {BlockStatement,Expression,FunctionDefinition,Statement} from "./ast.js";
import {compileCFrontend} from "./frontend.js";
import type {CIntermediateRepresentation,IRFunction,IRInstruction,IRValue} from "./ir.js";

export function lowerCToIR(source:string):CIntermediateRepresentation{const{ast}=compileCFrontend(source);const voidFunctions=new Set(ast.functions.filter(fn=>fn.returnType==="void").map(fn=>fn.name));return{kind:"OmniCompileCIR",version:1,functions:ast.functions.map(fn=>lowerFunction(fn,voidFunctions))};}
function lowerFunction(fn:FunctionDefinition,voidFunctions:Set<string>):IRFunction{
  const instructions:IRInstruction[]=[],scopes:Array<Map<string,IRValue>>=[new Map()],parameters=fn.parameters.map((parameter,index)=>({name:parameter.name,type:parameter.type,value:`%arg${index}.${parameter.name}`}));parameters.forEach(p=>scopes[0]!.set(p.name,p.value));let temporary=0,label=0,variable=0;
  const temp=()=>`%t${temporary++}`,newLabel=(name:string)=>`${fn.name}.${name}.${label++}`,lookup=(name:string)=>{for(let i=scopes.length-1;i>=0;i--){const value=scopes[i]!.get(name);if(value)return value;}throw new Error(`Validated identifier '${name}' is missing during IR lowering`);};
  const expression=(node:Expression):IRValue=>{switch(node.kind){
    case"IntegerLiteral":{const dest=temp();instructions.push({op:"const",dest,value:node.value});return dest;}
    case"IdentifierExpression":return lookup(node.name);
    case"UnaryExpression":{const operand=expression(node.operand),dest=temp();instructions.push({op:"unary",dest,operator:node.operator,operand});return dest;}
    case"BinaryExpression":{
      const left=expression(node.left),dest=temp();
      if(node.operator==="&&"||node.operator==="||"){
        const rhsLabel=newLabel("logical.rhs"),shortLabel=newLabel("logical.short"),endLabel=newLabel("logical.end");
        instructions.push({op:"branch",condition:left,thenLabel:node.operator==="&&"?rhsLabel:shortLabel,elseLabel:node.operator==="&&"?shortLabel:rhsLabel},{op:"label",name:rhsLabel});
        const right=expression(node.right),negated=temp();instructions.push({op:"unary",dest:negated,operator:"!",operand:right},{op:"unary",dest,operator:"!",operand:negated},{op:"jump",target:endLabel},{op:"label",name:shortLabel},{op:"const",dest,value:node.operator==="&&"?0:1},{op:"label",name:endLabel});
      }else{const right=expression(node.right);instructions.push({op:"binary",dest,operator:node.operator,left,right});}return dest;
    }
    case"AssignmentExpression":{const value=expression(node.value),dest=lookup(node.target.name);instructions.push({op:"copy",dest,source:value});return dest;}
    case"CallExpression":{const args=node.arguments.map(expression),dest=temp();instructions.push({op:"call",dest:voidFunctions.has(node.callee)?null:dest,callee:node.callee,arguments:args});return dest;}
  }};
  const statement=(node:Statement):void=>{switch(node.kind){case"BlockStatement":block(node,true);break;case"VariableDeclaration":{const dest=`%v${variable++}.${node.name}`;scopes.at(-1)!.set(node.name,dest);if(node.initializer)instructions.push({op:"copy",dest,source:expression(node.initializer)});break;}case"ExpressionStatement":if(node.expression)expression(node.expression);break;case"ReturnStatement":instructions.push({op:"return",value:node.expression?expression(node.expression):null});break;case"IfStatement":{const thenLabel=newLabel("then"),elseLabel=newLabel("else"),endLabel=newLabel("endif");instructions.push({op:"branch",condition:expression(node.condition),thenLabel,elseLabel});instructions.push({op:"label",name:thenLabel});statement(node.thenBranch);instructions.push({op:"jump",target:endLabel});instructions.push({op:"label",name:elseLabel});if(node.elseBranch)statement(node.elseBranch);instructions.push({op:"label",name:endLabel});break;}case"WhileStatement":{const conditionLabel=newLabel("while.cond"),bodyLabel=newLabel("while.body"),endLabel=newLabel("while.end");instructions.push({op:"label",name:conditionLabel});instructions.push({op:"branch",condition:expression(node.condition),thenLabel:bodyLabel,elseLabel:endLabel});instructions.push({op:"label",name:bodyLabel});statement(node.body);instructions.push({op:"jump",target:conditionLabel});instructions.push({op:"label",name:endLabel});break;}}};
  const block=(node:BlockStatement,nested:boolean)=>{if(nested)scopes.push(new Map());node.statements.forEach(statement);if(nested)scopes.pop();};block(fn.body,false);if(fn.returnType==="void"&&instructions.at(-1)?.op!=="return")instructions.push({op:"return",value:null});return{name:fn.name,returnType:fn.returnType,parameters,instructions};
}
