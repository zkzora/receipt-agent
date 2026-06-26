import { pino } from 'pino';
import { config } from './config.js';

/**
 * Single shared structured logger. In dev set DEV_PRETTY_LOGS=1 for human-readable
 * output (requires pino-pretty, a devDependency); in prod it emits JSON lines.
 */
export const logger = pino({
  level: config.runtime.logLevel,
  base: { svc: 'receipt-agent' },
  ...(config.runtime.prettyLogs
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,svc' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
