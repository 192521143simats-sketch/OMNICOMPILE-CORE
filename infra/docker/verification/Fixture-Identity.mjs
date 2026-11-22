// Bind-mounted 0600 fixture credentials must stay private to their Linux owner.
// Docker Desktop on Windows keeps the image's existing non-root identity.
export function fixtureWorkerUser(platform=process.platform,uid=process.getuid?.(),gid=process.getgid?.()) {
  if(platform!=='linux')return [];
  if(!Number.isSafeInteger(uid)||uid<=0||!Number.isSafeInteger(gid)||gid<0) {
    throw new Error('Private credential fixtures require a non-root Linux test runner.');
  }
  return ['--user',`${uid}:${gid}`];
}
