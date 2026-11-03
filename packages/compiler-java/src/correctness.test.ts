import { describe, expect, it } from "vitest";
import { compileJava, javaRuntimePath, JavaFrontendError } from "./pipeline.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

describe("Java compilation correctness", () => {
  it.each([
    ['package demo; public class App { public static void main(String... args) {} }', 'demo/App.class', true],
    ['package demo; public record Point(int x) {}', 'demo/Point.class', false],
    ['public enum Color { RED }', 'Color.class', false],
    ['public interface Value { int value(); }', 'Value.class', false],
    ['/* public class Fake {} */ public class Real { String text = "static void main("; }', 'Real.class', false],
    ['public class Private { private static void main(String[] a) {} }', 'Private.class', false],
    ['public class Wrong { public static void main(int[] a) {} }', 'Wrong.class', false],
    ['public class Child extends Parent {} class Parent { public static void main(String[] a) {} }', 'Child.class', true],
  ])("compiles genuine declaration and identifies entry point: %s", async (source, file, runnable) => {
    const result = await compileJava(source);
    expect(result.classes[file]?.subarray(0, 4).toString("hex")).toBe("cafebabe");
    expect(result.jar.runnable).toBe(runnable);
    expect(Boolean(result.jar.mainClass)).toBe(runnable);
  }, 30000);
  it("keeps explicit filenames and reports real located errors without private paths", async () => {
    try { await compileJava("package demo;\npublic class App { void broken( }", "demo/App.java"); throw new Error("expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(JavaFrontendError);
      const diagnostics = (error as JavaFrontendError).diagnostics;
      expect(diagnostics[0]).toMatchObject({severity: "error", line: 2});
      expect(diagnostics[0]?.column).toBeGreaterThan(0);
      expect(JSON.stringify(diagnostics)).not.toContain("omnicompile-java-");
    }
  }, 30000);
  it("rejects unsafe filenames and oversized input", async () => {
    await expect(compileJava("class A {}", "../A.java")).rejects.toBeInstanceOf(JavaFrontendError);
    await expect(compileJava(" ".repeat(1_000_001))).rejects.toBeInstanceOf(JavaFrontendError);
  });
  it("executes the actual packaged inherited main and preserves exact source", async () => {
    const source = 'package fixture; public class Child extends Parent {} class Parent { public static void main(String... args) { System.out.print("trusted fixture"); } }';
    const result = await compileJava(source, "fixture/Child.java");
    expect(result.jar.mainClass).toBe("fixture.Child");
    expect(result.generatedSource).toBe(source);
    const dir = await mkdtemp(join(tmpdir(), "java-trusted-fixture-"));
    try {
      const path = join(dir, result.jar.fileName); await writeFile(path, result.jar.bytes);
      const output = await promisify(execFile)(await javaRuntimePath(), ["-jar", path], {timeout: 5000, maxBuffer: 10000, windowsHide: true});
      expect(output.stdout).toBe("trusted fixture");
    } finally { await rm(dir, {recursive: true, force: true}); }
  }, 30000);
  it("compiles Unicode escapes and ignores escaped text-block declaration text", async () => {
    const source = 'public cl\\u0061ss Real { String s = """\npublic class Fake {}\n"""; }';
    const result = await compileJava(source);
    expect(Object.keys(result.classes)).toEqual(["Real.class"]);
    expect(result.jar.runnable).toBe(false);
  }, 30000);
  it("infers the public filename across annotation array literals", async () => {
    const source = 'class Earlier {} @interface Ann { int[] value(); } public @Ann({1,2}) class Correct {}';
    const result = await compileJava(source);
    expect(result.primaryClass).toBe("Correct");
    expect(result.classes["Correct.class"]).toBeDefined();
  }, 30000);
  it("recognizes runnable Unicode package names", async () => {
    const result = await compileJava('package café; public class Main { public static void main(String[] args) {} }');
    expect(result.jar.runnable).toBe(true);
    expect(result.jar.mainClass).toBe("café.Main");
  }, 30000);
  it("accepts uppercase source extensions while preserving display names", async () => {
    const result = await compileJava('public class Main { public static void main(String[] args) {} }', "Main.JAVA");
    expect(result.sourceName).toBe("Main.JAVA");
    expect(result.classes["Main.class"]).toBeDefined();
    expect(result.jar.runnable).toBe(true);
  }, 30000);
  it("recognizes Unicode class identifiers with combining marks and inherited main", async () => {
    const result = await compileJava('package café; public class Cafe\u0301 extends Pére {} class Pére { public static void main(String... args) {} }');
    expect(result.jar.mainClass).toBe("café.Cafe\u0301");
    expect(result.classes["café/Cafe\u0301.class"]).toBeDefined();
  }, 30000);
  it("reports human-readable compiler messages with the missing symbol", async () => {
    try { await compileJava('public class Main {\n void run() { missing = 1; }\n}'); throw new Error("expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(JavaFrontendError);
      const diagnostic = (error as JavaFrontendError).diagnostics[0]!;
      expect(diagnostic).toMatchObject({severity: "error", line: 2});
      expect(diagnostic.column).toBeGreaterThan(0);
      expect(diagnostic.message).toContain("cannot find symbol");
      expect(diagnostic.message).toContain("variable missing");
      expect(diagnostic.message).not.toContain("kindname");
      expect(diagnostic.message).not.toContain("compiler.misc");
      expect(diagnostic.message).not.toContain(".java:");
    }
  }, 30000);
});
