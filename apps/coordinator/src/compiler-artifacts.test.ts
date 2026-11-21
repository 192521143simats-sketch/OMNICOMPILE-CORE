import {describe,it,expect} from "vitest";
import {nativeArtifacts,artifactDisposition,decodeCompilerOutput} from "./compiler-artifacts.js";
describe("native compiler artifacts",()=>{
  it("accepts structurally valid optimized Java source for subsequent independent verification",()=>{
    const source="class Main { int value=20+22; }",optimized="class Main { int value=42; }";
    const bytes=Buffer.concat([Buffer.from("cafebabe","hex"),Buffer.alloc(12)]),jar=Buffer.concat([Buffer.from([80,75,3,4]),Buffer.alloc(22)]);
    const artifacts=nativeArtifacts({language:"java",sourceName:"Main.java",sourceText:source},{operation:"java_compile",generatedSource:optimized,fileName:"Main.jar",artifactBase64:jar.toString("base64"),classes:[{fileName:"Main.class",contentBase64:bytes.toString("base64")}]});
    expect(artifacts.map(item=>item.artifactType)).toEqual(["SOURCE","GENERATED_SOURCE","BYTECODE","JAR"]);
    expect(artifacts[0]!.bytes.toString()).toBe(source);
    expect(artifacts[1]!.bytes.toString()).toBe(optimized);
  });
  it("decodes bounded large artifacts without regex-stack failures and rejects malformed padding",()=>{
    const bytes=Buffer.alloc(4000000,65);expect(decodeCompilerOutput(bytes.toString("base64")).equals(bytes)).toBe(true);
    for(const encoded of ["A","AA=A","AAAA====","AB==","AA==\n"]){expect(()=>decodeCompilerOutput(encoded)).toThrow(/encoding/);}
  });
  it("encodes Unicode download filenames without invalid HTTP header characters",()=>{
    expect(artifactDisposition("café/账单.class")).toBe("attachment; filename=\"__.class\"; filename*=UTF-8''%E8%B4%A6%E5%8D%95.class");
    expect(artifactDisposition("Main.class")).toContain('filename="Main.class"');
  });
  it("rejects fake bytecode and cross-language results",()=>{
    expect(()=>nativeArtifacts({language:"python",sourceName:"bill.py",sourceText:"x=1"},{operation:"python_compile",generatedSource:"x=1",artifactBase64:Buffer.from("not bytecode").toString("base64")})).toThrow();
    expect(()=>nativeArtifacts({language:"java",sourceName:"Bill.java",sourceText:"class Bill{}"},{operation:"python_compile"})).toThrow();
  });
  it("rejects path traversal in Java class names",()=>{
    expect(()=>nativeArtifacts({language:"java",sourceName:"Bill.java",sourceText:"class Bill{}"},{operation:"java_compile",fileName:"Bill.jar",artifactBase64:Buffer.from("PK\u0003\u0004content").toString("base64"),classes:[{fileName:"../../Bill.class",contentBase64:Buffer.from("cafebabe","hex").toString("base64")}]})).toThrow();
  });
  it("preserves C source and a genuine executable header",()=>{
    const bytes=Buffer.concat([Buffer.from("MZ"),Buffer.alloc(62)]);
    const artifacts=nativeArtifacts({language:"c",sourceName:"bill.c",sourceText:"int main(){return 0;}"},{operation:"c_compile",fileName:"bill.exe",generatedSource:"int main(){return 0;}",artifactBase64:bytes.toString("base64")});
    expect(artifacts.map(item=>item.artifactType)).toEqual(["SOURCE","GENERATED_SOURCE","EXECUTABLE"]);
    expect(artifacts[1]!.fileName).toBe("compiled_bill.c");
  });
  it("accepts safe Unicode Java class paths without loosening traversal protection",()=>{
    const source="package café; class Main {}",bytes=Buffer.concat([Buffer.from("cafebabe","hex"),Buffer.alloc(12)]),jar=Buffer.concat([Buffer.from([80,75,3,4]),Buffer.alloc(22)]);
    for(const fileName of ["₹/Main.class","café/‿Main.class"]){expect(nativeArtifacts({language:"java",sourceName:"Main.java",sourceText:source},{operation:"java_compile",generatedSource:source,fileName:"Main.jar",artifactBase64:jar.toString("base64"),classes:[{fileName,contentBase64:bytes.toString("base64")}]} )[1]!.fileName).toBe(fileName);}
    const artifacts=nativeArtifacts({language:"java",sourceName:"Main.java",sourceText:source},{operation:"java_compile",generatedSource:source,fileName:"Main.jar",artifactBase64:jar.toString("base64"),classes:[{fileName:"café/Main.class",contentBase64:bytes.toString("base64")}]});
    expect(artifacts[1]!.fileName).toBe("café/Main.class");
  });
  it("keeps derived artifact names within the existing database filename limit",()=>{
    const sourceName="x".repeat(252)+".PY",bytecode=Buffer.alloc(20);bytecode[2]=13;bytecode[3]=10;
    const artifacts=nativeArtifacts({language:"python",sourceName,sourceText:"x=1"},{operation:"python_compile",generatedSource:"x = 1\n",artifactBase64:bytecode.toString("base64")});
    expect(artifacts[0]!.fileName).toBe(sourceName);
    expect(artifacts.every(item=>item.fileName.length<=255)).toBe(true);
  });
});
