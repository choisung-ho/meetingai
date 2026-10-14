#!/usr/bin/env node
// 통합 개발 실행기: FastAPI + realtime-server + frontend를 한 번에 띄운다.
// 하나가 죽으면 나머지도 함께 정리해 좀비 프로세스가 남지 않게 한다.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const services = [
  {
    name: "backend",
    color: "\x1b[36m",
    command: process.platform === "win32" ? "python" : "python3",
    args: ["-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
    cwd: resolve(root, "backend"),
  },
  {
    name: "realtime",
    color: "\x1b[35m",
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "dev"],
    cwd: resolve(root, "realtime-server"),
  },
  {
    name: "frontend",
    color: "\x1b[32m",
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "dev"],
    cwd: resolve(root, "frontend"),
  },
];

const RESET = "\x1b[0m";
const children = [];
let shuttingDown = false;

function prefixOutput(service, chunk) {
  const text = chunk.toString();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    process.stdout.write(`${service.color}[${service.name}]${RESET} ${line}\n`);
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300);
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => prefixOutput(service, chunk));
  child.stderr.on("data", (chunk) => prefixOutput(service, chunk));

  child.on("error", (error) => {
    process.stdout.write(`${service.color}[${service.name}]${RESET} 실행 실패: ${error.message}\n`);
    shutdown(1);
  });

  child.on("exit", (code) => {
    process.stdout.write(`${service.color}[${service.name}]${RESET} 종료 (code=${code})\n`);
    shutdown(code ?? 0);
  });

  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

process.stdout.write("통합 개발 서버 시작: backend:8000 / realtime:8080 / frontend:5173 (Ctrl+C로 전체 종료)\n");
