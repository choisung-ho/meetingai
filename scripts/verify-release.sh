#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_ROOT="${MEETING_AI_BUILD_DIR:-$HOME/.meeting-ai-build}"
DMG="${PROJECT_ROOT}/dist-app/MeetingAI-1.0.0-arm64.dmg"
APP="${BUILD_ROOT}/mac-arm64/MeetingAI.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "이 검증 스크립트는 macOS에서만 실행할 수 있습니다." >&2
  exit 2
fi

[[ -f "$DMG" ]] || { echo "DMG를 찾을 수 없습니다: $DMG" >&2; exit 1; }
[[ -d "$APP" ]] || { echo "빌드된 앱을 찾을 수 없습니다: $APP" >&2; exit 1; }

echo "[1/3] DMG 무결성 확인"
hdiutil verify "$DMG"

echo "[2/3] 앱 코드서명 확인"
codesign --verify --deep --strict "$APP"

echo "[3/3] Windows 산출물 확인"
if find "$PROJECT_ROOT/dist-app" -type f -name '*.exe' -print -quit | grep -q .; then
  echo "Windows .exe가 발견되었습니다. 요청 범위상 제거 후 다시 제출하세요." >&2
  exit 1
fi

echo "릴리즈 검증 완료: $DMG"
