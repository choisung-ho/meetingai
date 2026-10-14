import asyncio
import json
import os
import time

import httpx
import websockets
from dotenv import load_dotenv

load_dotenv()
FASTAPI = os.getenv("FASTAPI_URL", "http://127.0.0.1:8000")
NODE = "http://127.0.0.1:" + os.getenv("NODE_PORT", "3001")


async def receive_type(socket, event_type):
    for _ in range(10):
        event = json.loads(await asyncio.wait_for(socket.recv(), timeout=5))
        if event.get("type") == event_type:
            return event
    raise AssertionError(f"event not received: {event_type}")


async def main():
    marker = str(int(time.time() * 1000))
    email = f"phase3-{marker}@example.com"
    password = "Phase3!234"
    async with httpx.AsyncClient(timeout=10) as client:
        register = await client.post(
            f"{FASTAPI}/auth/register",
            json={
                "name": "Phase3 E2E",
                "email": email,
                "birth_date": "2000-01-01",
                "password": password,
                "password_confirm": password,
                "terms_agreed": True,
                "terms_version": "v1",
            },
        )
        register.raise_for_status()
        login = await client.post(f"{FASTAPI}/login", json={"email": email, "password": password})
        login.raise_for_status()
        auth = login.json()
        token = auth["access_token"]
        workspace_id = auth["defaultWorkspaceId"]
        headers = {"Authorization": f"Bearer {token}"}
        meeting_response = await client.post(
            f"{FASTAPI}/workspaces/{workspace_id}/meetings",
            headers=headers,
            json={"title": f"Phase3 E2E {marker}", "status": "READY"},
        )
        meeting_response.raise_for_status()
        meeting_id = meeting_response.json()["data"]["id"]

        ws_url = f"ws://127.0.0.1:{os.getenv('NODE_PORT', '3001')}/ws/meetings/{meeting_id}?token={token}"
        async with websockets.connect(ws_url) as socket:
            await receive_type(socket, "connection.ready")
            partial = await client.post(
                f"{NODE}/api/meetings/{meeting_id}/stt-chunks",
                headers=headers,
                json={"chunk_id": f"{marker}-partial", "text": "실시간 테스트 중", "is_final": False},
            )
            partial.raise_for_status()
            partial_event = await receive_type(socket, "utterance.partial")
            final = await client.post(
                f"{NODE}/api/meetings/{meeting_id}/stt-chunks",
                headers=headers,
                json={
                    "chunk_id": f"{marker}-final",
                    "text": "실시간 테스트가 완료되었습니다.",
                    "speaker_label": " SPEAKER_01 ",
                    "is_final": True,
                },
            )
            final.raise_for_status()
            final_data = final.json()["data"]
            final_event = await receive_type(socket, "utterance.created")
            assert final_event["utterance"]["speaker_label"] == "SPEAKER_01"
            assert final_data["analysis_status"] == "completed"
            await socket.send(json.dumps({"type": "event.ack", "event_id": final_event["event_id"]}))
            await receive_type(socket, "event.acknowledged")

            callback = await client.post(
                f"{NODE}/internal/analysis-results",
                headers={"X-Analysis-Secret": os.environ["ANALYSIS_CALLBACK_SECRET"]},
                json={
                    "meeting_id": meeting_id,
                    "stt_result_id": final_data["stt_result_id"],
                    "utterance_id": final_data["utterance_id"],
                    "chunk_id": f"{marker}-final",
                    "result": {"decision": "PENDING_PHASE4"},
                },
            )
            callback.raise_for_status()
            await receive_type(socket, "analysis.completed")

        replay_url = f"{ws_url}&last_event_id={partial_event['event_id']}"
        async with websockets.connect(replay_url) as replay_socket:
            await receive_type(replay_socket, "connection.ready")
            replayed = await receive_type(replay_socket, "utterance.created")
            assert replayed["replayed"] is True

        utterances = await client.get(
            f"{FASTAPI}/utterances/?stt_result_id={final_data['stt_result_id']}",
            headers=headers,
        )
        utterances.raise_for_status()
        assert len(utterances.json()["data"]) == 1
        print(
            json.dumps(
                {
                    "status": "success",
                    "meeting_id": meeting_id,
                    "partial_not_persisted": True,
                    "final_persisted": True,
                    "analysis_callback": True,
                    "websocket_ack": True,
                    "websocket_replay": True,
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    asyncio.run(main())
