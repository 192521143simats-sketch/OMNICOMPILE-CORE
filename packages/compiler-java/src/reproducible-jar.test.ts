import {setTimeout as delay} from "node:timers/promises";
import {expect,it} from "vitest";
import {compileJava} from "./pipeline.js";

it("produces the same runnable JAR when the same source is recompiled",async()=>{
  const source="package fixture; public class Main { static class Inner {} public static void main(String[] args) { System.out.println(42); } }";
  const first=await compileJava(source);
  await delay(2100);
  const second=await compileJava(source);
  expect(first.jar.runnable).toBe(true);
  expect(second.jar.bytes.equals(first.jar.bytes)).toBe(true);
},30000);
