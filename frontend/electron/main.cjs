// ============================================================
// Electron 메인 프로세스
// ============================================================
// 역할:
//   데스크톱 앱 실행 시 필요한 서버를 직접 띄우고 창을 연다.
//
//   1. 사전 조건 점검 (Postgres / Redis / Ollama / Python)
//   2. FastAPI 백엔드 기동
//   3. Node 실시간 서버 기동
//   4. 준비되면 프론트엔드 로드
//
//   앱 종료 시 자식 프로세스를 모두 정리해 좀비가 남지 않게 한다.
// ============================================================

const { app, BrowserWindow, shell, dialog, systemPreferences } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");

const isDev = !app.isPackaged;

// 패키징되면 리소스는 app.asar 바깥(extraResources)에 놓인다.
const resourceRoot = isDev
  ? path.resolve(__dirname, "..", "..")
  : process.resourcesPath;

const BACKEND_DIR = path.join(resourceRoot, "backend");
const REALTIME_DIR = path.join(resourceRoot, "realtime-server");

const BACKEND_PORT = 8000;
const REALTIME_PORT = 8080;
const OLLAMA_PORT = Number(process.env.MEETING_AI_OLLAMA_PORT || 11434);
const OLLAMA_BASE_URL = (
  process.env.MEETING_AI_OLLAMA_BASE_URL ||
  process.env.OLLAMA_BASE_URL ||
  `http://127.0.0.1:${OLLAMA_PORT}`
).replace(/\/$/, "");
const LLM_MODEL = process.env.MEETING_AI_LLM_MODEL || process.env.LLM_MODEL || "qwen2.5:7b";
const OLLAMA_START_TIMEOUT_MS = 120000;
const OLLAMA_PULL_TIMEOUT_MS = 30 * 60 * 1000;

const children = [];
let mainWindow = null;
let isQuitting = false;

// ------------------------------------------------------------
// 로그: 패키징된 앱은 터미널이 없으므로 파일로 남긴다.
// ------------------------------------------------------------
const logDir = path.join(app.getPath("userData"), "logs");
fs.mkdirSync(logDir, { recursive: true });
const logStream = fs.createWriteStream(path.join(logDir, "app.log"), { flags: "a" });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  logStream.write(line);
  if (isDev) process.stdout.write(line);
}

// ------------------------------------------------------------
// Ollama 자동 기동
// ------------------------------------------------------------
// 개발 PC에서 `brew services start ollama`를 따로 실행하지 않아도 되도록
// 앱이 실행 중인 Ollama를 먼저 확인하고, 없으면 `ollama serve`를 기동한다.
// 모델이 설치되어 있지 않은 최초 실행에서는 필요한 모델도 자동으로 받는다.
// 모델 다운로드 실패 시 앱 자체는 열되, 로그에 원인을 남겨 STT/회의 기록 기능은
// 계속 사용할 수 있게 한다.
// ------------------------------------------------------------
function resolveExecutable(candidates) {
  return candidates.find((candidate) => {
    if (!candidate) return false;
    return candidate.includes("/") ? fs.existsSync(candidate) : true;
  });
}

async function ollamaTags() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function waitForOllama(timeoutMs = OLLAMA_START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tags = await ollamaTags();
    if (tags) return tags;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return null;
}

function runOllamaPull(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ["pull", LLM_MODEL], {
      cwd: resourceRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      log(`Ollama 모델 다운로드 시간 초과 model=${LLM_MODEL}`);
      resolve(false);
    }, OLLAMA_PULL_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => log(`[ollama pull] ${chunk.toString().trim()}`));
    child.stderr.on("data", (chunk) => log(`[ollama pull] ${chunk.toString().trim()}`));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log(`Ollama 모델 다운로드 실행 실패: ${error.message}`);
      resolve(false);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log(`Ollama 모델 다운로드 종료 code=${code}`);
      resolve(code === 0);
    });
  });
}

async function ensureOllama() {
  let tags = await ollamaTags();
  if (!tags) {
    const command = resolveExecutable([
      process.env.MEETING_AI_OLLAMA_BIN,
      "/opt/homebrew/bin/ollama",
      "/usr/local/bin/ollama",
      "ollama",
    ]);

    if (!command) {
      log("Ollama 실행 파일을 찾지 못했습니다. `brew install ollama`가 필요합니다.");
      return false;
    }

    if (await checkPort(OLLAMA_PORT)) {
      log(`Ollama 포트(${OLLAMA_PORT})는 열려 있지만 API 응답을 기다리는 중입니다.`);
    } else {
      log(`Ollama 자동 기동: ${command} serve`);
      startProcess({
        label: "ollama",
        command,
        args: ["serve"],
        cwd: resourceRoot,
        env: {
          OLLAMA_HOST: process.env.OLLAMA_HOST || `127.0.0.1:${OLLAMA_PORT}`,
        },
      });
    }

    tags = await waitForOllama();
    if (!tags) {
      log("Ollama가 준비되지 않았습니다. AI 요약은 규칙 기반으로 동작합니다.");
      return false;
    }
  }

  const models = Array.isArray(tags.models) ? tags.models : [];
  const hasModel = models.some(
    (model) => model?.name === LLM_MODEL || model?.model === LLM_MODEL
  );

  if (!hasModel) {
    const command = resolveExecutable([
      process.env.MEETING_AI_OLLAMA_BIN,
      "/opt/homebrew/bin/ollama",
      "/usr/local/bin/ollama",
      "ollama",
    ]);
    if (!command) {
      log(`Ollama는 실행 중이지만 모델을 받을 실행 파일이 없습니다: ${LLM_MODEL}`);
      return false;
    }
    log(`Ollama 모델 없음 — 최초 1회 다운로드 시작 model=${LLM_MODEL}`);
    if (!(await runOllamaPull(command))) return false;
    tags = await waitForOllama(10000);
  }

  const finalModels = Array.isArray(tags?.models) ? tags.models : [];
  const ready = finalModels.some(
    (model) => model?.name === LLM_MODEL || model?.model === LLM_MODEL
  );
  log(ready ? `Ollama 준비 완료 model=${LLM_MODEL}` : `Ollama 모델 확인 실패 model=${LLM_MODEL}`);
  return ready;
}

async function requestMicrophoneAccess() {
  if (process.platform !== "darwin") return true;
  if (typeof systemPreferences?.askForMediaAccess !== "function") return true;

  try {
    const status = systemPreferences.getMediaAccessStatus?.("microphone");
    if (status === "granted") return true;
    if (status === "denied" || status === "restricted") {
      log(`마이크 권한이 ${status} 상태입니다. 시스템 설정에서 MeetingAI를 허용하세요.`);
      return false;
    }
    const granted = await systemPreferences.askForMediaAccess("microphone");
    log(`마이크 권한 결과: ${granted ? "허용" : "거부"}`);
    return granted;
  } catch (error) {
    log(`마이크 권한 요청 실패: ${error.message}`);
    return false;
  }
}

// ------------------------------------------------------------
// 포트가 열릴 때까지 기다린다(서버 기동 완료 감지).
// ------------------------------------------------------------
function checkPort(port, host = "127.0.0.1", timeoutMs = 900) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function waitForPort(port, { label, timeoutMs = 120000, processRef = null }) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (processRef?.exitCode !== null && processRef?.exitCode !== undefined) {
      log(`${label} 프로세스가 포트 준비 전에 종료되었습니다 (code=${processRef.exitCode})`);
      return false;
    }
    if (await checkPort(port)) {
      log(`${label} 준비 완료 (포트 ${port})`);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  log(`${label} 기동 시간 초과 (포트 ${port})`);
  return false;
}

// 포트가 열렸더라도 DB/Redis 초기화가 끝나지 않았을 수 있다.
// FastAPI의 운영 health 계약까지 확인한 뒤에만 창을 열어, 설치 직후의
// "서버는 떴지만 요청마다 500" 상태를 사용자에게 노출하지 않는다.
async function waitForBackendHealth(timeoutMs = 15000, processRef = null) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (processRef?.exitCode !== null && processRef?.exitCode !== undefined) {
      log(`백엔드 health 확인 전에 프로세스가 종료되었습니다 (code=${processRef.exitCode})`);
      return false;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/health`, {
        signal: AbortSignal.timeout(1200),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.data?.status === "ok") {
        log("백엔드 health 확인 완료 (database/redis ok)");
        return true;
      }
      if (body?.data?.checks) {
        log(`백엔드 health 대기 중: ${JSON.stringify(body.data.checks)}`);
      }
    } catch {
      // 기동 직후 연결 실패는 정상일 수 있으므로 다음 주기에 재시도한다.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  log("백엔드 health 확인 시간 초과");
  return false;
}

// ------------------------------------------------------------
// 설치본 전용 비밀키
// ------------------------------------------------------------
// 개발용 .env는 배포 번들에 넣지 않는다.
// (넣으면 .dmg를 푼 사람이 DB 비밀번호와 JWT 서명키를 그대로 얻어
//  다른 사용자의 토큰을 위조할 수 있다)
//
// 대신 설치한 컴퓨터마다 최초 실행 시 무작위 키를 만들어
// userData에 저장하고 두 서버에 환경변수로 주입한다.
// ------------------------------------------------------------
function loadOrCreateSecrets() {
  const secretsPath = path.join(app.getPath("userData"), "secrets.json");

  if (fs.existsSync(secretsPath)) {
    try {
      const stored = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
      const requiredKeys = [
        "SECRET_KEY",
        "ANALYSIS_CALLBACK_SECRET",
        "AI_RESULT_CALLBACK_SECRET",
        "AUDIO_SIGNING_SECRET",
      ];
      const valid = requiredKeys.every(
        (key) => typeof stored?.[key] === "string" && stored[key].length >= 32,
      );
      if (valid) return stored;
      log(`기존 비밀키 형식이 올바르지 않아 새로 만듭니다: ${secretsPath}`);
    } catch (error) {
      log(`기존 비밀키를 읽지 못해 새로 만듭니다: ${error.message}`);
    }
  }

  const { randomBytes } = require("node:crypto");
  const secrets = {
    SECRET_KEY: randomBytes(48).toString("base64url"),
    ANALYSIS_CALLBACK_SECRET: randomBytes(24).toString("hex"),
    AI_RESULT_CALLBACK_SECRET: randomBytes(24).toString("hex"),
    AUDIO_SIGNING_SECRET: randomBytes(24).toString("hex"),
  };

  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  // 기존 파일을 교체하는 경우 writeFileSync의 mode 옵션만으로는
  // 권한이 갱신되지 않을 수 있으므로 명시적으로 600을 재적용한다.
  fs.chmodSync(secretsPath, 0o600);
  log(`설치본 전용 비밀키 생성: ${secretsPath}`);

  return secrets;
}

// ------------------------------------------------------------
// 서버 공통 환경변수
// ------------------------------------------------------------
function buildServerEnv(secrets) {
  return {
    ...secrets,
    // 데스크톱 설치본은 compose가 띄운 로컬 DB/Redis를 사용한다.
    DATABASE_URL:
      process.env.MEETING_AI_DATABASE_URL ||
      "postgresql://postgres:1234@localhost:5433/meeting_ai_db",
    REDIS_URL: process.env.MEETING_AI_REDIS_URL || "redis://127.0.0.1:6379/0",
    FASTAPI_BASE_URL: `http://127.0.0.1:${BACKEND_PORT}`,
    // The packaged renderer is loaded from file:// and sends Origin: null.
    // Keep the allowlist explicit so the installed app can call its own local
    // FastAPI instance without opening CORS to arbitrary web origins.
    FRONTEND_ORIGINS:
      process.env.MEETING_AI_FRONTEND_ORIGINS ||
      "null,http://localhost:5173,http://127.0.0.1:5173",
    LLM_ENABLED: process.env.MEETING_AI_LLM_ENABLED || "true",
    OLLAMA_BASE_URL,
    LLM_MODEL,
    // 설치본 기본값은 회의 정확도에 맞춘 small 모델이다. 환경변수로
    // base/tiny 등 더 가벼운 모델을 선택할 수 있다.
    STT_MODEL: process.env.MEETING_AI_STT_MODEL || process.env.STT_MODEL || "small",
    // 업로드 파일은 앱 번들(읽기 전용)이 아니라 사용자 데이터 폴더에 저장한다.
    MEETING_AI_DATA_DIR: app.getPath("userData"),
  };
}

// ------------------------------------------------------------
// 파이썬 실행 파일 탐색
// 사용자가 backend 의존성을 설치해 둔 인터프리터를 찾는다.
// ------------------------------------------------------------
function resolvePython() {
  const candidates = [
    process.env.MEETING_AI_PYTHON,
    path.join(BACKEND_DIR, ".venv", "bin", "python3"),
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("/") && !fs.existsSync(candidate)) continue;
    return candidate;
  }

  return "python3";
}

// 백엔드를 띄우기 전에 실제 인터프리터에 필요한 모듈이 설치되어 있는지
// 확인한다. 설치본에서 uvicorn이 즉시 종료되어 장시간 포트만 기다리는 대신
// 누락된 의존성과 해결 방법을 즉시 사용자에게 알려준다.
function checkPythonRuntime(python) {
  const required = [
    "fastapi",
    "uvicorn",
    "sqlalchemy",
    "redis",
    "faster_whisper",
    "speechbrain",
    "torch",
    "torchaudio",
    "av",
  ];
  const script = [
    "import importlib.util, sys",
    `required=${JSON.stringify(required)}`,
    "missing=[name for name in required if importlib.util.find_spec(name) is None]",
    "print('\\n'.join(missing))",
    "sys.exit(1 if missing else 0)",
  ].join(";");

  return new Promise((resolve) => {
    const child = spawn(python, ["-c", script], {
      cwd: BACKEND_DIR,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, missing: [], error: "Python 의존성 확인 시간 초과" });
    }, 15000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, missing: [], error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const missing = stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      resolve({ ok: code === 0 && missing.length === 0, missing, error: stderr.trim() });
    });
  });
}

// ------------------------------------------------------------
// 자식 프로세스 기동
// ------------------------------------------------------------
function startProcess({ label, command, args, cwd, env }) {
  log(`${label} 시작: ${command} ${args.join(" ")}`);

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => log(`[${label}] ${chunk.toString().trim()}`));
  child.stderr.on("data", (chunk) => log(`[${label}] ${chunk.toString().trim()}`));

  child.on("error", (error) => log(`[${label}] 실행 실패: ${error.message}`));
  child.on("exit", (code) => {
    log(`[${label}] 종료 (code=${code})`);
    if (!isQuitting && code !== 0) {
      log(`[${label}] 비정상 종료 — 로그를 확인하세요: ${logDir}`);
    }
  });

  children.push({ label, child });
  return child;
}

function stopChildren() {
  isQuitting = true;
  for (const { label, child } of children) {
    if (!child.killed) {
      log(`${label} 종료 요청`);
      child.kill("SIGTERM");
    }
  }
}

// ------------------------------------------------------------
// 사전 조건 점검
// ------------------------------------------------------------
async function checkPrerequisites() {
  const parseEndpoint = (raw, fallbackPort) => {
    try {
      const parsed = new URL(raw);
      return {
        host: parsed.hostname || "127.0.0.1",
        port: Number(parsed.port) || fallbackPort,
      };
    } catch {
      return { host: "127.0.0.1", port: fallbackPort };
    }
  };
  const databaseEndpoint = parseEndpoint(
    process.env.MEETING_AI_DATABASE_URL ||
      "postgresql://postgres:1234@localhost:5433/meeting_ai_db",
    5433,
  );
  const redisEndpoint = parseEndpoint(
    process.env.MEETING_AI_REDIS_URL || "redis://127.0.0.1:6379/0",
    6379,
  );
  const [postgres, redis] = await Promise.all([
    checkPort(databaseEndpoint.port, databaseEndpoint.host),
    checkPort(redisEndpoint.port, redisEndpoint.host),
  ]);

  const missing = [];
  if (!postgres) missing.push(`PostgreSQL (${databaseEndpoint.host}:${databaseEndpoint.port})`);
  if (!redis) missing.push(`Redis (${redisEndpoint.host}:${redisEndpoint.port})`);

  return { postgres, redis, missing };
}

// ------------------------------------------------------------
// 인프라 자동 기동 시도 (docker compose)
// ------------------------------------------------------------
async function tryStartInfra() {
  const composeFile = path.join(resourceRoot, "docker-compose.yml");
  if (!fs.existsSync(composeFile)) return false;

  const dockerCandidates = ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "docker"];
  const docker = dockerCandidates.find(
    (candidate) => !candidate.includes("/") || fs.existsSync(candidate)
  );

  if (!docker) return false;

  log("docker compose로 인프라 기동 시도");

  return new Promise((resolve) => {
    const child = spawn(docker, ["compose", "up", "-d"], {
      cwd: resourceRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => log(`[docker] ${chunk.toString().trim()}`));
    child.stderr.on("data", (chunk) => log(`[docker] ${chunk.toString().trim()}`));
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

// ------------------------------------------------------------
// 서버 기동
// ------------------------------------------------------------
async function startServers() {
  const python = resolvePython();
  log(`파이썬 실행 파일: ${python}`);

  // 두 서버가 같은 SECRET_KEY를 써야 WebSocket JWT 인증이 통과한다.
  const serverEnv = buildServerEnv(loadOrCreateSecrets());

  const backendProcess = startProcess({
    label: "backend",
    command: python,
    args: ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)],
    cwd: BACKEND_DIR,
    env: {
      ...serverEnv,
      PYTHONUNBUFFERED: "1",
      // 앱 번들 안에 __pycache__를 만들면 코드 서명이 깨져
      // 다음 실행부터 macOS가 앱을 차단한다.
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });

  const realtimeProcess = startProcess({
    label: "realtime",
    command: process.execPath,
    args: [path.join(REALTIME_DIR, "server", "mainServer.js")],
    cwd: REALTIME_DIR,
    // Electron 바이너리를 순수 Node로 동작시킨다(별도 Node 설치 불필요).
    // 설치본의 WebSocket은 데스크톱 내부 통신 전용이므로 외부 인터페이스에
    // 노출하지 않는다. 원격/개발 서버가 필요할 때만 명시적으로 덮어쓴다.
    env: {
      ...serverEnv,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: process.env.MEETING_AI_REALTIME_HOST || "127.0.0.1",
      PORT: process.env.MEETING_AI_REALTIME_PORT || String(REALTIME_PORT),
    },
  });

  const backendReady = await waitForPort(BACKEND_PORT, {
    label: "백엔드",
    processRef: backendProcess,
  });
  const backendHealthy = backendReady
    ? await waitForBackendHealth(15000, backendProcess)
    : false;
  const realtimeReady = await waitForPort(REALTIME_PORT, {
    label: "실시간 서버",
    timeoutMs: 30000,
    processRef: realtimeProcess,
  });

  return { backendReady: backendReady && backendHealthy, realtimeReady };
}

// ------------------------------------------------------------
// 창 생성
// ------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "AI 회의 보조",
    show: false,
    webPreferences: {
      // 렌더러에 Node를 노출하지 않는다(보안 기본값 유지).
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // 외부 링크는 기본 브라우저로 연다.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return mainWindow;
}

function showStartupError(title, message) {
  dialog.showMessageBoxSync({
    type: "error",
    title,
    message,
    detail: `로그 위치: ${logDir}`,
    buttons: ["확인"],
  });
}

// ------------------------------------------------------------
// 앱 생명주기
// ------------------------------------------------------------
app.whenReady().then(async () => {
  log("=== 앱 시작 ===");
  log(`리소스 경로: ${resourceRoot}`);

  let prerequisites = await checkPrerequisites();

  if (prerequisites.missing.length > 0) {
    log(`인프라 미기동: ${prerequisites.missing.join(", ")} → 자동 기동 시도`);
    await tryStartInfra();
    // 컨테이너가 healthy 될 때까지 잠시 기다린다.
    await new Promise((resolve) => setTimeout(resolve, 4000));
    prerequisites = await checkPrerequisites();
  }

  if (prerequisites.missing.length > 0) {
    showStartupError(
      "필수 서비스가 실행되지 않았습니다",
      `${prerequisites.missing.join(", ")} 에 연결할 수 없습니다.\n\n` +
        "터미널에서 아래를 실행한 뒤 앱을 다시 열어주세요.\n" +
        "  docker compose up -d"
    );
    app.quit();
    return;
  }

  const python = resolvePython();
  log(`파이썬 실행 파일 사전 점검: ${python}`);
  const pythonRuntime = await checkPythonRuntime(python);
  if (!pythonRuntime.ok) {
    const missing = pythonRuntime.missing.length > 0
      ? `누락된 Python 모듈: ${pythonRuntime.missing.join(", ")}`
      : (pythonRuntime.error || "Python을 실행할 수 없습니다.");
    showStartupError(
      "Python 실행 환경을 준비할 수 없습니다",
      `${missing}\n\n` +
        "backend/requirements.txt를 설치한 Python을 MEETING_AI_PYTHON으로 지정하거나,\n" +
        "터미널에서 다음을 실행한 뒤 앱을 다시 열어주세요.\n" +
        "  python3 -m pip install -r backend/requirements.txt"
    );
    app.quit();
    return;
  }

  const ollamaReady = await ensureOllama();
  if (!ollamaReady) {
    // Ollama가 없어도 회의 기록/STT/화자 분리는 계속 사용할 수 있다.
    log("Ollama 미준비 — AI 요약은 규칙 기반으로 대체됩니다.");
  }

  const { backendReady, realtimeReady } = await startServers();

  if (!backendReady || !realtimeReady) {
    const unavailable = [
      !backendReady ? "FastAPI 백엔드" : null,
      !realtimeReady ? "실시간 WebSocket 서버" : null,
    ]
      .filter(Boolean)
      .join(", ");
    showStartupError(
      "필수 서버를 시작하지 못했습니다",
      `${unavailable}를 시작하지 못했습니다.\n\n` +
        "Python 의존성 또는 실시간 서버 의존성이 설치되어 있는지 확인해주세요.\n\n" +
        "  python3 -m pip install -r backend/requirements.txt\n" +
        "  npm --prefix realtime-server install"
    );
    app.quit();
    return;
  }

  await requestMicrophoneAccess();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopChildren();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopChildren);
process.on("exit", stopChildren);
