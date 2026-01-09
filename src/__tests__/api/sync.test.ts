/**
 * Sync API Route Tests
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import syncRouter from '../../api/sync.js';

// Mock the sync engine and scheduler
vi.mock('../../services/sync/index.js', () => ({
    syncEngine: {
        getMappings: vi.fn(() => []),
        getMapping: vi.fn(),
        createMapping: vi.fn(),
        updateMapping: vi.fn(),
        deleteMapping: vi.fn(),
        executeSync: vi.fn(),
        getSyncLogs: vi.fn(() => []),
    },
    syncScheduler: {
        scheduleMapping: vi.fn(),
        unscheduleMapping: vi.fn(),
        getScheduledTasks: vi.fn(() => []),
    },
}));

// Import after mocking
import { syncEngine, syncScheduler } from '../../services/sync/index.js';

const app = express();
app.use(express.json());
app.use('/sync', syncRouter);

describe('Sync API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /sync/mappings', () => {
        it('should return empty array when no mappings exist', async () => {
            vi.mocked(syncEngine.getMappings).mockReturnValue([]);

            const res = await request(app).get('/sync/mappings');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ mappings: [] });
        });

        it('should return all mappings', async () => {
            const mockMappings = [
                { id: '1', sourceId: 'src1', deviceId: 'dev1', syncMode: 'add_only', isActive: true },
                { id: '2', sourceId: 'src2', deviceId: 'dev2', syncMode: 'mirror', isActive: false },
            ];
            vi.mocked(syncEngine.getMappings).mockReturnValue(mockMappings as any);

            const res = await request(app).get('/sync/mappings');

            expect(res.status).toBe(200);
            expect(res.body.mappings).toHaveLength(2);
        });
    });

    describe('GET /sync/mappings/:id', () => {
        it('should return 404 for non-existent mapping', async () => {
            vi.mocked(syncEngine.getMapping).mockReturnValue(null);

            const res = await request(app).get('/sync/mappings/non-existent');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Mapping not found');
        });

        it('should return mapping by ID', async () => {
            const mockMapping = { id: '123', sourceId: 'src1', deviceId: 'dev1' };
            vi.mocked(syncEngine.getMapping).mockReturnValue(mockMapping as any);

            const res = await request(app).get('/sync/mappings/123');

            expect(res.status).toBe(200);
            expect(res.body.mapping.id).toBe('123');
        });
    });

    describe('POST /sync/mappings', () => {
        it('should create a new mapping', async () => {
            const newMapping = {
                id: 'new-id',
                sourceId: '550e8400-e29b-41d4-a716-446655440000',
                deviceId: '550e8400-e29b-41d4-a716-446655440001',
                syncMode: 'add_only',
                isActive: true,
            };
            vi.mocked(syncEngine.createMapping).mockReturnValue(newMapping as any);

            const res = await request(app)
                .post('/sync/mappings')
                .send({
                    sourceId: '550e8400-e29b-41d4-a716-446655440000',
                    deviceId: '550e8400-e29b-41d4-a716-446655440001',
                });

            expect(res.status).toBe(201);
            expect(res.body.mapping.id).toBe('new-id');
        });

        it('should reject missing required fields', async () => {
            const res = await request(app)
                .post('/sync/mappings')
                .send({ sourceId: 'only-source' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Missing required fields');
        });

        it('should schedule mapping when schedule is provided', async () => {
            const newMapping = {
                id: 'scheduled-id',
                sourceId: 'src1',
                deviceId: 'dev1',
                schedule: '0 * * * *',
                isActive: true,
            };
            vi.mocked(syncEngine.createMapping).mockReturnValue(newMapping as any);

            const res = await request(app)
                .post('/sync/mappings')
                .send({
                    sourceId: 'src1',
                    deviceId: 'dev1',
                    schedule: '0 * * * *',
                });

            expect(res.status).toBe(201);
            expect(syncScheduler.scheduleMapping).toHaveBeenCalledWith(newMapping);
        });
    });

    describe('PUT /sync/mappings/:id', () => {
        it('should update an existing mapping', async () => {
            const updatedMapping = {
                id: '123',
                sourceId: 'src1',
                deviceId: 'dev1',
                syncMode: 'mirror',
                schedule: '0 0 * * *',
                isActive: true,
            };
            vi.mocked(syncEngine.updateMapping).mockReturnValue(updatedMapping as any);

            const res = await request(app)
                .put('/sync/mappings/123')
                .send({ syncMode: 'mirror', schedule: '0 0 * * *' });

            expect(res.status).toBe(200);
            expect(res.body.mapping.syncMode).toBe('mirror');
        });

        it('should return 404 for non-existent mapping', async () => {
            vi.mocked(syncEngine.updateMapping).mockReturnValue(null);

            const res = await request(app)
                .put('/sync/mappings/non-existent')
                .send({ isActive: false });

            expect(res.status).toBe(404);
        });
    });

    describe('DELETE /sync/mappings/:id', () => {
        it('should delete a mapping', async () => {
            vi.mocked(syncEngine.deleteMapping).mockReturnValue(true);

            const res = await request(app).delete('/sync/mappings/123');

            expect(res.status).toBe(204);
            expect(syncScheduler.unscheduleMapping).toHaveBeenCalledWith('123');
        });

        it('should return 404 for non-existent mapping', async () => {
            vi.mocked(syncEngine.deleteMapping).mockReturnValue(false);

            const res = await request(app).delete('/sync/mappings/non-existent');

            expect(res.status).toBe(404);
        });
    });

    describe('POST /sync/mappings/:id/sync', () => {
        it('should trigger sync for a mapping', async () => {
            vi.mocked(syncEngine.getMapping).mockReturnValue({ id: '123' } as any);
            vi.mocked(syncEngine.executeSync).mockResolvedValue({
                mappingId: '123',
                success: true,
                photosAdded: 5,
                photosRemoved: 0,
                photosSkipped: 2,
                errors: [],
                startedAt: new Date(),
                completedAt: new Date(),
            });

            const res = await request(app).post('/sync/mappings/123/sync');

            expect(res.status).toBe(200);
            expect(res.body.result.success).toBe(true);
            expect(res.body.result.photosAdded).toBe(5);
        });

        it('should return 404 for non-existent mapping', async () => {
            vi.mocked(syncEngine.getMapping).mockReturnValue(null);

            const res = await request(app).post('/sync/mappings/non-existent/sync');

            expect(res.status).toBe(404);
        });
    });

    describe('GET /sync/logs', () => {
        it('should return sync logs', async () => {
            const mockLogs = [
                { id: '1', operation: 'sync', status: 'success', message: 'Synced 10 photos' },
            ];
            vi.mocked(syncEngine.getSyncLogs).mockReturnValue(mockLogs as any);

            const res = await request(app).get('/sync/logs');

            expect(res.status).toBe(200);
            expect(res.body.logs).toHaveLength(1);
        });

        it('should accept limit parameter', async () => {
            vi.mocked(syncEngine.getSyncLogs).mockReturnValue([]);

            await request(app).get('/sync/logs?limit=10');

            expect(syncEngine.getSyncLogs).toHaveBeenCalledWith(undefined, 10);
        });
    });
});
