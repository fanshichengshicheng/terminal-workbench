import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { WebSocket,WebSocketServer } from "ws";

const require = createRequire(import.meta.url);
const codexEntry = require.resolve("@openai/codex/bin/codex.js");
const publicPort = Number(process.env.WORKBENCH_CODEX_PORT || 45123);
const codexPort = Number(process.env.WORKBENCH_CODEX_INTERNAL_PORT || 45124);
const publicUrl = `ws://127.0.0.1:${publicPort}`;
const codexUrl = `ws://127.0.0.1:${codexPort}`;

const child = spawn(process.execPath,[codexEntry,"app-server","--listen",codexUrl],{
  cwd:process.cwd(),
  env:{...process.env,CODEX_WORKBENCH_BRIDGE:"1"},
  stdio:["ignore","pipe","pipe"],
  windowsHide:true,
});

child.stdout.on("data",data=>process.stdout.write(data));
child.stderr.on("data",data=>process.stderr.write(data));

const server = new WebSocketServer({host:"127.0.0.1",port:publicPort});
server.on("connection",browserSocket=>{
  const codexSocket = new WebSocket(codexUrl);
  const queue=[];
  browserSocket.on("message",data=>{
    const message=data.toString("utf8");
    if(codexSocket.readyState===WebSocket.OPEN)codexSocket.send(message);
    else queue.push(message);
  });
  codexSocket.on("open",()=>{for(const data of queue)codexSocket.send(data);queue.length=0});
  codexSocket.on("message",data=>{if(browserSocket.readyState===WebSocket.OPEN)browserSocket.send(data.toString("utf8"))});
  codexSocket.on("close",()=>browserSocket.close());
  codexSocket.on("error",error=>{if(browserSocket.readyState===WebSocket.OPEN)browserSocket.close(1011,error.message.slice(0,120))});
  browserSocket.on("close",()=>codexSocket.close());
  browserSocket.on("error",()=>codexSocket.close());
});

server.on("listening",()=>{
  process.stdout.write(`Workbench Codex bridge: ${publicUrl}\n`);
  process.stdout.write(`Codex internal endpoint: ${codexUrl}\n`);
  process.stdout.write("Keep this terminal open while using project conversations.\n");
});

child.on("error",error=>{
  process.stderr.write(`Unable to start Codex app-server: ${error.message}\n`);
  process.exitCode=1;
});

const stop=()=>{server.close();if(!child.killed)child.kill("SIGTERM")};
process.on("SIGINT",stop);
process.on("SIGTERM",stop);
child.on("exit",code=>{server.close();process.exit(code??0)});
