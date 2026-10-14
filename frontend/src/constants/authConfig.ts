/**
 * 로그인 방식 전환 설정
 *
 * true:
 * - 테스트 전용 mock 로그인 사용 (배포 빌드에서는 사용하지 않는다)
 *
 * false:
 * - FastAPI 서버 로그인 API 사용
 *
 * 운영/배포 기준은 항상 false다.
 */
export const USE_MOCK_AUTH = false;

/**
 * FastAPI 서버 Base URL
 *
 * .env의 VITE_API_BASE_URL로 덮어쓸 수 있고, 값이 없으면 로컬 통합 실행 기준으로 동작한다.
 * (통합 전에는 특정 개발 PC IP가 하드코딩되어 있어 다른 환경에서 전부 실패했다)
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
