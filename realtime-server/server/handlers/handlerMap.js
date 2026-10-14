// 하위 호환성 유지: HandlerRegistry에서 handlerMap을 re-export한다.
const { handlerMap } = require('./HandlerRegistry');
module.exports = { handlerMap };
