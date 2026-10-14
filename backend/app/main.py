from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from app.db.database import init_db
from app.db.database import engine
from app.api import ai_analysis, alerts, audio, auth, documents, issues, rag, realtime, stt_results, topics, utterances, workspaces
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.core.limiter import limiter
from app.core.logger import get_logger, sanitize_log_payload
from app.schemas.response import ApiResponse
from app.websocket import routes as websocket_routes
from app.services.pubsub_service import get_redis_client

from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text


logger = get_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AI Meeting Assistant Backend",
    description="FastAPI backend for AI-based meeting analysis and rediscussion detection",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)
app.state.limiter = limiter

auth_required = [Depends(get_current_user)]

app.include_router(issues.router, prefix="/issues", tags=["Issues"], dependencies=auth_required)
app.include_router(alerts.router, prefix="/alerts", tags=["Alerts"], dependencies=auth_required)
app.include_router(workspaces.router, tags=["Workspaces"], dependencies=auth_required)
app.include_router(documents.router, prefix="/documents", tags=["Documents"], dependencies=auth_required)
app.include_router(stt_results.router, prefix="/stt-results", tags=["STT Results"], dependencies=auth_required)
app.include_router(utterances.router, prefix="/utterances", tags=["Utterances"], dependencies=auth_required)
app.include_router(rag.router, prefix="/rag", tags=["RAG"], dependencies=auth_required)
app.include_router(topics.router, tags=["Topics"], dependencies=auth_required)
app.include_router(ai_analysis.router, tags=["AI Analysis"])
app.include_router(audio.router, tags=["Audio"])
app.include_router(realtime.router, prefix="/realtime", tags=["Realtime"])
app.include_router(websocket_routes.router, tags=["WebSocket"])
app.include_router(auth.router, tags=["Auth"])


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(
        "[ERROR] [HTTP] path=%s status_code=%s detail=%s",
        request.url.path,
        exc.status_code,
        exc.detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder({"status": "error", "message": exc.detail}),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(
        "[ERROR] [VALIDATION] path=%s errors=%s",
        request.url.path,
        sanitize_log_payload({"errors": exc.errors()}),
    )
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder(
            {"status": "error", "message": "Invalid request", "detail": exc.errors()}
        ),
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded):
    logger.warning("[ERROR] [RATE_LIMIT] path=%s detail=%s", request.url.path, exc.detail)
    return JSONResponse(
        status_code=429,
        content=jsonable_encoder({"status": "error", "message": "Too Many Requests"}),
        headers={"Retry-After": str(exc.retry_after)} if getattr(exc, "retry_after", None) else None,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "[ERROR] [UNHANDLED] path=%s method=%s",
        request.url.path,
        request.method,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal Server Error"},
    )


@app.get("/", response_model=ApiResponse[dict])
def root():
    return {
        "status": "success",
        "data": {"message": "AI Meeting Assistant Backend is running"},
    }

# CORS 설정 (프론트엔드에서 API 호출 시 필요)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", response_model=ApiResponse[dict])
def health_check():
    """프로세스·DB·Redis 의존성 상태를 확인하는 운영용 health endpoint."""
    checks = {"database": "ok", "redis": "ok"}
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        checks["database"] = "unavailable"
        logger.warning("[HEALTH] database check failed: %s", exc)

    try:
        get_redis_client().ping()
    except Exception as exc:
        checks["redis"] = "unavailable"
        logger.warning("[HEALTH] redis check failed: %s", exc)

    overall = "ok" if all(value == "ok" for value in checks.values()) else "degraded"
    return {
        "status": "success",
        "data": {
            "status": overall,
            "service": "fastapi-backend",
            "version": settings.APP_VERSION,
            "checks": checks,
        },
    }
