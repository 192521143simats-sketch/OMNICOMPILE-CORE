import type {IRInstruction,IRValue} from './ir.js';

/** Reachability first; linear temporary liveness only without control-flow joins. */
export function eliminateDeadCode(input:readonly IRInstruction[]){
 const labels=new Map<string,number>();let valid=true;
 input.forEach((instruction,index)=>{if(instruction.op==='label'){if(labels.has(instruction.name))valid=false;labels.set(instruction.name,index);}});
 for(const instruction of input){
  if(instruction.op==='jump'&&!labels.has(instruction.target))valid=false;
  if(instruction.op==='branch'&&(!labels.has(instruction.thenLabel)||!labels.has(instruction.elseLabel)))valid=false;
 }
 const reachable=new Set<number>(),pending=input.length?[0]:[];
 if(valid)while(pending.length){
  const index=pending.pop()!;if(index>=input.length||reachable.has(index))continue;
  reachable.add(index);const instruction=input[index]!;
  if(instruction.op==='jump')pending.push(labels.get(instruction.target)!);
  else if(instruction.op==='branch')pending.push(labels.get(instruction.thenLabel)!,labels.get(instruction.elseLabel)!);
  else if(instruction.op!=='return')pending.push(index+1);
 }
 const instructions=valid?input.filter((_,index)=>reachable.has(index)):[...input];
 let removedInstructions=input.length-instructions.length;
 const hasControlFlow=instructions.some(i=>i.op==='branch'||i.op==='jump');
 const live=new Set<IRValue>(),kept:IRInstruction[]=[];
 for(let index=instructions.length-1;index>=0;index--){
  const instruction=instructions[index]!,destination=dest(instruction);
  if(!hasControlFlow&&destination?.startsWith('%t')&&isPure(instruction)&&!live.has(destination)){removedInstructions++;continue;}
  if(destination)live.delete(destination);
  for(const operand of operands(instruction))live.add(operand);
  kept.push(instruction);
 }
 return {instructions:kept.reverse(),removedInstructions};
}
function dest(i:IRInstruction){return i.op==='const'||i.op==='copy'||i.op==='unary'||i.op==='binary'||i.op==='call'?i.dest??undefined:undefined;}
function isPure(i:IRInstruction){return i.op==='const'||i.op==='copy'||i.op==='unary'||i.op==='binary';}
function operands(i:IRInstruction):IRValue[]{switch(i.op){case 'copy':return[i.source];case 'unary':return[i.operand];case 'binary':return[i.left,i.right];case 'call':return i.arguments;case 'branch':return[i.condition];case 'return':return i.value?[i.value]:[];default:return[];}}
