#!/bin/bash
# ============================================================
# macOS 앱 ad-hoc 서명
# ============================================================
# 왜 필요한가:
#   Apple Silicon(arm64)은 서명이 없거나 깨진 앱을 실행하지 못하고
#   SIGTRAP(exit 133)으로 즉시 종료된다.
#   개발자 인증서가 없으면 electron-builder가 서명을 건너뛰는데,
#   번들 내용을 수정했으므로 Electron 원본 서명도 무효가 된다.
#
# 주의사항:
#   - 프로젝트가 iCloud Drive/Desktop 동기화 폴더 안에 있으면
#     com.apple.FinderInfo / fileprovider 확장 속성이 계속 붙는다.
#     codesign은 이를 "detritus"로 보고 거부하므로 서명 직전에 제거한다.
#   - node_modules/.bin의 심볼릭 링크는 번들 밖 절대경로를 가리켜
#     서명과 이식성을 모두 깨뜨리므로 제거한다(런타임에 불필요).
#
# 사용법:
#   ./scripts/sign-mac.sh "dist-app/mac-arm64/MeetingAI.app"
# ============================================================

set -euo pipefail

APP_PATH="${1:?사용법: sign-mac.sh <앱 경로>}"

if [ ! -d "$APP_PATH" ]; then
  echo "앱을 찾을 수 없습니다: $APP_PATH" >&2
  exit 1
fi

echo "[1/4] 서명을 방해하는 파일 정리"
# 번들 밖을 가리키는 심볼릭 링크 제거
find "$APP_PATH" -type d -name ".bin" -prune -exec rm -rf {} + 2>/dev/null || true
# 번들 안에 남은 깨진/외부 심볼릭 링크 제거
find "$APP_PATH" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
find "$APP_PATH" \( -name ".DS_Store" -o -name "._*" \) -delete 2>/dev/null || true

echo "[2/4] 기존 서명 제거"
find "$APP_PATH" -name "_CodeSignature" -type d -exec rm -rf {} + 2>/dev/null || true

echo "[3/4] 확장 속성 제거 (iCloud 동기화 속성 포함)"
xattr -cr "$APP_PATH" 2>/dev/null || true
# 디렉터리에 붙은 FinderInfo는 한 번에 지워지지 않는 경우가 있어 개별 처리한다.
find "$APP_PATH" -exec xattr -c {} \; 2>/dev/null || true

echo "[4/4] 서명 (안쪽 → 바깥쪽)"
# dylib / so
find "$APP_PATH/Contents/Frameworks" -type f \( -name "*.dylib" -o -name "*.so" \) -print0 2>/dev/null |
  while IFS= read -r -d '' file; do
    codesign --force --sign - "$file" >/dev/null 2>&1 || true
  done

# 헬퍼 앱
find "$APP_PATH/Contents/Frameworks" -maxdepth 1 -name "*.app" -print0 2>/dev/null |
  while IFS= read -r -d '' helper; do
    codesign --force --sign - "$helper" >/dev/null 2>&1 || true
  done

# 프레임워크
find "$APP_PATH/Contents/Frameworks" -maxdepth 1 -name "*.framework" -print0 2>/dev/null |
  while IFS= read -r -d '' framework; do
    codesign --force --sign - "$framework" >/dev/null 2>&1 || true
  done

# 앱 번들
codesign --force --sign - "$APP_PATH"

echo
echo "=== 서명 검증 ==="
if codesign --verify --strict "$APP_PATH" 2>&1; then
  echo "서명 정상"
else
  echo "서명 검증 실패" >&2
  exit 1
fi
