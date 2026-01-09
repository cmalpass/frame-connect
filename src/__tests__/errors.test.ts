/**
 * Error Handling Tests
 */

import { describe, it, expect } from 'vitest';
import {
    AppError,
    NotFoundError,
    ValidationError,
    AdbError,
    SyncError,
    isOperationalError,
    formatErrorResponse,
} from '../utils/errors.js';

describe('Custom Errors', () => {
    describe('AppError', () => {
        it('should create error with default values', () => {
            const error = new AppError('Test error');
            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(500);
            expect(error.isOperational).toBe(true);
        });

        it('should accept custom status code', () => {
            const error = new AppError('Bad request', 400);
            expect(error.statusCode).toBe(400);
        });

        it('should store details', () => {
            const error = new AppError('Error with details', 400, true, { field: 'name' });
            expect(error.details).toEqual({ field: 'name' });
        });
    });

    describe('NotFoundError', () => {
        it('should format message with ID', () => {
            const error = new NotFoundError('Device', 'abc123');
            expect(error.message).toBe("Device with ID 'abc123' not found");
            expect(error.statusCode).toBe(404);
        });

        it('should format message without ID', () => {
            const error = new NotFoundError('Device');
            expect(error.message).toBe('Device not found');
        });
    });

    describe('ValidationError', () => {
        it('should have 400 status', () => {
            const error = new ValidationError('Invalid input');
            expect(error.statusCode).toBe(400);
        });
    });

    describe('AdbError', () => {
        it('should include ADB prefix', () => {
            const error = new AdbError('Connection failed', '192.168.1.100:5555');
            expect(error.message).toBe('ADB Error: Connection failed');
            expect(error.deviceSerial).toBe('192.168.1.100:5555');
            expect(error.statusCode).toBe(503);
        });
    });

    describe('SyncError', () => {
        it('should include Sync prefix', () => {
            const error = new SyncError('Mapping failed', 'mapping-123');
            expect(error.message).toBe('Sync Error: Mapping failed');
            expect(error.mappingId).toBe('mapping-123');
            expect(error.statusCode).toBe(500);
        });
    });

    describe('isOperationalError', () => {
        it('should return true for AppError', () => {
            const error = new AppError('Test');
            expect(isOperationalError(error)).toBe(true);
        });

        it('should return false for regular Error', () => {
            const error = new Error('Test');
            expect(isOperationalError(error)).toBe(false);
        });

        it('should return false for non-operational AppError', () => {
            const error = new AppError('Test', 500, false);
            expect(isOperationalError(error)).toBe(false);
        });
    });

    describe('formatErrorResponse', () => {
        it('should format AppError', () => {
            const error = new NotFoundError('Device', '123');
            const response = formatErrorResponse(error);
            expect(response).toEqual({
                error: "Device with ID '123' not found",
                details: undefined,
                statusCode: 404,
            });
        });

        it('should format regular Error', () => {
            const error = new Error('Something went wrong');
            const response = formatErrorResponse(error);
            expect(response).toEqual({
                error: 'Something went wrong',
                statusCode: 500,
            });
        });

        it('should handle unknown error types', () => {
            const response = formatErrorResponse('string error');
            expect(response).toEqual({
                error: 'An unexpected error occurred',
                statusCode: 500,
            });
        });

        it('should include details when present', () => {
            const error = new ValidationError('Invalid', { field: 'name' });
            const response = formatErrorResponse(error);
            expect(response.details).toEqual({ field: 'name' });
        });
    });
});
