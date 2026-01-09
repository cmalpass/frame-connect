/**
 * API Validation Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
    createDeviceSchema,
    updateDeviceSchema,
    createSourceSchema,
    createMappingSchema,
    updateMappingSchema,
    deletePhotosSchema,
    filenameSchema,
} from '../api/schemas.js';

describe('API Validation Schemas', () => {
    describe('createDeviceSchema', () => {
        it('should validate a valid device', () => {
            const result = createDeviceSchema.safeParse({
                name: 'Living Room Frame',
                serial: '192.168.1.100:5555',
                connectionType: 'network',
                networkAddress: '192.168.1.100',
                networkPort: 5555,
            });
            expect(result.success).toBe(true);
        });

        it('should reject empty name', () => {
            const result = createDeviceSchema.safeParse({
                name: '',
                serial: '192.168.1.100:5555',
                connectionType: 'network',
            });
            expect(result.success).toBe(false);
        });

        it('should reject invalid connection type', () => {
            const result = createDeviceSchema.safeParse({
                name: 'Test',
                serial: 'abc123',
                connectionType: 'bluetooth',
            });
            expect(result.success).toBe(false);
        });

        it('should apply default devicePath', () => {
            const result = createDeviceSchema.safeParse({
                name: 'Test Frame',
                serial: 'abc123',
                connectionType: 'usb',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.devicePath).toBe('/sdcard/DCIM/Frameo');
            }
        });

        it('should reject invalid IP address', () => {
            const result = createDeviceSchema.safeParse({
                name: 'Test',
                serial: 'abc123',
                connectionType: 'network',
                networkAddress: 'not-an-ip',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('createMappingSchema', () => {
        it('should validate a valid mapping', () => {
            const result = createMappingSchema.safeParse({
                sourceId: '550e8400-e29b-41d4-a716-446655440000',
                deviceId: '550e8400-e29b-41d4-a716-446655440001',
                syncMode: 'mirror',
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid UUID for sourceId', () => {
            const result = createMappingSchema.safeParse({
                sourceId: 'not-a-uuid',
                deviceId: '550e8400-e29b-41d4-a716-446655440001',
            });
            expect(result.success).toBe(false);
        });

        it('should validate cron expressions', () => {
            const result = createMappingSchema.safeParse({
                sourceId: '550e8400-e29b-41d4-a716-446655440000',
                deviceId: '550e8400-e29b-41d4-a716-446655440001',
                schedule: '0 * * * *', // Every hour
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid cron expressions', () => {
            const result = createMappingSchema.safeParse({
                sourceId: '550e8400-e29b-41d4-a716-446655440000',
                deviceId: '550e8400-e29b-41d4-a716-446655440001',
                schedule: 'invalid-cron',
            });
            expect(result.success).toBe(false);
        });

        it('should apply default syncMode', () => {
            const result = createMappingSchema.safeParse({
                sourceId: '550e8400-e29b-41d4-a716-446655440000',
                deviceId: '550e8400-e29b-41d4-a716-446655440001',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.syncMode).toBe('add_only');
            }
        });
    });

    describe('deletePhotosSchema', () => {
        it('should validate array of filenames', () => {
            const result = deletePhotosSchema.safeParse({
                photos: ['photo1.jpg', 'photo2.png'],
            });
            expect(result.success).toBe(true);
        });

        it('should reject empty array', () => {
            const result = deletePhotosSchema.safeParse({
                photos: [],
            });
            expect(result.success).toBe(false);
        });

        it('should reject missing photos field', () => {
            const result = deletePhotosSchema.safeParse({});
            expect(result.success).toBe(false);
        });
    });

    describe('filenameSchema', () => {
        it('should validate normal filenames', () => {
            const result = filenameSchema.safeParse('photo.jpg');
            expect(result.success).toBe(true);
        });

        it('should reject path traversal attempts', () => {
            const result = filenameSchema.safeParse('../etc/passwd');
            expect(result.success).toBe(false);
        });

        it('should reject absolute paths', () => {
            const result = filenameSchema.safeParse('/etc/passwd');
            expect(result.success).toBe(false);
        });

        it('should reject backslash paths', () => {
            const result = filenameSchema.safeParse('..\\windows\\system32');
            expect(result.success).toBe(false);
        });
    });

    describe('updateMappingSchema', () => {
        it('should allow partial updates', () => {
            const result = updateMappingSchema.safeParse({
                isActive: false,
            });
            expect(result.success).toBe(true);
        });

        it('should allow nullable schedule', () => {
            const result = updateMappingSchema.safeParse({
                schedule: null,
            });
            expect(result.success).toBe(true);
        });
    });
});
