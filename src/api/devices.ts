import { Router, Request, Response } from 'express';
import { deviceManager, adbService } from '../services/adb/index.js';
import { logger } from '../utils/logger.js';
import { validateBody, sanitizeFilenameParam, asyncHandler } from '../middleware/index.js';
import { createDeviceSchema, updateDeviceSchema, deletePhotosSchema } from './schemas.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const router = Router();

// List all registered devices
router.get('/', (req: Request, res: Response) => {
    try {
        const devices = deviceManager.getDevices();
        res.json({ devices });
    } catch (err) {
        logger.error({ error: err }, 'Failed to list devices');
        res.status(500).json({ error: 'Failed to list devices' });
    }
});

// Discover available ADB devices
router.get('/discover', async (req: Request, res: Response) => {
    try {
        const devices = await deviceManager.discoverDevices();
        res.json({ devices });
    } catch (err) {
        logger.error({ error: err }, 'Failed to discover devices');
        res.status(500).json({ error: 'Failed to discover devices' });
    }
});

// Get device by ID
router.get('/:id', (req: Request, res: Response) => {
    try {
        const device = deviceManager.getDevice(req.params.id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json({ device });
    } catch (err) {
        logger.error({ error: err }, 'Failed to get device');
        res.status(500).json({ error: 'Failed to get device' });
    }
});

// Get device status
router.get('/:id/status', async (req: Request, res: Response) => {
    try {
        const status = await deviceManager.getDeviceStatus(req.params.id);
        if (!status) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json(status);
    } catch (err) {
        logger.error({ error: err }, 'Failed to get device status');
        res.status(500).json({ error: 'Failed to get device status' });
    }
});

// Register a new device
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, serial, connectionType, networkAddress, networkPort, devicePath } = req.body;

        if (!name || !serial || !connectionType) {
            return res.status(400).json({ error: 'Missing required fields: name, serial, connectionType' });
        }

        // Check if device with this serial already exists
        const existing = deviceManager.getDeviceBySerial(serial);
        if (existing) {
            return res.status(409).json({ error: 'Device with this serial already exists', device: existing });
        }

        const device = await deviceManager.createDevice({
            name,
            serial,
            connectionType,
            networkAddress,
            networkPort,
            devicePath,
        });

        res.status(201).json({ device });
    } catch (err) {
        logger.error({ error: err }, 'Failed to create device');
        res.status(500).json({ error: 'Failed to create device' });
    }
});

// Update device
router.patch('/:id', (req: Request, res: Response) => {
    try {
        const { name, connectionType, networkAddress, networkPort, devicePath } = req.body;

        const device = deviceManager.updateDevice(req.params.id, {
            name,
            connectionType,
            networkAddress,
            networkPort,
            devicePath,
        });

        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        res.json({ device });
    } catch (err) {
        logger.error({ error: err }, 'Failed to update device');
        res.status(500).json({ error: 'Failed to update device' });
    }
});

// Delete device
router.delete('/:id', (req: Request, res: Response) => {
    try {
        const deleted = deviceManager.deleteDevice(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.status(204).send();
    } catch (err) {
        logger.error({ error: err }, 'Failed to delete device');
        res.status(500).json({ error: 'Failed to delete device' });
    }
});

// Connect to network device
router.post('/:id/connect', async (req: Request, res: Response) => {
    try {
        const success = await deviceManager.connectNetworkDevice(req.params.id);
        if (!success) {
            return res.status(400).json({ error: 'Failed to connect to device' });
        }
        res.json({ success: true });
    } catch (err) {
        logger.error({ error: err }, 'Failed to connect to device');
        res.status(500).json({ error: 'Failed to connect to device' });
    }
});

// Force refresh device media (trigger media scan)
router.post('/:id/refresh', async (req: Request, res: Response) => {
    try {
        const device = deviceManager.getDevice(req.params.id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Trigger media scan on the device folder
        await adbService.shell(device.serial, `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${device.devicePath}`);

        // Also try the content call method for good measure (newer Androids)
        try {
            await adbService.shell(device.serial, `content call --uri content://media/external/images/media --method scan_file --arg ${device.devicePath}`);
        } catch (e) {
            // Ignore if this method fails
        }

        // Provide immediate feedback that command was sent
        res.json({ success: true, message: 'Media scan triggered' });
    } catch (err) {
        logger.error({ error: err }, 'Failed to refresh device media');
        res.status(500).json({ error: 'Failed to refresh device media' });
    }
});

import sharp from 'sharp';

// Serve a specific photo from device with thumbnail support
router.get('/:id/photos/:filename', sanitizeFilenameParam('filename'), async (req: Request, res: Response) => {
    try {
        const device = deviceManager.getDevice(req.params.id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const filename = req.params.filename;
        const devicePath = `${device.devicePath}/${filename}`;
        const isThumbnail = req.query.thumbnail === 'true';

        // Cache directory
        const cacheDir = '/tmp/frameo-cache';
        const deviceCacheDir = `${cacheDir}/${device.id}`;

        const fs = await import('fs/promises');
        const path = await import('path');

        // Ensure cache dirs exist
        await fs.mkdir(deviceCacheDir, { recursive: true });

        const localPath = path.join(deviceCacheDir, filename);

        // Serve thumbnail if requested and available
        if (isThumbnail) {
            try {
                // Return cached thumbnail if exists
                const thumbPath = `${localPath}.thumb.webp`;
                const thumbData = await fs.readFile(thumbPath);
                res.setHeader('Content-Type', 'image/webp');
                res.setHeader('Cache-Control', 'public, max-age=86400'); // Camp for 24h
                return res.send(thumbData);
            } catch {
                // Trigger thumbnail generation below
            }
        }

        // Check if full file exists in cache
        let data: Buffer;
        try {
            data = await fs.readFile(localPath);
            // If cached but we need a thumbnail, generate it now
            if (isThumbnail) {
                const thumbPath = `${localPath}.thumb.webp`;
                const thumbBuffer = await sharp(data)
                    .resize(200, 200, { fit: 'cover' })
                    .toFormat('webp', { quality: 80 })
                    .toBuffer();

                await fs.writeFile(thumbPath, thumbBuffer); // Save for next time

                res.setHeader('Content-Type', 'image/webp');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.send(thumbBuffer);
            }
        } catch {
            // File not in cache, pull it
            await adbService.pullFile(device.serial, devicePath, localPath);
            data = await fs.readFile(localPath);

            // If fetching for the first time and need thumbnail
            if (isThumbnail) {
                const thumbBuffer = await sharp(data)
                    .resize(200, 200, { fit: 'cover' })
                    .toFormat('webp', { quality: 80 })
                    .toBuffer();

                const thumbPath = `${localPath}.thumb.webp`;
                await fs.writeFile(thumbPath, thumbBuffer);

                res.setHeader('Content-Type', 'image/webp');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.send(thumbBuffer);
            }
        }

        const ext = filename.split('.').pop()?.toLowerCase() || 'webp';
        res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(data);
    } catch (err) {
        logger.error({ error: err }, 'Failed to serve device photo');
        res.status(500).json({ error: 'Failed to serve photo' });
    }
});

// Trigger background sync when listing photos
router.get('/:id/photos', async (req: Request, res: Response) => {
    try {
        const device = deviceManager.getDevice(req.params.id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // List files (fast)
        const files = await adbService.listFiles(device.serial, device.devicePath || '/sdcard/frameo_files/media/');

        // Filter photos
        const photos = files.filter(f =>
            f.toLowerCase().endsWith('.jpg') ||
            f.toLowerCase().endsWith('.jpeg') ||
            f.toLowerCase().endsWith('.png') ||
            f.toLowerCase().endsWith('.webp')
        );

        // BACKGROUND SYNC: Kick off full sync to cache
        const cacheDir = `/tmp/frameo-cache/${device.id}`;
        import('fs').then(fs => {
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            // Fire and forget sync
            adbService.syncMedia(device.serial, device.devicePath || '/sdcard/frameo_files/media/', cacheDir)
                .catch(err => logger.error({ err }, 'Background sync failed'));
        });

        res.json({ photos, count: photos.length });
    } catch (err) {
        logger.error({ error: err }, 'Failed to list device photos');
        res.status(500).json({ error: 'Failed to list device photos' });
    }
});

// Upload a photo to the device
router.post('/:id/photos', async (req: Request, res: Response) => {
    try {
        const device = deviceManager.getDevice(req.params.id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ error: 'No files were uploaded.' });
        }

        const files = req.files as any;
        const file = files.photo;
        const tempPath = file.tempFilePath;

        // Generate Frameo-style filename (timestamp + .webp/jpg/png)
        // Frameo seems to prefer .webp but supports others
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const filename = `${Date.now()}.${ext}`;
        const devicePath = `${device.devicePath}/${filename}`;

        // Push file
        await adbService.pushFile(device.serial, tempPath, devicePath);

        // Broadcast media scan
        await adbService.broadcastMediaScan(device.serial, devicePath);

        res.status(201).json({ success: true, filename });
    } catch (err) {
        logger.error({ error: err }, 'Failed to upload photo');
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// Delete photos from the device
router.delete('/:id/photos', async (req: Request, res: Response) => {
    try {
        const device = deviceManager.getDevice(req.params.id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const { photos } = req.body;
        if (!Array.isArray(photos) || photos.length === 0) {
            return res.status(400).json({ error: 'No photos specified for deletion' });
        }

        const fs = await import('fs/promises');
        const cacheDir = `/tmp/frameo-cache/${device.id}`;
        const deleted: string[] = [];
        const failed: string[] = [];

        for (const filename of photos) {
            const devicePath = `${device.devicePath}/${filename}`;

            // Delete from device
            const success = await adbService.deleteFile(device.serial, devicePath);

            if (success) {
                deleted.push(filename);
                // Broadcast scan to remove from gallery
                await adbService.broadcastMediaScan(device.serial, devicePath);

                // Clean up local cache/thumbnails
                const localPath = `${cacheDir}/${filename}`;
                const thumbPath = `${localPath}.thumb.webp`;

                await fs.unlink(localPath).catch(() => { });
                await fs.unlink(thumbPath).catch(() => { });
            } else {
                failed.push(filename);
            }
        }

        logger.info({ deviceId: device.id, deletedCount: deleted.length, failedCount: failed.length }, 'Deleted photos');
        res.json({ success: true, deleted, failed });
    } catch (err) {
        logger.error({ error: err }, 'Failed to delete photos');
        res.status(500).json({ error: 'Failed to delete photos' });
    }
});

export default router;
