/**
 * Custom Error Classes
 * 
 * Typed errors for consistent error handling across the application.
 */

/**
 * Base application error with status code
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly details?: unknown;

    constructor(
        message: string,
        statusCode: number = 500,
        isOperational: boolean = true,
        details?: unknown
    ) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Resource not found (404)
 */
export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found`;
        super(message, 404);
    }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 400, true, details);
    }
}

/**
 * ADB connection/operation error (503)
 */
export class AdbError extends AppError {
    public readonly deviceSerial?: string;

    constructor(message: string, deviceSerial?: string, details?: unknown) {
        super(`ADB Error: ${message}`, 503, true, details);
        this.deviceSerial = deviceSerial;
    }
}

/**
 * Sync operation error (500)
 */
export class SyncError extends AppError {
    public readonly mappingId?: string;

    constructor(message: string, mappingId?: string, details?: unknown) {
        super(`Sync Error: ${message}`, 500, true, details);
        this.mappingId = mappingId;
    }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
        super(message, 401);
    }
}

/**
 * Authorization error (403)
 */
export class ForbiddenError extends AppError {
    constructor(message: string = 'Access forbidden') {
        super(message, 403);
    }
}

/**
 * Rate limiting error (429)
 */
export class RateLimitError extends AppError {
    public readonly retryAfter?: number;

    constructor(message: string = 'Too many requests', retryAfter?: number) {
        super(message, 429);
        this.retryAfter = retryAfter;
    }
}

/**
 * Conflict error (409) - e.g., resource already exists
 */
export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409);
    }
}

/**
 * Check if an error is an operational (expected) error
 */
export function isOperationalError(error: unknown): boolean {
    if (error instanceof AppError) {
        return error.isOperational;
    }
    return false;
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: unknown): {
    error: string;
    details?: unknown;
    statusCode: number;
} {
    if (error instanceof AppError) {
        return {
            error: error.message,
            details: error.details,
            statusCode: error.statusCode,
        };
    }

    if (error instanceof Error) {
        return {
            error: error.message,
            statusCode: 500,
        };
    }

    return {
        error: 'An unexpected error occurred',
        statusCode: 500,
    };
}
