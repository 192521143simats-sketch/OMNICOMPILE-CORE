import type {CType} from "./ast.js";
export type IRValue=string;
export type IRInstruction=
  |{op:"const";dest:IRValue;value:number}
  |{op:"copy";dest:IRValue;source:IRValue}
  |{op:"unary";dest:IRValue;operator:"+"|"-"|"!";operand:IRValue}
  |{op:"binary";dest:IRValue;operator:string;left:IRValue;right:IRValue}
  |{op:"call";dest:IRValue|null;callee:string;arguments:IRValue[]}
  |{op:"label";name:string}
  |{op:"branch";condition:IRValue;thenLabel:string;elseLabel:string}
  |{op:"jump";target:string}
  |{op:"return";value:IRValue|null};
export type IRFunction={name:string;returnType:CType;parameters:Array<{name:string;type:CType;value:IRValue}>;instructions:IRInstruction[]};
export type CIntermediateRepresentation={kind:"OmniCompileCIR";version:1;functions:IRFunction[]};
