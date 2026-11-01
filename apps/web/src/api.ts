export async function api(path:string,options:RequestInit={}){
  const headers=new Headers(options.headers);
  if(options.body&&!headers.has("content-type"))headers.set("content-type","application/json");
  let response:Response;
  try{response=await fetch(path,{credentials:"include",...options,headers});}
  catch(cause){if(cause instanceof Error&&cause.name==="AbortError")throw cause;throw new Error("Unable to reach OmniCompile Core. Check your connection and try again.");}
  const contentType=response.headers.get("content-type")??"";
  let body:any=null;
  if(contentType.includes("json"))try{body=await response.json();}catch{
    throw new Error("The service returned an invalid response. Please try again.");
  }
  if(!response.ok)throw new Error(typeof body?.error?.message==="string"?body.error.message:response.status>=500?"The service is temporarily unavailable. Try again shortly.":`Request failed (${response.status}). Please try again.`);
  if(response.status!==204&&body===null)throw new Error("The service returned an invalid response. Please try again.");
  return body;
}
