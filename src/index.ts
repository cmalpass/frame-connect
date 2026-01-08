import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { config } from './config/index.js';
import { initializeDatabase } from './database/index.js';
import { logger } from './utils/logger.js';
import { syncScheduler } from './services/sync/index.js';
import apiRouter from './api/index.js';

// Import sources to register factories
import './services/sources/LocalFolderSource.js';
import './services/sources/GooglePhotosSource.js';

import fileUpload from 'express-fileupload';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  logger.info('Starting Frameo Sync...');

  // Ensure required directories exist
  const dirs = [config.PHOTOS_PATH, join(config.PHOTOS_PATH, 'temp')];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.info({ dir }, 'Created directory');
    }
  }

  // Initialize database
  initializeDatabase();

  // Create Express app
  const app = express();

  // ... imports ...

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/'
  }));

  // Request logging
  app.use((req, res, next) => {
    logger.debug({ method: req.method, path: req.path }, 'Request');
    next();
  });

  // API routes
  app.use('/api', apiRouter);

  // Serve static web UI
  const webDir = join(__dirname, '..', 'web', 'dist');
  if (existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(join(webDir, 'index.html'));
      }
    });
  } else {
    // Serve a simple status page if no web UI is built
    app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Frameo Sync</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: system-ui, -apple-system, sans-serif; 
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
              min-height: 100vh;
              color: #fff;
              display: flex;
              justify-content: center;
              align-items: center;
              padding: 20px;
            }
            .container { max-width: 800px; width: 100%; }
            .card {
              background: rgba(255,255,255,0.1);
              backdrop-filter: blur(10px);
              border-radius: 20px;
              padding: 40px;
              box-shadow: 0 8px 32px rgba(0,0,0,0.3);
              border: 1px solid rgba(255,255,255,0.1);
            }
            h1 { 
              font-size: 2.5rem; 
              margin-bottom: 8px;
              background: linear-gradient(135deg, #667eea, #764ba2);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            .subtitle { color: rgba(255,255,255,0.7); margin-bottom: 32px; }
            .status { 
              display: flex; 
              align-items: center; 
              gap: 10px;
              padding: 16px 24px;
              background: rgba(39, 174, 96, 0.2);
              border-radius: 12px;
              margin-bottom: 24px;
            }
            .status-dot { 
              width: 12px; 
              height: 12px; 
              background: #27ae60; 
              border-radius: 50%;
              animation: pulse 2s infinite;
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
            .endpoints { margin-top: 32px; }
            .endpoints h3 { margin-bottom: 16px; color: rgba(255,255,255,0.9); }
            .endpoint { 
              display: flex; 
              justify-content: space-between;
              padding: 12px 16px;
              background: rgba(255,255,255,0.05);
              border-radius: 8px;
              margin-bottom: 8px;
              font-family: monospace;
            }
            .method { 
              color: #667eea; 
              font-weight: bold;
              min-width: 60px;
            }
            .path { color: rgba(255,255,255,0.8); }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <h1>📷 Frameo Sync</h1>
              <p class="subtitle">Photo sync service for Frameo digital frames</p>
              
              <div class="status">
                <div class="status-dot"></div>
                <span>Server running on port ${config.PORT}</span>
              </div>
              
              <div class="endpoints">
                <h3>API Endpoints</h3>
                <div class="endpoint">
                  <span class="method">GET</span>
                  <span class="path">/api/health</span>
                </div>
                <div class="endpoint">
                  <span class="method">GET</span>
                  <span class="path">/api/devices</span>
                </div>
                <div class="endpoint">
                  <span class="method">GET</span>
                  <span class="path">/api/devices/discover</span>
                </div>
                <div class="endpoint">
                  <span class="method">GET</span>
                  <span class="path">/api/sources</span>
                </div>
                <div class="endpoint">
                  <span class="method">GET</span>
                  <span class="path">/api/sync/mappings</span>
                </div>
                <div class="endpoint">
                  <span class="method">GET</span>
                  <span class="path">/api/sync/logs</span>
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
    });
  }

  // Error handling
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({ error: err, path: req.path }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, `Server started on http://localhost:${config.PORT}`);
  });

  // Start sync scheduler
  syncScheduler.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    syncScheduler.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...');
    syncScheduler.stop();
    process.exit(0);
  });
}

main().catch(err => {
  logger.error({ error: err }, 'Fatal error');
  process.exit(1);
});
