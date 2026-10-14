// 하위 호환성 유지: SchemaValidator 클래스의 정적 메서드를 함수 형태로 래핑한다.
const SchemaValidator = require('./SchemaValidator');

function validatePayloadBySchema(data, schema) {
  return SchemaValidator.validate(data, schema);
}

module.exports = { validatePayloadBySchema };
