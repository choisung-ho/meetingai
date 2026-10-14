// server/utils/jwtUtils.js
/*
jsonwebtoken 라이브러리를 사용하여 토큰의 서명을 확인합니다.
토큰이 유효하면 payload를 반환하고, 만료되었거나 위조된 토큰이면 null을 반환합니다.
*/
const jwt = require('jsonwebtoken');

const verifyToken = (token) => {
    try {
        // 성호 님과 공유하는 시크릿 키로 해독
        return jwt.verify(token, process.env.SECRET_KEY);
    } catch (error) {
        return null; // 만료되거나 위조된 토큰 처리
    }
};

module.exports = { verifyToken };