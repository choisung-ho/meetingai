from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from app.core.security import create_access_token

app = FastAPI()

# 로그인 요청 데이터 모델
class LoginRequest(BaseModel):
    user_id: str
    password: str

@app.post("/login")
async def login(request: LoginRequest):
    # 1. 원래는 여기서 DB를 조회해 비밀번호를 확인해야 합니다. (성호 님 담당)
    # 여기서는 테스트를 위해 아이디가 'admin'이면 통과한다고 가정합니다.
    if request.user_id == "admin" and request.password == "password123":
        
        # 2. 로그인 성공 시, 한결님이 정의한 보안 규격(Phase 1)에 맞춰 데이터 준비
        user_data = {
            "sub": request.user_id,    # 사용자 ID
            "role": "admin"            # 유저 권한
        }
        
        # 3. 보안 엔진을 통해 토큰 발급
        access_token = create_access_token(data=user_data)
        
        return {
            "access_token": access_token,
            "token_type": "bearer"
        }
    
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 일치하지 않습니다."
        )
    

