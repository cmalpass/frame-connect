/**
 * Error Handling Middleware
 * 
 * Global Express error handler and async wrapper.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError, formatErrorResponse, isOperationalError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Global error handling middleware
 * Must be registered last in the middleware chain
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    const requestId = req.headers['x-request-id'] || 'unknown';

    // Log error with context
    const logContext = {
        requestId,
        method: req.method,
        path: req.path,
        error: err.message,
        stack: err.stack,
    };

    if (isOperationalError(err)) {
        logger.warn(logContext, 'Operational error');
    } else {
        logger.error(logContext, 'Unexpected error');
    }

    // Format and send response
    const { error, details, statusCode } = formatErrorResponse(err);

    // Don't expose internal errors in production
    const isProduction = process.env.NODE_ENV === 'production';
    const safeDetails = isProduction && statusCode === 500 ? undefined : details;

    res.status(statusCode).json({
        error: statusCode === 500 && isProduction ? 'Internal server error' : error,
        details: safeDetails,
        requestId,
    });
}

/**
 * 404 Not Found handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json({
        error: `Route ${req.method} ${req.path} not found`,
    });
}

/**
 * Wrapper to catch async errors in route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Request timeout middleware
 * Aborts request if it takes too long
 */
export function requestTimeout(timeoutMs: number = 30000) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                logger.warn(
                    { method: req.method, path: req.path },
                    `Request timeout after ${timeoutMs}ms`
                );
                res.status(504).json({ error: 'Request timeout' });
            }
        }, timeoutMs);

        res.on('finish', () => clearTimeout(timeout));
        res.on('close', () => clearTimeout(timeout));

        next();
    };
}

/**
 * Request ID middleware
 * Adds a unique ID to each request for tracing
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
}
