/**
 * Test Setup
 * 
 * This file runs before all tests to set up the test environment.
 */

import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test database instance
let testDb: Database.Database;

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.PHOTOS_PATH = '/tmp/frameo-test-photos';
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests

beforeAll(() => {
    // Create in-memory database
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');

    // Load schema
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    testDb.exec(schema);
});

afterAll(() => {
    testDb?.close();
});

beforeEach(() => {
    // Clear tables between tests
    const tables = ['sync_logs', 'synced_photos', 'sync_mappings', 'sources', 'devices'];
    for (const table of tables) {
        try {
            testDb.exec(`DELETE FROM ${table}`);
        } catch {
            // Table might not exist, ignore
        }
    }
});

// Export for use in tests
export { testDb };

/**
 * Test factory utilities
 */
export const testFactories = {
    createDevice(overrides = {}) {
        return {
            id: crypto.randomUUID(),
            name: 'Test Device',
            serial: '192.168.1.100:5555',
            connectionType: 'network' as const,
            networkAddress: '192.168.1.100',
            networkPort: 5555,
            devicePath: '/sdcard/DCIM/Frameo',
            isActive: true,
            ...overrides,
        };
    },

    createSource(overrides = {}) {
        return {
            id: crypto.randomUUID(),
            name: 'Test Source',
            type: 'local_folder' as const,
            config: { folderPath: '/tmp/test-photos' },
            isActive: true,
            ...overrides,
        };
    },

    createMapping(overrides = {}) {
        return {
            id: crypto.randomUUID(),
            sourceId: crypto.randomUUID(),
            deviceId: crypto.randomUUID(),
            syncMode: 'add_only' as const,
            isActive: true,
            ...overrides,
        };
    },
};

/**
 * Mock utilities
 */
export const mockAdbService = {
    listDevices: vi.fn().mockResolvedValue([]),
    shell: vi.fn().mockResolvedValue(''),
    pushFile: vi.fn().mockResolvedValue({ success: true, devicePath: '/test/path' }),
    pullFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(true),
    listFiles: vi.fn().mockResolvedValue([]),
    isDeviceReady: vi.fn().mockResolvedValue(true),
    getStorageInfo: vi.fn().mockResolvedValue({ total: 1000000, used: 500000, available: 500000 }),
    connectNetwork: vi.fn().mockResolvedValue('192.168.1.100:5555'),
    broadcastMediaScan: vi.fn().mockResolvedValue(undefined),
};

// Reset mocks between tests
beforeEach(() => {
    vi.clearAllMocks();
});
