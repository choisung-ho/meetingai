// ============================================================
// server/redis/redisClient.js  — 하위 호환성 어댑터
// ============================================================
// 기존 코드가 { redisClient, connectRedis } 형태로 import하던
// 방식을 유지하기 위한 어댑터 파일이다.
// 실제 구현은 RedisManager 클래스에 있다.
// ============================================================

const redisManager = require('./RedisManager');

// 기존 require('../redis/redisClient').redisClient 호출 호환
// RedisManager.getClient()를 Proxy로 래핑하여 동일하게 동작하도록 한다.
const redisClientProxy = new Proxy({}, {
  get(_target, prop) {
    const client = redisManager.getClient();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

// 기존 connectRedis() 호출 호환
async function connectRedis() {
  await redisManager.connect();
}

module.exports = {
  redisClient: redisClientProxy,
  connectRedis
};
