from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.db.database import SessionLocal
from app.models import Meeting, WorkspaceMember
from app.websocket.manager import connection_manager

router = APIRouter()


@router.websocket("/ws/meetings/{meeting_id}")
async def meeting_events(websocket: WebSocket, meeting_id: int):
    token = websocket.query_params.get("token")
    payload = decode_access_token(token) if token else None
    try:
        user_id = int(payload.get("sub")) if payload else None
    except (TypeError, ValueError):
        user_id = None

    with SessionLocal() as db:
        meeting = db.get(Meeting, meeting_id)
        member = (
            db.query(WorkspaceMember)
            .filter(
                WorkspaceMember.workspace_id == meeting.workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.role.in_(("MEMBER", "ADMIN", "OWNER")),
            )
            .first()
            if meeting is not None and user_id is not None
            else None
        )
    if member is None:
        await websocket.close(code=1008, reason="Unauthorized meeting access")
        return

    await connection_manager.connect(meeting_id, websocket)
    await websocket.send_json({"type": "connection.ready", "meeting_id": meeting_id})
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await connection_manager.disconnect(meeting_id, websocket)
