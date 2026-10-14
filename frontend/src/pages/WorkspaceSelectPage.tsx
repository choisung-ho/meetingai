/**
 * 파일 역할: 워크스페이스 선택 화면 UI 컴포넌트입니다.
 * - 사용자가 입력한 workspaceId를 Container의 actions로 전달합니다.
 * - API/WebSocket/Zustand 로직은 직접 다루지 않습니다.
 */

import { useState } from "react";
import type { WorkspaceSelectPageProps } from "../types/meeting.types";

export function WorkspaceSelectPage({
    collaboration,
    workspace,
    state,
    actions,
}: WorkspaceSelectPageProps) {
    const [workspaceIdInput, setWorkspaceIdInput] = useState("");
    const [inputError, setInputError] = useState<string | null>(null);

    /**
     * 입력값 검증 후 Container로 workspaceId 전달
     */
    const handleEnterWorkspace = () => {
        const trimmedWorkspaceId = workspaceIdInput.trim();

        if (!trimmedWorkspaceId) {
            setInputError("workspaceId를 입력해야 합니다.");
            return;
        }

        setInputError(null);
        actions.enterWorkspace(trimmedWorkspaceId);
    };

    return (
        <main>
            <h1>워크스페이스 선택</h1>

            <section>
                <p>WebSocket 상태: {collaboration.status}</p>
                <p>연결 여부: {state.isConnected ? "연결됨" : "연결 안 됨"}</p>
                <p>
                    사용자 등록:{" "}
                    {collaboration.isUserRegistered ? "등록 완료" : "등록 대기 중"}
                </p>
                <p>
                    현재 사용자:{" "}
                    {collaboration.currentUser?.name ??
                        collaboration.currentUser?.userId ??
                        "미등록"}
                </p>

                {collaboration.errorMessage && <p>{collaboration.errorMessage}</p>}
            </section>

            <section>
                <label htmlFor="workspaceId">workspaceId</label>
                <input
                    id="workspaceId"
                    value={workspaceIdInput}
                    onChange={(event) => setWorkspaceIdInput(event.target.value)}
                    placeholder="입장할 workspaceId 입력"
                />

                {inputError && <p>{inputError}</p>}
                {workspace.errorMessage && <p>{workspace.errorMessage}</p>}

                <button
                    onClick={handleEnterWorkspace}
                    disabled={!collaboration.isUserRegistered || state.isJoining}
                >
                    {state.isJoining ? "입장 중..." : "워크스페이스 입장"}
                </button>
            </section>

            <section>
                {/* 개발 테스트용 버튼. 최종 UI에서는 제거 가능 */}
                <button onClick={actions.reconnectSocket}>재연결</button>
                <button onClick={actions.pingSocket}>PING</button>
                <button onClick={actions.disconnectSocket}>연결 해제</button>
            </section>
        </main>
    );
}