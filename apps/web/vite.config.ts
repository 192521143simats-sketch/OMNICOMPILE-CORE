import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const apiTarget=process.env.OMNICOMPILE_API_TARGET??"http://localhost:4100";
export default defineConfig({plugins:[react()],server:{port:Number(process.env.OMNICOMPILE_WEB_PORT??5173),strictPort:true,proxy:{"/api":apiTarget,"/ws":{target:apiTarget.replace(/^http/,"ws"),ws:true}}}});
