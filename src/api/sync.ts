import { Router, Request, Response } from 'express';
import { syncEngine, syncScheduler } from '../services/sync/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

// List all sync mappings
router.get('/mappings', (req: Request, res: Response) => {
    try {
        const mappings = syncEngine.getMappings();
        res.json({ mappings });
    } catch (err) {
        logger.error({ error: err }, 'Failed to list mappings');
        res.status(500).json({ error: 'Failed to list mappings' });
    }
});

// Get mapping by ID
router.get('/mappings/:id', (req: Request, res: Response) => {
    try {
        const mapping = syncEngine.getMapping(req.params.id);
        if (!mapping) {
            return res.status(404).json({ error: 'Mapping not found' });
        }
        res.json({ mapping });
    } catch (err) {
        logger.error({ error: err }, 'Failed to get mapping');
        res.status(500).json({ error: 'Failed to get mapping' });
    }
});

// Create a new sync mapping
router.post('/mappings', (req: Request, res: Response) => {
    try {
        const { sourceId, deviceId, syncMode, maxPhotos, schedule } = req.body;

        if (!sourceId || !deviceId) {
            return res.status(400).json({ error: 'Missing required fields: sourceId, deviceId' });
        }

        const mapping = syncEngine.createMapping({
            sourceId,
            deviceId,
            syncMode,
            maxPhotos,
            schedule,
        });

        // Schedule if schedule is provided
        if (schedule) {
            syncScheduler.scheduleMapping(mapping);
        }

        res.status(201).json({ mapping });
    } catch (err) {
        logger.error({ error: err }, 'Failed to create mapping');
        res.status(500).json({ error: 'Failed to create mapping' });
    }
});

// Delete mapping
router.delete('/mappings/:id', (req: Request, res: Response) => {
    try {
        // Unschedule first
        syncScheduler.unscheduleMapping(req.params.id);

        const deleted = syncEngine.deleteMapping(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Mapping not found' });
        }
        res.status(204).send();
    } catch (err) {
        logger.error({ error: err }, 'Failed to delete mapping');
        res.status(500).json({ error: 'Failed to delete mapping' });
    }
});

// Trigger sync for a mapping
router.post('/mappings/:id/sync', async (req: Request, res: Response) => {
    try {
        const mapping = syncEngine.getMapping(req.params.id);
        if (!mapping) {
            return res.status(404).json({ error: 'Mapping not found' });
        }

        // Execute sync asynchronously
        const result = await syncEngine.executeSync(req.params.id);
        res.json({ result });
    } catch (err) {
        logger.error({ error: err }, 'Failed to trigger sync');
        res.status(500).json({ error: 'Failed to trigger sync' });
    }
});

// Get sync logs
router.get('/logs', (req: Request, res: Response) => {
    try {
        const mappingId = req.query.mappingId as string | undefined;
        const limit = parseInt(req.query.limit as string) || 50;

        const logs = syncEngine.getSyncLogs(mappingId, limit);
        res.json({ logs });
    } catch (err) {
        logger.error({ error: err }, 'Failed to get sync logs');
        res.status(500).json({ error: 'Failed to get sync logs' });
    }
});

// Get scheduled tasks
router.get('/schedule', (req: Request, res: Response) => {
    try {
        const tasks = syncScheduler.getScheduledTasks();
        res.json({ tasks });
    } catch (err) {
        logger.error({ error: err }, 'Failed to get scheduled tasks');
        res.status(500).json({ error: 'Failed to get scheduled tasks' });
    }
});

export default router;
