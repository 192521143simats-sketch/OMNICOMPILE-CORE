import {afterEach,describe,expect,it,vi} from "vitest";
import {calculateCpuUtilization,calculateMemoryUtilization,profile,type CpuTimes} from "./profiler.js";

const times=(user:number,idle:number):CpuTimes=>({user,nice:0,sys:0,idle,irq:0});

describe("resource profiler",()=>{
  afterEach(()=>vi.unstubAllEnvs());
  it("calculates CPU utilization from actual counter deltas",()=>{
    expect(calculateCpuUtilization([times(100,900)],[times(150,950)])).toBe(50);
    expect(calculateCpuUtilization([times(100,900)],[times(100,900)])).toBe(0);
  });

  it("calculates and clamps memory utilization",()=>{
    expect(calculateMemoryUtilization(1000,250)).toBe(75);
    expect(calculateMemoryUtilization(1000,1200)).toBe(0);
    expect(calculateMemoryUtilization(0,0)).toBe(0);
  });

  it("records independently detected toolchain availability and versions",async()=>{
    vi.stubEnv("GCC_EXECUTABLE","fixture-gcc");
    vi.stubEnv("PYTHON_EXECUTABLE","fixture-python");
    const detector=vi.fn(async(command:string)=>command==="javac"?{available:false}:{available:true,version:`${command} test-version`});
    const result=await profile(detector);
    expect(result.runtimes).toEqual({c:true,python:true,java:false});
    expect(result.toolchains.c.version).toBe("fixture-gcc test-version");
    expect(result.toolchains.python.version).toBe("fixture-python test-version");
    expect(detector).toHaveBeenCalledWith("fixture-gcc",["--version"]);
    expect(detector).toHaveBeenCalledWith("fixture-python",["--version"]);
    expect(result.toolchains.java.available).toBe(false);
    expect(detector).toHaveBeenCalledTimes(3);
  });
});
