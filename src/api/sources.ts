import { Router, Request, Response } from 'express';
import {
    getSources,
    getSource,
    createSourceRecord,
    updateSourceRecord,
    deleteSourceRecord,
    createSource
} from '../services/sources/index.js';
import { GooglePhotosSource } from '../services/sources/GooglePhotosSource.js';
import { logger } from '../utils/logger.js';

const router = Router();

// List all sources
router.get('/', (req: Request, res: Response) => {
    try {
        const sources = getSources();
        res.json({ sources });
    } catch (err) {
        logger.error({ error: err }, 'Failed to list sources');
        res.status(500).json({ error: 'Failed to list sources' });
    }
});

// Get source by ID
router.get('/:id', (req: Request, res: Response) => {
    try {
        const source = getSource(req.params.id);
        if (!source) {
            return res.status(404).json({ error: 'Source not found' });
        }
        res.json({ source });
    } catch (err) {
        logger.error({ error: err }, 'Failed to get source');
        res.status(500).json({ error: 'Failed to get source' });
    }
});

// Create a new source
router.post('/', (req: Request, res: Response) => {
    try {
        const { name, type, config } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'Missing required fields: name, type' });
        }

        if (!['local_folder', 'google_photos', 'google_drive'].includes(type)) {
            return res.status(400).json({ error: 'Invalid source type' });
        }

        const source = createSourceRecord(name, type, config || {});
        res.status(201).json({ source });
    } catch (err) {
        logger.error({ error: err }, 'Failed to create source');
        res.status(500).json({ error: 'Failed to create source' });
    }
});

// Update source
router.patch('/:id', (req: Request, res: Response) => {
    try {
        const { name, config, isActive } = req.body;

        const source = updateSourceRecord(req.params.id, { name, config, isActive });
        if (!source) {
            return res.status(404).json({ error: 'Source not found' });
        }

        res.json({ source });
    } catch (err) {
        logger.error({ error: err }, 'Failed to update source');
        res.status(500).json({ error: 'Failed to update source' });
    }
});

// Delete source
router.delete('/:id', (req: Request, res: Response) => {
    try {
        const deleted = deleteSourceRecord(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Source not found' });
        }
        res.status(204).send();
    } catch (err) {
        logger.error({ error: err }, 'Failed to delete source');
        res.status(500).json({ error: 'Failed to delete source' });
    }
});

// Test source connection
router.post('/:id/test', async (req: Request, res: Response) => {
    try {
        const record = getSource(req.params.id);
        if (!record) {
            return res.status(404).json({ error: 'Source not found' });
        }

        const source = createSource(record);
        const connected = await source.testConnection();

        res.json({ connected });
    } catch (err) {
        logger.error({ error: err }, 'Failed to test source connection');
        res.status(500).json({ error: 'Failed to test source connection' });
    }
});

// List albums from source
router.get('/:id/albums', async (req: Request, res: Response) => {
    try {
        const record = getSource(req.params.id);
        if (!record) {
            return res.status(404).json({ error: 'Source not found' });
        }

        const source = createSource(record);
        const albums = await source.listAlbums();

        res.json({ albums });
    } catch (err) {
        logger.error({ error: err }, 'Failed to list albums');
        res.status(500).json({ error: 'Failed to list albums' });
    }
});

// List photos from source (optional albumId query param)
router.get('/:id/photos', async (req: Request, res: Response) => {
    try {
        const record = getSource(req.params.id);
        if (!record) {
            return res.status(404).json({ error: 'Source not found' });
        }

        const source = createSource(record);
        const albumId = req.query.albumId as string | undefined;
        const photos = await source.getPhotos(albumId);

        res.json({ photos, count: photos.length });
    } catch (err) {
        logger.error({ error: err }, 'Failed to list photos');
        res.status(500).json({ error: 'Failed to list photos' });
    }
});

// Get Google OAuth URL for a source
router.get('/:id/oauth/google', (req: Request, res: Response) => {
    try {
        const record = getSource(req.params.id);
        if (!record) {
            return res.status(404).json({ error: 'Source not found' });
        }

        if (record.type !== 'google_photos' && record.type !== 'google_drive') {
            return res.status(400).json({ error: 'Source does not require Google OAuth' });
        }

        const authUrl = GooglePhotosSource.getAuthUrl(req.params.id);
        res.json({ authUrl });
    } catch (err) {
        logger.error({ error: err }, 'Failed to get OAuth URL');
        res.status(500).json({ error: 'Failed to get OAuth URL' });
    }
});

export default router;
