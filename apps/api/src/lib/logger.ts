/**
 * Minimal structured JSON logger. Never pass personal data or secrets as fields;
 * well-known sensitive keys are additionally redacted as a safety net.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|email|phone|name|totp/i;

export type LogFields = Record<string, unknown>;

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k) && k !== 'action' && k !== 'route') out[k] = '[redacted]';
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message, stack: v.stack };
    else out[k] = v;
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export function createLogger(level: Level = 'info', base: LogFields = {}): Logger {
  const write = (l: Level, msg: string, fields?: LogFields) => {
    if (ORDER[l] < ORDER[level]) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level: l,
      msg,
      ...base,
      ...(fields ? redact(fields) : {}),
    });
    if (l === 'error' || l === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (f) => createLogger(level, { ...base, ...f }),
  };
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};
