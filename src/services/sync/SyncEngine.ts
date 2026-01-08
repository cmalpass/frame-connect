import { db, generateId, parseJsonField, stringifyJsonField } from '../../database/index.js';
import { deviceManager, DeviceRecord, adbService } from '../adb/index.js';
import { createSource, getSource, PhotoInfo, SourceRecord } from '../sources/index.js';
import { createImageProcessor, ProcessingOptions } from '../images/index.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export interface SyncMapping {
    id: string;
    sourceId: string;
    deviceId: string;
    syncMode: 'mirror' | 'add_only';
    maxPhotos?: number;
    schedule?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SyncResult {
    mappingId: string;
    success: boolean;
    photosAdded: number;
    photosRemoved: number;
    photosSkipped: number;
    errors: string[];
    startedAt: Date;
    completedAt: Date;
}

export interface SyncedPhoto {
    id: string;
    mappingId: string;
    sourcePhotoId: string;
    sourcePath?: string;
    devicePath: string;
    fileHash?: string;
    fileSize?: number;
    syncedAt: string;
}

export class SyncEngine {
    private processingOptions: ProcessingOptions;

    constructor(processingOptions: ProcessingOptions = {}) {
        this.processingOptions = processingOptions;
    }

    /**
     * Execute a sync for a specific mapping
     */
    async executeSync(mappingId: string): Promise<SyncResult> {
        const startedAt = new Date();
        const result: SyncResult = {
            mappingId,
            success: false,
            photosAdded: 0,
            photosRemoved: 0,
            photosSkipped: 0,
            errors: [],
            startedAt,
            completedAt: startedAt,
        };

        // Get mapping details
        const mapping = this.getMapping(mappingId);
        if (!mapping) {
            result.errors.push('Mapping not found');
            return result;
        }

        // Get source and device
        const sourceRecord = getSource(mapping.sourceId);
        const device = deviceManager.getDevice(mapping.deviceId);

        if (!sourceRecord) {
            result.errors.push('Source not found');
            return result;
        }
        if (!device) {
            result.errors.push('Device not found');
            return result;
        }

        // Log sync start
        this.logSync(mappingId, 'sync_start', 'in_progress', 'Sync started');

        try {
            const source = createSource(sourceRecord);

            // Create temp directory for processing
            const tempDir = join(config.PHOTOS_PATH, 'temp', mappingId);
            if (!existsSync(tempDir)) {
                await mkdir(tempDir, { recursive: true });
            }

            // Ensure device directory exists
            await adbService.ensureDirectory(device.serial, device.devicePath);

            // Get photos from source
            const sourcePhotos = await source.getPhotos();
            logger.info({ mappingId, photoCount: sourcePhotos.length }, 'Retrieved photos from source');

            // Apply max photos limit
            const photosToSync = mapping.maxPhotos
                ? sourcePhotos.slice(0, mapping.maxPhotos)
                : sourcePhotos;

            // Get already synced photos
            const syncedPhotos = this.getSyncedPhotos(mappingId);
            const syncedPhotoIds = new Set(syncedPhotos.map(p => p.sourcePhotoId));

            // Create image processor
            const imageProcessor = createImageProcessor(tempDir);

            // Process each photo
            for (const photo of photosToSync) {
                try {
                    // Skip if already synced
                    if (syncedPhotoIds.has(photo.id)) {
                        result.photosSkipped++;
                        continue;
                    }

                    // Download from source
                    const downloadedPath = await source.downloadPhoto(photo, tempDir);

                    // Process image
                    const processed = await imageProcessor.processImage(downloadedPath, this.processingOptions);

                    // Compute hash
                    const fileHash = await this.computeHash(processed.path);

                    // Check if already exists on device by hash
                    const deviceFileName = `${fileHash}.${processed.format}`;
                    const devicePath = `${device.devicePath}/${deviceFileName}`;

                    const existingHash = await adbService.getFileHash(device.serial, devicePath);
                    if (existingHash === fileHash) {
                        // Already on device with same hash
                        result.photosSkipped++;
                        await imageProcessor.cleanup(downloadedPath);
                        await imageProcessor.cleanup(processed.path);
                        continue;
                    }

                    // Push to device
                    const pushResult = await adbService.pushFile(device.serial, processed.path, devicePath);

                    if (pushResult.success) {
                        // Record synced photo
                        this.recordSyncedPhoto({
                            mappingId,
                            sourcePhotoId: photo.id,
                            sourcePath: photo.path,
                            devicePath,
                            fileHash,
                            fileSize: processed.size,
                        });
                        result.photosAdded++;
                    } else {
                        result.errors.push(`Failed to push ${photo.name}: ${pushResult.error}`);
                    }

                    // Cleanup temp files
                    await imageProcessor.cleanup(downloadedPath);
                    await imageProcessor.cleanup(processed.path);

                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    result.errors.push(`Error processing ${photo.name}: ${errorMsg}`);
                    logger.error({ error: err, photo: photo.name }, 'Failed to sync photo');
                }
            }

            // Handle mirror mode - remove photos not in source
            if (mapping.syncMode === 'mirror') {
                const sourcePhotoIds = new Set(photosToSync.map(p => p.id));
                const toRemove = syncedPhotos.filter(sp => !sourcePhotoIds.has(sp.sourcePhotoId));

                for (const synced of toRemove) {
                    try {
                        await adbService.deleteFile(device.serial, synced.devicePath);
                        this.deleteSyncedPhoto(synced.id);
                        result.photosRemoved++;
                    } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        result.errors.push(`Failed to remove ${synced.devicePath}: ${errorMsg}`);
                    }
                }
            }

            // Update source last sync time
            source.updateLastSync();

            // Cleanup temp directory
            try {
                await rm(tempDir, { recursive: true, force: true });
            } catch {
                // Ignore cleanup errors
            }

            result.success = result.errors.length === 0;
            result.completedAt = new Date();

            // Log completion
            this.logSync(
                mappingId,
                'sync_complete',
                result.success ? 'success' : 'failure',
                `Added: ${result.photosAdded}, Removed: ${result.photosRemoved}, Skipped: ${result.photosSkipped}`,
                result
            );

            logger.info({ result }, 'Sync completed');

        } catch (err) {
            result.errors.push(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
            result.completedAt = new Date();

            this.logSync(mappingId, 'sync_complete', 'failure', result.errors.join('; '));
            logger.error({ error: err, mappingId }, 'Sync failed');
        }

        return result;
    }

    // Mapping CRUD operations
    getMappings(): SyncMapping[] {
        const stmt = db.prepare(`SELECT * FROM sync_mappings ORDER BY created_at DESC`);
        return (stmt.all() as any[]).map(this.rowToMapping);
    }

    getMapping(id: string): SyncMapping | null {
        const stmt = db.prepare(`SELECT * FROM sync_mappings WHERE id = ?`);
        const row = stmt.get(id) as any;
        return row ? this.rowToMapping(row) : null;
    }

    getMappingsForDevice(deviceId: string): SyncMapping[] {
        const stmt = db.prepare(`SELECT * FROM sync_mappings WHERE device_id = ?`);
        return (stmt.all(deviceId) as any[]).map(this.rowToMapping);
    }

    getMappingsForSource(sourceId: string): SyncMapping[] {
        const stmt = db.prepare(`SELECT * FROM sync_mappings WHERE source_id = ?`);
        return (stmt.all(sourceId) as any[]).map(this.rowToMapping);
    }

    createMapping(input: {
        sourceId: string;
        deviceId: string;
        syncMode?: 'mirror' | 'add_only';
        maxPhotos?: number;
        schedule?: string;
    }): SyncMapping {
        const id = generateId();
        const now = new Date().toISOString();

        const stmt = db.prepare(`
      INSERT INTO sync_mappings (id, source_id, device_id, sync_mode, max_photos, schedule, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

        stmt.run(
            id,
            input.sourceId,
            input.deviceId,
            input.syncMode ?? 'add_only',
            input.maxPhotos ?? null,
            input.schedule ?? null,
            now,
            now
        );

        logger.info({ id, ...input }, 'Sync mapping created');
        return this.getMapping(id)!;
    }

    deleteMapping(id: string): boolean {
        const stmt = db.prepare(`DELETE FROM sync_mappings WHERE id = ?`);
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Synced photo tracking
    private getSyncedPhotos(mappingId: string): SyncedPhoto[] {
        const stmt = db.prepare(`SELECT * FROM synced_photos WHERE mapping_id = ?`);
        return (stmt.all(mappingId) as any[]).map(row => ({
            id: row.id,
            mappingId: row.mapping_id,
            sourcePhotoId: row.source_photo_id,
            sourcePath: row.source_path,
            devicePath: row.device_path,
            fileHash: row.file_hash,
            fileSize: row.file_size,
            syncedAt: row.synced_at,
        }));
    }

    private recordSyncedPhoto(input: Omit<SyncedPhoto, 'id' | 'syncedAt'>): void {
        const id = generateId();
        const now = new Date().toISOString();

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO synced_photos (id, mapping_id, source_photo_id, source_path, device_path, file_hash, file_size, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(id, input.mappingId, input.sourcePhotoId, input.sourcePath, input.devicePath, input.fileHash, input.fileSize, now);
    }

    private deleteSyncedPhoto(id: string): void {
        const stmt = db.prepare(`DELETE FROM synced_photos WHERE id = ?`);
        stmt.run(id);
    }

    // Logging
    private logSync(mappingId: string, operation: string, status: string, message: string, details?: unknown): void {
        const id = generateId();
        const now = new Date().toISOString();

        const stmt = db.prepare(`
      INSERT INTO sync_logs (id, mapping_id, operation, status, message, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(id, mappingId, operation, status, message, details ? stringifyJsonField(details) : null, now);
    }

    getSyncLogs(mappingId?: string, limit: number = 50): Array<{
        id: string;
        mappingId?: string;
        operation: string;
        status: string;
        message: string;
        createdAt: string;
    }> {
        let query = `SELECT * FROM sync_logs`;
        const params: any[] = [];

        if (mappingId) {
            query += ` WHERE mapping_id = ?`;
            params.push(mappingId);
        }

        query += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(query);
        return (stmt.all(...params) as any[]).map(row => ({
            id: row.id,
            mappingId: row.mapping_id,
            operation: row.operation,
            status: row.status,
            message: row.message,
            createdAt: row.created_at,
        }));
    }

    private async computeHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = createHash('md5');
            const stream = createReadStream(filePath);
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    private rowToMapping(row: any): SyncMapping {
        return {
            id: row.id,
            sourceId: row.source_id,
            deviceId: row.device_id,
            syncMode: row.sync_mode,
            maxPhotos: row.max_photos ?? undefined,
            schedule: row.schedule ?? undefined,
            isActive: !!row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

// Singleton instance
export const syncEngine = new SyncEngine();
