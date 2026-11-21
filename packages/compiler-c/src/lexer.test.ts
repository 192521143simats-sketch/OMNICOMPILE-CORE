import {describe,expect,it} from "vitest";
import {lex} from "./lexer.js";

describe("C lexer",()=>{
  it("tokenizes declarations, control flow, operators, and comments with positions",()=>{const tokens=lex("// entry\nint main(void) { int x = 2; /* scale */ return x * 3 >= 6; }");expect(tokens.map(t=>t.kind)).toEqual(["int","identifier","(","void",")","{","int","identifier","=","integer",";","return","identifier","*","integer",">=","integer",";","}","eof"]);expect(tokens[0]?.span.start).toEqual({offset:9,line:2,column:1});expect(tokens[9]?.value).toBe(2);});
  it("rejects unknown input with its source location",()=>{expect(()=>lex("int main(){ @; }")).toThrow(CLExAt(1,13));});
  it("rejects unterminated block comments",()=>{expect(()=>lex("int x; /* no end")).toThrow(/Unterminated block comment at 1:8/);});
});

function CLExAt(line:number,column:number){return new RegExp(`at ${line}:${column}`);}
