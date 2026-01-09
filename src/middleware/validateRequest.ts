/**
 * Request Validation Middleware
 * 
 * Express middleware for validating request bodies, params, and queries using Zod schemas.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Creates a validation middleware for a specific request part
 */
export function validate(schema: ZodSchema, part: RequestPart = 'body') {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = schema.parse(req[part]);
            // Replace with parsed/coerced data
            req[part] = data;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const details = error.errors.map((e) => ({
                    field: e.path.join('.'),
                    message: e.message,
                }));

                logger.debug({ errors: details }, 'Validation failed');

                return res.status(400).json({
                    error: 'Validation failed',
                    details,
                });
            }
            next(error);
        }
    };
}

/**
 * Validates request body
 */
export function validateBody(schema: ZodSchema) {
    return validate(schema, 'body');
}

/**
 * Validates query parameters
 */
export function validateQuery(schema: ZodSchema) {
    return validate(schema, 'query');
}

/**
 * Validates route parameters
 */
export function validateParams(schema: ZodSchema) {
    return validate(schema, 'params');
}

/**
 * Sanitize filename to prevent path traversal attacks
 */
export function sanitizeFilename(filename: string): string {
    // Remove any path separators and parent directory references
    return filename
        .replace(/\.\./g, '')
        .replace(/[\/\\]/g, '')
        .trim();
}

/**
 * Middleware to sanitize filename parameter
 */
export function sanitizeFilenameParam(paramName: string = 'filename') {
    return (req: Request, res: Response, next: NextFunction) => {
        const filename = req.params[paramName];
        if (filename) {
            const sanitized = sanitizeFilename(filename);
            if (sanitized !== filename) {
                logger.warn(
                    { original: filename, sanitized },
                    'Potentially malicious filename detected and sanitized'
                );
            }
            req.params[paramName] = sanitized;
        }
        next();
    };
}
