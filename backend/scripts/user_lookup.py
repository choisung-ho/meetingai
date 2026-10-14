from pathlib import Path
import sys

from fastapi import Depends, FastAPI, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session, joinedload

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.api.auth import build_token_payload
from app.api.dependencies import (
    WORKSPACE_ACCESS_ROLES,
    WORKSPACE_ADMIN_ROLES,
    WORKSPACE_MEMBER_ACTION_ROLES,
    WORKSPACE_ROLE_HIERARCHY,
)
from app.db.database import get_db
from app.models.auth import Auth
from app.models.workspace_member import WorkspaceMember

app = FastAPI(
    title="User Lookup Tool",
    description="Standalone DB user lookup page for local development.",
)


def format_roles(roles: set[str]) -> str:
    return ", ".join(sorted(roles, key=lambda role: WORKSPACE_ROLE_HIERARCHY.get(role, 0), reverse=True))


def get_highest_workspace_role(user: Auth) -> str | None:
    roles = [member.role for member in user.workspace_members]
    if not roles:
        return None
    return max(roles, key=lambda role: WORKSPACE_ROLE_HIERARCHY.get(role, 0))


def serialize_user(user: Auth) -> dict:
    token_payload = build_token_payload(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "birth_date": user.birth_date.isoformat() if user.birth_date else None,
        "password_hash": user.password_hash,
        "organization_team_name": user.organization_team_name,
        "terms_agreed": user.terms_agreed,
        "terms_agreed_at": user.terms_agreed_at.isoformat() if user.terms_agreed_at else None,
        "terms_version": user.terms_version,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "jwt_role": token_payload["role"],
        "highest_workspace_role": get_highest_workspace_role(user),
        "role_rule_description": "권한 판단 기준은 JWT role이 아니라 workspace_members.role입니다.",
        "role_policy": {
            "access_roles": format_roles(WORKSPACE_ACCESS_ROLES),
            "member_action_roles": format_roles(WORKSPACE_MEMBER_ACTION_ROLES),
            "admin_action_roles": format_roles(WORKSPACE_ADMIN_ROLES),
            "hierarchy": ", ".join(
                f"{role}:{rank}"
                for role, rank in sorted(WORKSPACE_ROLE_HIERARCHY.items(), key=lambda item: item[1], reverse=True)
            ),
        },
        "workspace_roles": [
            {
                "workspace_id": member.workspace_id,
                "workspace_name": member.workspace.name if member.workspace else None,
                "role": member.role,
                "member_created_at": member.created_at.isoformat() if member.created_at else None,
            }
            for member in user.workspace_members
        ],
    }


@app.get("/", response_class=HTMLResponse)
@app.get("/user-lookup", response_class=HTMLResponse)
def user_lookup_page():
    return """
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>사용자 정보 조회</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --line: #d9e0ea;
      --accent: #1769aa;
      --accent-dark: #0f4d7d;
      --ok: #0f7b55;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 40px 0;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      letter-spacing: 0;
    }
    .lead {
      margin: 0 0 24px;
      color: var(--muted);
      line-height: 1.55;
    }
    .search {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      padding: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 10px 24px rgba(16, 24, 40, 0.06);
    }
    input {
      width: 100%;
      height: 44px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 12px;
      font-size: 15px;
      color: var(--text);
      background: #fff;
    }
    button {
      height: 44px;
      border: 0;
      border-radius: 6px;
      padding: 0 18px;
      background: var(--accent);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    button:hover { background: var(--accent-dark); }
    .status {
      min-height: 24px;
      margin: 18px 0 12px;
      color: var(--muted);
      font-size: 14px;
    }
    .grid {
      display: grid;
      gap: 14px;
    }
    .user-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
    }
    .name {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e6f4ee;
      color: var(--ok);
      font-size: 13px;
      font-weight: 800;
      white-space: nowrap;
    }
    dl {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 0;
      margin: 0;
    }
    dt, dd {
      min-width: 0;
      padding: 12px 18px;
      border-bottom: 1px solid var(--line);
      line-height: 1.45;
    }
    dt {
      color: var(--muted);
      font-weight: 700;
      background: #fafbfe;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
    }
    .workspace {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .workspace span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 9px;
      background: #fff;
      font-size: 13px;
    }
    .error { color: var(--danger); }
    @media (max-width: 700px) {
      main { width: min(100% - 24px, 1120px); padding-top: 24px; }
      .search { grid-template-columns: 1fr; }
      button { width: 100%; }
      .card-head { align-items: flex-start; flex-direction: column; }
      dl { grid-template-columns: 1fr; }
      dt { border-bottom: 0; padding-bottom: 4px; }
      dd { padding-top: 4px; }
    }
  </style>
</head>
<body>
  <main>
    <h1>사용자 정보 조회</h1>
    <p class="lead">이름을 입력하면 DB의 auth 사용자 정보, 비밀번호 해시, 현재 권한 기준, 워크스페이스 role을 조회합니다.</p>
    <form class="search" id="searchForm">
      <input id="nameInput" name="name" autocomplete="off" placeholder="예: 홍길동" />
      <button type="submit">검색</button>
    </form>
    <div class="status" id="status">검색어를 입력해주세요.</div>
    <section class="grid" id="results"></section>
  </main>
  <script>
    const form = document.getElementById("searchForm");
    const input = document.getElementById("nameInput");
    const statusEl = document.getElementById("status");
    const resultsEl = document.getElementById("results");

    const escapeHtml = (value) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

    const text = (value) => {
      if (value === null || value === undefined || value === "") return "-";
      if (typeof value === "boolean") return value ? "동의" : "미동의";
      return escapeHtml(value);
    };

    const field = (label, value, className = "") => `
      <dt>${label}</dt>
      <dd class="${className}">${text(value)}</dd>
    `;

    const rawField = (label, value) => `
      <dt>${label}</dt>
      <dd>${value}</dd>
    `;

    const renderUser = (user) => {
      const roles = user.workspace_roles.length
        ? user.workspace_roles.map((item) => (
          `<span>${text(item.workspace_name)} (#${item.workspace_id}) · ${text(item.role)}</span>`
        )).join("")
        : "<span>-</span>";

      return `
        <article class="user-card">
          <div class="card-head">
            <h2 class="name">${text(user.name)}</h2>
            <span class="badge">${text(user.highest_workspace_role || user.jwt_role)}</span>
          </div>
          <dl>
            ${field("사용자 ID", user.id)}
            ${field("이메일", user.email)}
            ${field("비밀번호 해시", user.password_hash, "mono")}
            ${field("JWT role", user.jwt_role)}
            ${field("최상위 workspace role", user.highest_workspace_role)}
            ${field("권한 기준", user.role_rule_description)}
            ${field("조회 가능 role", user.role_policy.access_roles)}
            ${field("작업 가능 role", user.role_policy.member_action_roles)}
            ${field("관리 가능 role", user.role_policy.admin_action_roles)}
            ${field("role 계층", user.role_policy.hierarchy)}
            ${rawField("워크스페이스 role", `<div class="workspace">${roles}</div>`)}
            ${field("생년월일", user.birth_date)}
            ${field("조직/팀", user.organization_team_name)}
            ${field("약관 동의", user.terms_agreed)}
            ${field("약관 버전", user.terms_version)}
            ${field("약관 동의 시각", user.terms_agreed_at)}
            ${field("생성일", user.created_at)}
            ${field("수정일", user.updated_at)}
          </dl>
        </article>
      `;
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      resultsEl.innerHTML = "";

      if (!name) {
        statusEl.textContent = "검색할 이름을 입력해주세요.";
        return;
      }

      statusEl.textContent = "조회 중...";
      try {
        const response = await fetch(`/user-lookup/search?name=${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error("조회에 실패했습니다.");
        const payload = await response.json();
        const users = payload.data.users;
        statusEl.textContent = `${users.length}명의 사용자를 찾았습니다.`;
        resultsEl.innerHTML = users.map(renderUser).join("");
      } catch (error) {
        statusEl.innerHTML = `<span class="error">${error.message}</span>`;
      }
    });
  </script>
</body>
</html>
"""


@app.get("/user-lookup/search")
def search_users(
    name: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    users = (
        db.query(Auth)
        .options(joinedload(Auth.workspace_members).joinedload(WorkspaceMember.workspace))
        .filter(Auth.name.ilike(f"%{name.strip()}%"))
        .order_by(Auth.id.asc())
        .limit(50)
        .all()
    )

    return {
        "status": "success",
        "data": {
            "count": len(users),
            "users": [serialize_user(user) for user in users],
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
