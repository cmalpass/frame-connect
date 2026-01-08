import winston from 'winston';
import { config } from '../config/index.js';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
});

const winstonLogger = winston.createLogger({
    level: config.LOG_LEVEL,
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        new winston.transports.Console({
            format: combine(
                colorize(),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            ),
        }),
    ],
});

// Add file transport in production
if (config.NODE_ENV === 'production') {
    winstonLogger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error'
    }));
    winstonLogger.add(new winston.transports.File({
        filename: 'logs/combined.log'
    }));
}

type Meta = Record<string, unknown>;

/**
 * Logger wrapper that supports both:
 * - logger.info('message')
 * - logger.info({ key: value }, 'message')
 */
function createLogMethod(level: 'error' | 'warn' | 'info' | 'debug') {
    return (metaOrMessage: Meta | string, message?: string) => {
        if (typeof metaOrMessage === 'string') {
            winstonLogger[level](metaOrMessage);
        } else {
            winstonLogger[level](message || '', metaOrMessage);
        }
    };
}

export const logger = {
    error: createLogMethod('error'),
    warn: createLogMethod('warn'),
    info: createLogMethod('info'),
    debug: createLogMethod('debug'),
};
