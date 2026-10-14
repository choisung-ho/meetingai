// ============================================================
// electron-builder afterPack 훅
// ============================================================
// 역할:
//   1. 실시간 서버의 node_modules를 앱 번들에 복사한다.
//      electron-builder는 extraResources에서 node_modules를 무조건 제외하는데,
//      실시간 서버는 ws/redis/jsonwebtoken 런타임 의존성이 필요하다.
//
//   2. 앱을 ad-hoc 재서명한다.
//      번들 내용을 바꾸면 Electron 원본 서명이 무효가 되고,
//      Apple Silicon은 서명이 깨진 앱을 SIGTRAP으로 즉시 종료시킨다.
// ============================================================

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

exports.default = async function afterPack(context) {
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const resourcesDir = path.join(appPath, "Contents", "Resources");

  // --- 1. 실시간 서버 의존성 복사 ---
  const sourceModules = path.resolve(
    context.packager.projectDir,
    "..",
    "realtime-server",
    "node_modules"
  );
  const targetModules = path.join(resourcesDir, "realtime-server", "node_modules");

  if (fs.existsSync(sourceModules)) {
    fs.rmSync(targetModules, { recursive: true, force: true });
    fs.cpSync(sourceModules, targetModules, { recursive: true, dereference: true });
    console.log(`  • 실시간 서버 의존성 복사 완료 → ${targetModules}`);
  } else {
    console.warn(
      "  • 실시간 서버 node_modules를 찾지 못했습니다. npm --prefix realtime-server install 후 다시 빌드하세요."
    );
  }

  // --- 2. ad-hoc 재서명 (macOS 전용) ---
  if (context.electronPlatformName !== "darwin") return;

  const signScript = path.resolve(
    context.packager.projectDir,
    "..",
    "scripts",
    "sign-mac.sh"
  );

  if (!fs.existsSync(signScript)) {
    console.warn("  • 서명 스크립트를 찾지 못해 재서명을 건너뜁니다.");
    return;
  }

  try {
    execFileSync("bash", [signScript, appPath], { stdio: "inherit" });
  } catch (error) {
    console.error(`  • 재서명 실패: ${error.message}`);
    throw error;
  }
};
