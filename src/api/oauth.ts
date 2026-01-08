import { Router, Request, Response } from 'express';
import { GooglePhotosSource } from '../services/sources/GooglePhotosSource.js';
import { getSource } from '../services/sources/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Google OAuth callback
router.get('/google/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Missing authorization code' });
        }

        const sourceId = state as string;
        if (!sourceId) {
            return res.status(400).json({ error: 'Missing source ID in state' });
        }

        // Verify source exists
        const source = getSource(sourceId);
        if (!source) {
            return res.status(404).json({ error: 'Source not found' });
        }

        // Exchange code for tokens
        await GooglePhotosSource.handleCallback(code, sourceId);

        // Redirect to success page or close window
        res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Successful</title>
        <style>
          body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; }
          h1 { color: #27ae60; margin: 0 0 16px; }
          p { color: #666; margin: 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✓ Authorization Successful</h1>
          <p>You can close this window and return to the app.</p>
        </div>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body>
      </html>
    `);
    } catch (err) {
        logger.error({ error: err }, 'OAuth callback failed');
        res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Failed</title>
        <style>
          body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
          .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
          h1 { color: #e74c3c; margin: 0 0 16px; }
          p { color: #666; margin: 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✗ Authorization Failed</h1>
          <p>Please try again or check the logs for details.</p>
        </div>
      </body>
      </html>
    `);
    }
});

export default router;
