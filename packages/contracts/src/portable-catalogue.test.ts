import {describe,it,expect} from "vitest";
import * as contracts from "./index.js";

describe("bounded portable catalogue contracts",()=>{
  it("accepts compatible rectangular matrix inputs",()=>{
    expect(contracts.testTaskSchema.safeParse({operation:"matrix_multiply",left:[[1,2,3]],right:[[1],[2],[3]]}).success).toBe(true);
  });
  it.each([
    {left:[],right:[[1]]}, {left:[[1],[1,2]],right:[[1]]},
    {left:[[1,2]],right:[[1]]}, {left:[[1.1]],right:[[1]]},
    {left:[[1001]],right:[[1]]}, {left:[[-1001]],right:[[1]]},
    {left:[Array(33).fill(1)],right:Array.from({length:33},()=>[1])},
    {left:[[1]],right:[[1]],untrustedCode:"return 1"}
  ])("rejects malformed or excessive matrix payloads",input=>{
    expect(contracts.testTaskSchema.safeParse({operation:"matrix_multiply",...input}).success).toBe(false);
  });
  it.each([0,1_000_001,1.5,Infinity])("rejects invalid benchmark iteration bound %s",iterations=>{
    expect(contracts.testTaskSchema.safeParse({operation:"portable_benchmark",seed:0,iterations}).success).toBe(false);
  });
  it("accepts unsigned benchmark seed endpoints and rejects unknown input fields",()=>{
    for(const seed of [0,4294967295])expect(contracts.testTaskSchema.safeParse({operation:"portable_benchmark",seed,iterations:1}).success).toBe(true);
    for(const seed of [-1,4294967296,1.2])expect(contracts.testTaskSchema.safeParse({operation:"portable_benchmark",seed,iterations:1}).success).toBe(false);
    expect(contracts.testTaskSchema.safeParse({operation:"portable_benchmark",seed:0,iterations:1,score:100}).success).toBe(false);
  });
  it("publishes machine-readable admission and verification metadata for every portable operation",()=>{
    const catalogue=contracts.portableWorkloadCatalogue;
    expect(catalogue).toBeDefined();
    for(const operation of ["sha256","sha256_chain","prime_count","matrix_multiply","portable_benchmark"] as const){
      expect(catalogue[operation]).toMatchObject({operation,requirements:{runtime:"portable-js"},estimatedResources:{kind:"estimate"},executionLimit:{maxDurationMs:expect.any(Number)},verification:{method:"independent-recomputation"}});
      expect(catalogue[operation].inputSchema.safeParse({operation}).success).toBe(false);
      expect(catalogue[operation].resultSchema.safeParse({operation}).success).toBe(false);
    }
  });
  it("authorizes new portable operations only for the existing compute task kind",()=>{
    const payload={operation:"matrix_multiply",left:[[1]],right:[[2]]};
    const assignment={protocolVersion:2,type:"task_assignment",taskId:"matrix",attempt:1,taskKind:"TEST_COMPUTE",payload};
    expect(contracts.parseCoordinatorMessage(assignment)).toMatchObject({payload});
    expect(()=>contracts.parseCoordinatorMessage({...assignment,taskKind:"C_COMPILE"})).toThrow("authorized operation");
  });
});
