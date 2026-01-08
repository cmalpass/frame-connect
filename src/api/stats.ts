import { Router } from 'express';
import { deviceManager } from '../services/adb/index.js'; // Fixed path
import { getSources } from '../services/sources/index.js';
import { syncEngine } from '../services/sync/index.js';
import { adbService } from '../services/adb/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const devices = deviceManager.getDevices();
        const sources = getSources();
        const mappings = syncEngine.getMappings();

        // Parallelize device checks for speed
        const deviceStats = await Promise.all(devices.map(async (device) => {
            const getStatsForDevice = async () => {
                try {
                    // Check if device is connected first
                    const isOnline = await adbService.isDeviceReady(device.serial);
                    if (!isOnline) {
                        return { id: device.id, photos: 0, storage: null, isOnline: false };
                    }

                    // Get photo count (fast)
                    const countOutput = await adbService.shell(device.serial, `ls "${device.devicePath}" 2>/dev/null | wc -l`);
                    const imgCount = parseInt(countOutput?.trim() || '0');

                    // Get storage usage
                    const dfOutput = await adbService.shell(device.serial, 'df -h /sdcard');
                    const lines = dfOutput?.split('\n') || [];
                    const dataLine = lines.find((l: string) => l.includes('/sdcard') || l.includes('/storage/emulated'));
                    let storage = null;

                    if (dataLine) {
                        const parts = dataLine.split(/\s+/);
                        // Standard: Filesystem[0] Size[1] Used[2] Avail[3] Use%[4] Mounted[5]
                        // Weird: Filesystem[0] Size[1] Used[2] Free[3] Blksize[4]

                        if (parts.length >= 4) {
                            const totalStr = parts[1];
                            const usedStr = parts[2];
                            const freeStr = parts[3];
                            let percentStr = parts.length >= 5 ? parts[4] : '';

                            // If percentStr doesn't look like percentage (no %), calculate it
                            if (!percentStr.includes('%')) {
                                const parseSize = (s: string) => {
                                    const units = { 'G': 1024 ** 3, 'M': 1024 ** 2, 'K': 1024, 'B': 1 };
                                    const unit = s.slice(-1).toUpperCase();
                                    const val = parseFloat(s);
                                    if (isNaN(val)) return 0;
                                    if (units[unit as keyof typeof units]) {
                                        return val * units[unit as keyof typeof units];
                                    }
                                    return val;
                                };

                                const totalBytes = parseSize(totalStr);
                                const usedBytes = parseSize(usedStr);
                                if (totalBytes > 0) {
                                    percentStr = Math.round((usedBytes / totalBytes) * 100) + '%';
                                } else {
                                    percentStr = '0%';
                                }
                            }

                            storage = {
                                total: totalStr,
                                used: usedStr,
                                free: freeStr,
                                percent: percentStr
                            };
                        }
                    }

                    return { id: device.id, photos: isNaN(imgCount) ? 0 : imgCount, storage, isOnline: true };
                } catch (err) {
                    // logger.warn({ deviceId: device.id, error: err }, 'Failed to get device stats');
                    return { id: device.id, photos: 0, storage: null, isOnline: false };
                }
            };

            // Enforce 2s timeout per device to prevent hanging
            return Promise.race([
                getStatsForDevice(),
                new Promise<any>(resolve => setTimeout(() => resolve({ id: device.id, photos: 0, storage: null, isOnline: false }), 2000))
            ]);
        }));

        const totalPhotos = deviceStats.reduce((sum: number, d: any) => sum + d.photos, 0);

        // Calculate system health/status
        let status = 'Healthy';
        if (devices.length === 0) status = 'No Devices';
        else if (deviceStats.some(d => !d.isOnline)) status = 'Device Offline'; // Check processed stats

        res.json({
            overview: {
                devices: devices.length,
                sources: sources.length,
                mappings: mappings.length,
                totalPhotos,
                status
            },
            devices: deviceStats
        });
    } catch (err) {
        logger.error({ error: err }, 'Failed to get stats');
        res.status(500).json({ error: 'Failed to get system stats' });
    }
});

export default router;
