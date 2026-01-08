import { db, generateId, parseJsonField, stringifyJsonField } from '../../database/index.js';

/**
 * Common interface for all photo sources
 */
export interface PhotoInfo {
    id: string;           // Unique identifier from the source
    name: string;         // Filename
    path: string;         // Original path/URL
    mimeType: string;
    size?: number;
    width?: number;
    height?: number;
    createdAt?: Date;
    hash?: string;        // MD5 hash if available
}

export interface SourceConfig {
    // To be extended by specific sources
    [key: string]: unknown;
}

export interface SourceRecord {
    id: string;
    name: string;
    type: 'local_folder' | 'google_photos' | 'google_drive';
    config: SourceConfig;
    isActive: boolean;
    lastSyncAt?: string;
    createdAt: string;
    updatedAt: string;
}

export abstract class BaseSource {
    protected record: SourceRecord;

    constructor(record: SourceRecord) {
        this.record = record;
    }

    get id(): string {
        return this.record.id;
    }

    get name(): string {
        return this.record.name;
    }

    get type(): string {
        return this.record.type;
    }

    get config(): SourceConfig {
        return this.record.config;
    }

    /**
     * Test if the source is accessible
     */
    abstract testConnection(): Promise<boolean>;

    /**
     * List available albums/folders (for UI selection)
     */
    abstract listAlbums(): Promise<{ id: string; name: string; photoCount?: number }[]>;

    /**
     * Get photos from a specific album/folder
     */
    abstract getPhotos(albumId?: string): Promise<PhotoInfo[]>;

    /**
     * Download a photo to a local temp file
     * Returns the path to the downloaded file
     */
    abstract downloadPhoto(photo: PhotoInfo, tempDir: string): Promise<string>;

    /**
     * Update last sync timestamp
     */
    updateLastSync(): void {
        const stmt = db.prepare(`UPDATE sources SET last_sync_at = ?, updated_at = ? WHERE id = ?`);
        const now = new Date().toISOString();
        stmt.run(now, now, this.id);
        this.record.lastSyncAt = now;
    }
}

// Source factory
export type SourceFactory = (record: SourceRecord) => BaseSource;
const sourceFactories = new Map<string, SourceFactory>();

export function registerSourceFactory(type: string, factory: SourceFactory): void {
    sourceFactories.set(type, factory);
}

export function createSource(record: SourceRecord): BaseSource {
    const factory = sourceFactories.get(record.type);
    if (!factory) {
        throw new Error(`Unknown source type: ${record.type}`);
    }
    return factory(record);
}

// Database operations for sources
export function getSources(): SourceRecord[] {
    const stmt = db.prepare(`SELECT * FROM sources ORDER BY name ASC`);
    const rows = stmt.all() as any[];
    return rows.map(rowToSource);
}

export function getSource(id: string): SourceRecord | null {
    const stmt = db.prepare(`SELECT * FROM sources WHERE id = ?`);
    const row = stmt.get(id) as any;
    return row ? rowToSource(row) : null;
}

export function createSourceRecord(
    name: string,
    type: SourceRecord['type'],
    config: SourceConfig
): SourceRecord {
    const id = generateId();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
    INSERT INTO sources (id, name, type, config, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);
    stmt.run(id, name, type, stringifyJsonField(config), now, now);

    return getSource(id)!;
}

export function updateSourceRecord(id: string, updates: { name?: string; config?: SourceConfig; isActive?: boolean }): SourceRecord | null {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
    }
    if (updates.config !== undefined) {
        fields.push('config = ?');
        values.push(stringifyJsonField(updates.config));
    }
    if (updates.isActive !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.isActive ? 1 : 0);
    }

    if (fields.length === 0) return getSource(id);

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = db.prepare(`UPDATE sources SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return getSource(id);
}

export function deleteSourceRecord(id: string): boolean {
    const stmt = db.prepare(`DELETE FROM sources WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
}

function rowToSource(row: any): SourceRecord {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        config: parseJsonField(row.config) ?? {},
        isActive: !!row.is_active,
        lastSyncAt: row.last_sync_at ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
