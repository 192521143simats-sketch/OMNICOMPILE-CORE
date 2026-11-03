import {readFileSync,existsSync} from 'node:fs';
import {expect,it} from 'vitest';

// Static scope guards supplement the actual routing/navigation assertions in
// Verify-Web-Product.mjs; these are not a substitute for browser acceptance.
const source=readFileSync(new URL('./main.tsx',import.meta.url),'utf8');
it('keeps normal-user navigation focused on compilation without dormant extra pages',()=>{
  const header=source.slice(source.indexOf('function Header('),source.indexOf('function Shell('));
  expect(header).toContain('href="/dashboard">Compiler');
  expect(header).not.toMatch(/href="\/(compute|settings)"/);
  expect(source).not.toMatch(/import.*\{(?:ComputeTasks|Settings)\}/);
  for(const name of ['compute-tasks.tsx','settings.tsx'])expect(existsSync(new URL(name,import.meta.url))).toBe(false);
});
it('retains auth/admin/enrollment routes and redirects retired user bookmarks',()=>{
  for(const route of ['/login','/signup','/forgot-password','/reset-password','/admin','/dashboard','/worker'])expect(source).toContain(`path==="${route}"`);
  expect(source).toContain('if(path==="/settings"||path==="/compute")return <WorkspaceRedirect/>');
  expect(source).toContain('location.replace("/dashboard")');
  expect(source).toContain('<CompilerMetrics jobId={job?.id} language={language}/>');
  expect(source).toContain('<ArtifactDownloads artifacts={job.artifacts}/>');
});
