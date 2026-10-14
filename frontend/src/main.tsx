import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "./app/styles/globals.css";

import { router } from "./app/router";
import { Toast } from "./shared/ui/Toast";

/**
 * 앱 시작 지점
 *
 * 현재 기능:
 * - React Router 기반 화면 이동 구조 연결
 * - 전역 Toast 마운트 (초대 성공 / 권한 변경 / 저장 실패 / 연결 복구 안내)
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <RouterProvider router={router} />
    <Toast />
  </>
);
