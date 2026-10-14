// ============================================================
// server/utils/logger.js
// ============================================================
// 역할:
//   레벨 기반 로그 출력을 담당한다. (debug / info / warn / error)
//   LOG_LEVEL 환경변수로 출력 레벨을 제어한다.
//
// SRP: 로그 포맷팅과 레벨 필터링만 담당.
//
// Input/Output 흐름:
//   logger.info('메시지')  → stdout
//   logger.error('메시지') → stderr
// ============================================================

/** 레벨 우선순위 */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
    constructor() {
        const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
        this._level = LEVELS[envLevel] ?? LEVELS.info;
    }

    _log(level, ...args) {
        if (LEVELS[level] < this._level) return;
        const ts = new Date().toISOString();
        const line = `[${ts}] [${level.toUpperCase()}] ${args.join(' ')}`;
        if (level === 'error' || level === 'warn') {
            process.stderr.write(line + '\n');
        } else {
            process.stdout.write(line + '\n');
        }
    }

    debug(...args) { this._log('debug', ...args); }
    info(...args) { this._log('info', ...args); }
    warn(...args) { this._log('warn', ...args); }
    error(...args) { this._log('error', ...args); }
}

module.exports = new Logger();
