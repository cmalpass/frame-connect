import { Router } from 'express';
import devicesRouter from './devices.js';
import sourcesRouter from './sources.js';
import syncRouter from './sync.js';
import oauthRouter from './oauth.js';
import statsRouter from './stats.js';

const router = Router();

router.use('/devices', devicesRouter);
router.use('/sources', sourcesRouter);
router.use('/sync', syncRouter);
router.use('/oauth', oauthRouter);
router.use('/stats', statsRouter);

// Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

export default router;
