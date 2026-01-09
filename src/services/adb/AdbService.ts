import Adb from '@devicefarmer/adbkit';
import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

// ESM/CJS interop - access classes from default export
const { Client } = Adb;

export interface AdbDeviceInfo {
    serial: string;
    state: string;
    model?: string;
    product?: string;
}

export interface PushResult {
    success: boolean;
    devicePath: string;
    bytesTransferred?: number;
    error?: string;
}

export class AdbService {
    private client: InstanceType<typeof Client>;

    constructor() {
        this.client = new Client({
            host: config.ADB_HOST,
            port: config.ADB_PORT,
        });
        logger.info({ host: config.ADB_HOST, port: config.ADB_PORT }, 'ADB client initialized');
    }

    /**
     * List all connected ADB devices
     */
    async listDevices(): Promise<AdbDeviceInfo[]> {
        try {
            const devices = await this.client.listDevices();
            const deviceInfos: AdbDeviceInfo[] = [];

            for (const device of devices) {
                const info: AdbDeviceInfo = {
                    serial: device.id,
                    state: device.type,
                };

                // Get additional device properties if device is ready
                if (device.type === 'device') {
                    try {
                        const client = this.client.getDevice(device.id);
                        const props = await client.getProperties();
                        info.model = props['ro.product.model'];
                        info.product = props['ro.product.name'];
                    } catch (err) {
                        logger.warn({ serial: device.id, error: err }, 'Failed to get device properties');
                    }
                }

                deviceInfos.push(info);
            }

            logger.info({ count: deviceInfos.length }, 'Listed ADB devices');
            return deviceInfos;
        } catch (err) {
            logger.error({ error: err }, 'Failed to list ADB devices');
            throw err;
        }
    }

    /**
     * Get a device client for a specific device
     */
    getDeviceClient(serial: string) {
        return this.client.getDevice(serial);
    }

    /**
     * Connect to a device over the network
     */
    async connectNetwork(host: string, port: number = 5555): Promise<string> {
        try {
            const deviceId = await this.client.connect(host, port);
            logger.info({ host, port, deviceId }, 'Connected to network device');
            return deviceId;
        } catch (err) {
            logger.error({ host, port, error: err }, 'Failed to connect to network device');
            throw err;
        }
    }

    /**
     * Disconnect from a network device
     */
    async disconnectNetwork(host: string, port: number = 5555): Promise<void> {
        try {
            await this.client.disconnect(host, port);
            logger.info({ host, port }, 'Disconnected from network device');
        } catch (err) {
            logger.error({ host, port, error: err }, 'Failed to disconnect from network device');
            throw err;
        }
    }

    /**
     * Execute a shell command on the device
     */
    async shell(serial: string, command: string): Promise<string> {
        try {
            const device = this.client.getDevice(serial);
            const stream = await device.shell(command);

            // Read all output from the stream
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            return Buffer.concat(chunks).toString('utf-8').trim();
        } catch (err) {
            logger.error({ serial, command, error: err }, 'Shell command failed');
            throw err;
        }
    }

    /**
     * Push a file to the device
     */
    async pushFile(serial: string, localPath: string, devicePath: string): Promise<PushResult> {
        try {
            const device = this.client.getDevice(serial);
            const transfer = await device.push(localPath, devicePath);

            return new Promise((resolve, reject) => {
                let bytesTransferred = 0;

                transfer.on('progress', (stats: { bytesTransferred: number }) => {
                    bytesTransferred = stats.bytesTransferred;
                });

                transfer.on('end', () => {
                    logger.info({ serial, localPath, devicePath, bytes: bytesTransferred }, 'File pushed successfully');
                    resolve({
                        success: true,
                        devicePath,
                        bytesTransferred,
                    });
                });

                transfer.on('error', (err: Error) => {
                    logger.error({ serial, localPath, devicePath, error: err }, 'File push failed');
                    reject(err);
                });
            });
        } catch (err) {
            logger.error({ serial, localPath, devicePath, error: err }, 'Failed to push file');
            return {
                success: false,
                devicePath,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /**
     * Push a stream/buffer to the device
     */
    async pushStream(serial: string, data: Buffer | Readable, devicePath: string): Promise<PushResult> {
        try {
            const device = this.client.getDevice(serial);
            const stream = Buffer.isBuffer(data) ? Readable.from(data) : data;
            const transfer = await device.push(stream, devicePath);

            return new Promise((resolve, reject) => {
                let bytesTransferred = 0;

                transfer.on('progress', (stats: { bytesTransferred: number }) => {
                    bytesTransferred = stats.bytesTransferred;
                });

                transfer.on('end', () => {
                    logger.info({ serial, devicePath, bytes: bytesTransferred }, 'Stream pushed successfully');
                    resolve({
                        success: true,
                        devicePath,
                        bytesTransferred,
                    });
                });

                transfer.on('error', (err: Error) => {
                    logger.error({ serial, devicePath, error: err }, 'Stream push failed');
                    reject(err);
                });
            });
        } catch (err) {
            logger.error({ serial, devicePath, error: err }, 'Failed to push stream');
            return {
                success: false,
                devicePath,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /**
     * Pull a file from the device
     */
    async pullFile(serial: string, devicePath: string, localPath: string): Promise<void> {
        try {
            const device = this.client.getDevice(serial);
            const transfer = await device.pull(devicePath);
            const writeStream = createWriteStream(localPath);

            await pipeline(transfer, writeStream);
            logger.info({ serial, devicePath, localPath }, 'File pulled successfully');
        } catch (err) {
            logger.error({ serial, devicePath, localPath, error: err }, 'Failed to pull file');
            throw err;
        }
    }

    /**
     * Delete a file from the device
     */
    async deleteFile(serial: string, devicePath: string): Promise<boolean> {
        try {
            await this.shell(serial, `rm -f "${devicePath}"`);
            logger.info({ serial, devicePath }, 'File deleted');
            return true;
        } catch (err) {
            logger.error({ serial, devicePath, error: err }, 'Failed to delete file');
            return false;
        }
    }

    /**
     * Broadcast MEDIA_SCANNER_SCAN_FILE intent to update gallery
     */
    async broadcastMediaScan(serial: string, devicePath: string): Promise<void> {
        try {
            await this.shell(serial, `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${devicePath}"`);
            logger.debug({ serial, devicePath }, 'Media scan broadcasted');
        } catch (err) {
            logger.warn({ serial, devicePath, error: err }, 'Failed to broadcast media scan');
        }
    }

    /**
     * List files in a directory on the device
     */
    async listFiles(serial: string, devicePath: string): Promise<string[]> {
        try {
            const output = await this.shell(serial, `ls "${devicePath}" 2>/dev/null || echo ""`);
            if (!output) return [];
            // Split on whitespace since some devices don't have ls -1
            return output.split(/\s+/).filter(f => f.length > 0 && f !== '.' && f !== '..');
        } catch (err) {
            logger.error({ serial, devicePath, error: err }, 'Failed to list files');
            return [];
        }
    }

    /**
     * Sync an entire directory from device to local path
     * Uses native adb pull for performance
     */
    async syncMedia(serial: string, devicePath: string, localPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const ADB_HOST = process.env.ADB_HOST || 'localhost';
            const ADB_PORT = process.env.ADB_PORT || '5037';

            // adb -H host -P port -s serial pull devicePath localPath
            const args = ['-H', ADB_HOST, '-P', ADB_PORT, '-s', serial, 'pull', devicePath, localPath];

            logger.info({ args }, 'Starting bulk sync');

            const spawn = require('child_process').spawn;
            const child = spawn('adb', args);

            child.stderr.on('data', (data: Buffer) => {
                // adb pull prints progress to stderr, don't treat as error unless distinct failure
                const msg = data.toString();
                if (msg.includes('error') || msg.includes('failed')) {
                    logger.error({ msg }, 'ADB Pull Error');
                }
            });

            child.on('close', (code: number) => {
                if (code === 0) {
                    logger.info('Bulk sync completed successfully');
                    resolve();
                } else {
                    reject(new Error(`ADB pull failed with code ${code}`));
                }
            });
        });
    }

    /**
     * Get MD5 hash of a file on the device
     */
    async getFileHash(serial: string, devicePath: string): Promise<string | null> {
        try {
            const output = await this.shell(serial, `md5sum "${devicePath}" 2>/dev/null`);
            if (!output || output.includes('No such file')) return null;
            return output.split(' ')[0];
        } catch {
            return null;
        }
    }

    /**
     * Ensure a directory exists on the device
     */
    async ensureDirectory(serial: string, devicePath: string): Promise<void> {
        await this.shell(serial, `mkdir -p "${devicePath}"`);
        logger.debug({ serial, devicePath }, 'Directory ensured');
    }

    /**
     * Check if device is responsive
     */
    async isDeviceReady(serial: string): Promise<boolean> {
        try {
            const output = await this.shell(serial, 'echo "ready"');
            return output === 'ready';
        } catch {
            return false;
        }
    }

    /**
     * Get device storage info
     */
    async getStorageInfo(serial: string, path: string = '/sdcard'): Promise<{ total: number; used: number; available: number } | null> {
        try {
            const output = await this.shell(serial, `df -k "${path}" | tail -1`);
            const parts = output.split(/\s+/);
            if (parts.length >= 4) {
                return {
                    total: parseInt(parts[1]) * 1024,
                    used: parseInt(parts[2]) * 1024,
                    available: parseInt(parts[3]) * 1024,
                };
            }
            return null;
        } catch {
            return null;
        }
    }
}

// Singleton instance
export const adbService = new AdbService();
