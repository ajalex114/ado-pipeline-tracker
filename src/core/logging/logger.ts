import type { LogLevel } from '@shared/types';

/**
 * Privacy-safe structured logger.
 *
 * Design goals (per project Copilot instructions):
 *  - Structured, action-oriented output for troubleshooting.
 *  - Never emit sensitive information (tokens, cookies, auth headers, PII).
 *    Callers pass only non-sensitive metadata; a defensive redactor strips
 *    common secret-bearing keys as a second line of defense.
 */

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Keys whose values must never be logged, matched case-insensitively. */
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|pat|apikey|api_key|credential|bearer)/i;

const REDACTED = '[redacted]';

export type LogContext = Record<string, unknown>;

/** Recursively redacts sensitive keys from a shallow-ish context object. */
export function redact(context: LogContext | undefined): LogContext | undefined {
  if (!context) return context;
  const out: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redact(value as LogContext);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(scope: string): Logger;
}

class ConsoleLogger implements Logger {
  constructor(
    private readonly scope: string,
    private readonly minLevel: LogLevel,
  ) {}

  private emit(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...(context ? { context: redact(context) } : {}),
    };
    const line = JSON.stringify(entry);
    // eslint-disable-next-line no-console
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  debug(message: string, context?: LogContext): void {
    this.emit('debug', message, context);
  }
  info(message: string, context?: LogContext): void {
    this.emit('info', message, context);
  }
  warn(message: string, context?: LogContext): void {
    this.emit('warn', message, context);
  }
  error(message: string, context?: LogContext): void {
    this.emit('error', message, context);
  }
  child(scope: string): Logger {
    return new ConsoleLogger(`${this.scope}:${scope}`, this.minLevel);
  }
}

export function createLogger(scope: string, minLevel: LogLevel = 'info'): Logger {
  return new ConsoleLogger(scope, minLevel);
}
