/**
 * API Request Validation Schemas
 * 
 * Zod schemas for validating all API request bodies.
 * These provide runtime type checking and helpful error messages.
 */

import { z } from 'zod';

// === Device Schemas ===

export const createDeviceSchema = z.object({
    name: z.string().min(1, 'Device name is required').max(100),
    serial: z.string().min(1, 'Device serial is required'),
    connectionType: z.enum(['usb', 'network'], {
        errorMap: () => ({ message: 'Connection type must be "usb" or "network"' }),
    }),
    networkAddress: z.string().ip().optional(),
    networkPort: z.number().int().min(1).max(65535).optional(),
    devicePath: z.string().min(1).default('/sdcard/DCIM/Frameo'),
});

export const updateDeviceSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    connectionType: z.enum(['usb', 'network']).optional(),
    networkAddress: z.string().ip().optional(),
    networkPort: z.number().int().min(1).max(65535).optional(),
    devicePath: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
});

// === Source Schemas ===

export const sourceConfigSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('local_folder'),
        folderPath: z.string().min(1, 'Folder path is required'),
    }),
    z.object({
        type: z.literal('google_photos'),
        albumId: z.string().optional(),
    }),
]);

export const createSourceSchema = z.object({
    name: z.string().min(1, 'Source name is required').max(100),
    type: z.enum(['local_folder', 'google_photos']),
    config: z.record(z.unknown()).optional(),
});

export const updateSourceSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    config: z.record(z.unknown()).optional(),
    isActive: z.boolean().optional(),
});

// === Sync Mapping Schemas ===

// Cron expression validation (basic - more complex validation in scheduler)
const cronExpressionSchema = z.string().regex(
    /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/,
    'Invalid cron expression format'
).optional();

export const createMappingSchema = z.object({
    sourceId: z.string().uuid('Invalid source ID format'),
    deviceId: z.string().uuid('Invalid device ID format'),
    syncMode: z.enum(['mirror', 'add_only']).default('add_only'),
    maxPhotos: z.number().int().min(1).max(10000).optional(),
    schedule: cronExpressionSchema,
});

export const updateMappingSchema = z.object({
    syncMode: z.enum(['mirror', 'add_only']).optional(),
    maxPhotos: z.number().int().min(1).max(10000).optional().nullable(),
    schedule: cronExpressionSchema.nullable(),
    isActive: z.boolean().optional(),
});

// === Photo Schemas ===

export const deletePhotosSchema = z.object({
    photos: z.array(z.string().min(1)).min(1, 'At least one photo filename is required'),
});

// Filename validation - prevent path traversal attacks
export const filenameSchema = z.string()
    .min(1)
    .max(255)
    .refine(
        (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
        'Filename cannot contain path separators or parent directory references'
    );

// === Query Parameter Schemas ===

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(1000).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

export const syncLogsQuerySchema = z.object({
    mappingId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(50),
});

// === Type Exports ===

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
export type CreateMappingInput = z.infer<typeof createMappingSchema>;
export type UpdateMappingInput = z.infer<typeof updateMappingSchema>;
export type DeletePhotosInput = z.infer<typeof deletePhotosSchema>;
