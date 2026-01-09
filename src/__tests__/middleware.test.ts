/**
 * Middleware Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { sanitizeFilename, sanitizeFilenameParam } from '../middleware/validateRequest.js';

describe('Middleware', () => {
    describe('sanitizeFilename', () => {
        it('should pass through normal filenames', () => {
            expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
            expect(sanitizeFilename('my-photo_123.png')).toBe('my-photo_123.png');
        });

        it('should remove parent directory references', () => {
            expect(sanitizeFilename('../photo.jpg')).toBe('photo.jpg');
            expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd');
            expect(sanitizeFilename('..\\..\\windows')).toBe('windows');
        });

        it('should remove path separators', () => {
            expect(sanitizeFilename('/etc/passwd')).toBe('etcpasswd');
            expect(sanitizeFilename('path/to/file.jpg')).toBe('pathtofile.jpg');
            expect(sanitizeFilename('path\\to\\file.jpg')).toBe('pathtofile.jpg');
        });

        it('should handle empty string', () => {
            expect(sanitizeFilename('')).toBe('');
        });

        it('should trim whitespace', () => {
            expect(sanitizeFilename('  photo.jpg  ')).toBe('photo.jpg');
        });
    });

    describe('sanitizeFilenameParam', () => {
        it('should sanitize the filename parameter', () => {
            const middleware = sanitizeFilenameParam('filename');
            const req = {
                params: { filename: '../malicious.jpg' },
            } as unknown as Request;
            const res = {} as Response;
            const next = vi.fn() as NextFunction;

            middleware(req, res, next);

            expect(req.params.filename).toBe('malicious.jpg');
            expect(next).toHaveBeenCalled();
        });

        it('should handle missing parameter', () => {
            const middleware = sanitizeFilenameParam('filename');
            const req = { params: {} } as unknown as Request;
            const res = {} as Response;
            const next = vi.fn() as NextFunction;

            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });
    });
});
