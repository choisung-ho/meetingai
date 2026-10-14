#!/bin/bash
# ============================================================
# macOS 앱(.dmg) 빌드
# ============================================================
# 왜 별도 스크립트인가:
#   이 프로젝트는 iCloud로 동기화되는 Desktop 폴더 안에 있다.
#   그 안에서 앱을 빌드하면 macOS가 번들 파일마다
#   com.apple.FinderInfo / com.apple.fileprovider 확장 속성을 계속 붙이고,
#   codesign은 이를 "detritus"로 판단해 서명을 거부한다.
#   서명이 없으면 Apple Silicon에서 앱이 SIGTRAP으로 즉시 종료된다.
#
#   따라서 동기화 대상이 아닌 경로에서 빌드한 뒤 결과물만 가져온다.
#
# 사용법:
#   ./scripts/build-mac.sh
# ============================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${MEETING_AI_BUILD_DIR:-$HOME/.meeting-ai-build}"
OUTPUT_DIR="$PROJECT_ROOT/dist-app"

# 아래 정리 명령이 임의 경로를 삭제하지 않도록 빌드 루트는
# 사용자 홈의 전용 디렉터리로 제한한다.
case "$BUILD_ROOT" in
  "$HOME/.meeting-ai-build"|"$HOME/.meeting-ai-build/"*) ;;
  *) echo "MEETING_AI_BUILD_DIR는 $HOME/.meeting-ai-build 아래로만 지정할 수 있습니다." >&2; exit 1 ;;
esac

WORK_ROOT="$(mktemp -d /private/tmp/meeting-ai-build.XXXXXX)"

echo "프로젝트: $PROJECT_ROOT"
echo "빌드 경로: $BUILD_ROOT  (iCloud 동기화 제외 위치)"
echo

echo "[1/5] iCloud 동기화 폴더 밖에 빌드용 소스 준비"
# Desktop/iCloud 경로에서는 FileProvider가 dist/node_modules 파일의
# 삭제·교체를 차단할 수 있다. 소스는 임시 외부 경로로 복사하고 무거운
# node_modules만 원본을 가리키는 symlink로 재사용한다(번들에는 afterPack이
# realtime-server node_modules를 실제 파일로 복사한다).
rsync -rlt \
  --exclude '.git' \
  --exclude 'dist-app' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude 'realtime-server/node_modules' \
  --exclude 'backend/.env' \
  "$PROJECT_ROOT/" "$WORK_ROOT/"
ln -s "$PROJECT_ROOT/frontend/node_modules" "$WORK_ROOT/frontend/node_modules"
ln -s "$PROJECT_ROOT/realtime-server/node_modules" "$WORK_ROOT/realtime-server/node_modules"

echo "[2/5] 프론트엔드 빌드"
cd "$WORK_ROOT/frontend"
npm run build

echo
echo "[3/5] 실시간 서버 의존성 확인"
if [ ! -d "$WORK_ROOT/realtime-server/node_modules" ]; then
  echo "  의존성 설치 중..."
  npm --prefix "$WORK_ROOT/realtime-server" install --no-audit --no-fund
fi

echo
echo "[4/5] Electron 패키징"
mkdir -p "$BUILD_ROOT"
rm -rf "$BUILD_ROOT/mac-arm64" "$BUILD_ROOT"/*.dmg 2>/dev/null || true

npx electron-builder --mac --publish never \
  -c.directories.output="$BUILD_ROOT"

echo
echo "[5/5] 결과물 복사"
mkdir -p "$OUTPUT_DIR"
DMG_SOURCE="$(find "$BUILD_ROOT" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
if [[ -z "$DMG_SOURCE" ]]; then
  echo "빌드된 DMG를 찾을 수 없습니다: $BUILD_ROOT" >&2
  exit 1
fi

# 이전 산출물은 이름이 같은 경우에만 교체한다. iCloud/FileProvider가
# 일시적으로 삭제를 거부하면 기존 릴리즈를 보존하고 명확한 오류를 낸다.
DMG_TARGET="$OUTPUT_DIR/$(basename "$DMG_SOURCE")"
if ! cp "$DMG_SOURCE" "$DMG_TARGET"; then
  echo "DMG 복사에 실패했습니다. 동기화 폴더 권한을 확인하세요:" >&2
  echo "  원본: $DMG_SOURCE" >&2
  echo "  대상: $DMG_TARGET" >&2
  exit 1
fi

# 자동 업데이트/바이너리 검증에 사용하는 blockmap도 DMG와 함께 교체한다.
BLOCKMAP_SOURCE="${DMG_SOURCE}.blockmap"
if [[ -f "$BLOCKMAP_SOURCE" ]]; then
  if ! cp "$BLOCKMAP_SOURCE" "$DMG_TARGET.blockmap"; then
    echo "DMG blockmap 복사에 실패했습니다: $DMG_TARGET.blockmap" >&2
    exit 1
  fi
fi

echo
echo "=== 완료 ==="
echo "  앱  : $BUILD_ROOT/mac-arm64/MeetingAI.app"
echo "  DMG : $(ls "$OUTPUT_DIR"/*.dmg 2>/dev/null | head -1)"
echo
echo "설치한 앱은 iCloud 동기화 폴더 밖(예: /Applications)에 두어야"
echo "서명이 유지되어 정상 실행됩니다."
