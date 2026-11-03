import {describe,expect,it} from "vitest";
import {lowerCToIR} from "./lowering.js";

describe("C IR lowering",()=>{
  it("lowers expressions and calls to explicit three-address operations",()=>{const ir=lowerCToIR("int twice(int x){return x*2;} int main(void){int n=20+1;return twice(n);}");expect(ir).toMatchObject({kind:"OmniCompileCIR",version:1});expect(ir.functions[1]?.instructions.map(i=>i.op)).toEqual(["const","const","binary","copy","call","return"]);});
  it("lowers control flow to labels and branches",()=>{const fn=lowerCToIR("int main(void){int x=0;while(x<2){x=x+1;}if(x==2)return x;else return 0;}").functions[0]!;expect(fn.instructions.filter(i=>i.op==="branch")).toHaveLength(2);expect(fn.instructions.some(i=>i.op==="jump"&&i.target.includes("while.cond"))).toBe(true);});
});
