import { db, generateId, parseJsonField, stringifyJsonField } from '../../database/index.js';
import { adbService, AdbDeviceInfo } from './AdbService.js';
import { logger } from '../../utils/logger.js';

export interface DeviceRecord {
    id: string;
    name: string;
    serial: string;
    connectionType: 'usb' | 'network';
    networkAddress?: string;
    networkPort?: number;
    devicePath: string;
    isActive: boolean;
    lastSeenAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateDeviceInput {
    name: string;
    serial: string;
    connectionType: 'usb' | 'network';
    networkAddress?: string;
    networkPort?: number;
    devicePath?: string;
}

export interface DeviceStatus {
    device: DeviceRecord;
    isOnline: boolean;
    storage?: {
        total: number;
        used: number;
        available: number;
    };
    photoCount?: number;
}

export class DeviceManager {
    /**
     * Get all registered devices
     */
    getDevices(): DeviceRecord[] {
        const stmt = db.prepare(`
      SELECT * FROM devices ORDER BY name ASC
    `);
        const rows = stmt.all() as any[];
        return rows.map(this.rowToDevice);
    }

    /**
     * Get a device by ID
     */
    getDevice(id: string): DeviceRecord | null {
        const stmt = db.prepare(`SELECT * FROM devices WHERE id = ?`);
        const row = stmt.get(id) as any;
        return row ? this.rowToDevice(row) : null;
    }

    /**
     * Get a device by serial number
     */
    getDeviceBySerial(serial: string): DeviceRecord | null {
        const stmt = db.prepare(`SELECT * FROM devices WHERE serial = ?`);
        const row = stmt.get(serial) as any;
        return row ? this.rowToDevice(row) : null;
    }

    /**
     * Register a new device
     */
    async createDevice(input: CreateDeviceInput): Promise<DeviceRecord> {
        const id = generateId();
        const now = new Date().toISOString();

        // Auto-detect Frameo device path if not specified
        let devicePath = input.devicePath;
        if (!devicePath) {
            devicePath = await this.detectFrameoPath(input.serial);
        }

        const stmt = db.prepare(`
      INSERT INTO devices (id, name, serial, connection_type, network_address, network_port, device_path, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

        stmt.run(
            id,
            input.name,
            input.serial,
            input.connectionType,
            input.networkAddress ?? null,
            input.networkPort ?? 5555,
            devicePath,
            now,
            now
        );

        logger.info({ id, name: input.name, serial: input.serial, devicePath }, 'Device registered');
        return this.getDevice(id)!;
    }

    /**
     * Auto-detect the Frameo media path on a device
     * Checks common Frameo paths and returns the first one that exists
     */
    private async detectFrameoPath(serial: string): Promise<string> {
        const possiblePaths = [
            '/sdcard/frameo_files/media',  // Standard Frameo path
            '/sdcard/DCIM/Frameo',          // Some devices use this
            '/sdcard/Frameo',               // Alternative location
        ];

        for (const path of possiblePaths) {
            try {
                const files = await adbService.listFiles(serial, path);
                // If we can list files (even empty), path exists
                logger.debug({ serial, path, fileCount: files.length }, 'Detected Frameo path');
                return path;
            } catch {
                // Path doesn't exist, try next
            }
        }

        // Fallback to standard Frameo path
        logger.warn({ serial }, 'Could not detect Frameo path, using default');
        return '/sdcard/frameo_files/media';
    }

    /**
     * Update device settings
     */
    updateDevice(id: string, updates: Partial<Omit<CreateDeviceInput, 'serial'>>): DeviceRecord | null {
        const device = this.getDevice(id);
        if (!device) return null;

        const fields: string[] = [];
        const values: any[] = [];

        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.connectionType !== undefined) {
            fields.push('connection_type = ?');
            values.push(updates.connectionType);
        }
        if (updates.networkAddress !== undefined) {
            fields.push('network_address = ?');
            values.push(updates.networkAddress);
        }
        if (updates.networkPort !== undefined) {
            fields.push('network_port = ?');
            values.push(updates.networkPort);
        }
        if (updates.devicePath !== undefined) {
            fields.push('device_path = ?');
            values.push(updates.devicePath);
        }

        if (fields.length === 0) return device;

        fields.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(id);

        const stmt = db.prepare(`UPDATE devices SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);

        logger.info({ id, updates }, 'Device updated');
        return this.getDevice(id);
    }

    /**
     * Delete a device
     */
    deleteDevice(id: string): boolean {
        const stmt = db.prepare(`DELETE FROM devices WHERE id = ?`);
        const result = stmt.run(id);
        const deleted = result.changes > 0;
        if (deleted) {
            logger.info({ id }, 'Device deleted');
        }
        return deleted;
    }

    /**
     * Discover connected ADB devices
     */
    async discoverDevices(): Promise<AdbDeviceInfo[]> {
        return adbService.listDevices();
    }

    /**
     * Connect to a network device
     */
    async connectNetworkDevice(id: string): Promise<boolean> {
        const device = this.getDevice(id);
        if (!device || device.connectionType !== 'network' || !device.networkAddress) {
            return false;
        }

        try {
            await adbService.connectNetwork(device.networkAddress, device.networkPort);
            this.updateLastSeen(id);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get device status including online state and storage
     */
    async getDeviceStatus(id: string): Promise<DeviceStatus | null> {
        const device = this.getDevice(id);
        if (!device) return null;

        const isOnline = await adbService.isDeviceReady(device.serial);

        let storage: DeviceStatus['storage'];
        let photoCount: number | undefined;

        if (isOnline) {
            storage = await adbService.getStorageInfo(device.serial) ?? undefined;

            // Count photos in the sync directory
            const files = await adbService.listFiles(device.serial, device.devicePath);
            photoCount = files.filter(f =>
                f.toLowerCase().endsWith('.jpg') ||
                f.toLowerCase().endsWith('.jpeg') ||
                f.toLowerCase().endsWith('.png')
            ).length;

            this.updateLastSeen(id);
        }

        return {
            device,
            isOnline,
            storage,
            photoCount,
        };
    }

    /**
     * Ensure the sync directory exists on the device
     */
    async ensureSyncDirectory(id: string): Promise<boolean> {
        const device = this.getDevice(id);
        if (!device) return false;

        try {
            await adbService.ensureDirectory(device.serial, device.devicePath);
            return true;
        } catch {
            return false;
        }
    }

    private updateLastSeen(id: string): void {
        const stmt = db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`);
        stmt.run(new Date().toISOString(), id);
    }

    private rowToDevice(row: any): DeviceRecord {
        return {
            id: row.id,
            name: row.name,
            serial: row.serial,
            connectionType: row.connection_type,
            networkAddress: row.network_address ?? undefined,
            networkPort: row.network_port ?? undefined,
            devicePath: row.device_path,
            isActive: !!row.is_active,
            lastSeenAt: row.last_seen_at ?? undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

// Singleton instance
export const deviceManager = new DeviceManager();
