import Database, { Database as DatabaseType } from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
const dataDir = dirname(config.DATABASE_PATH);
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

export const db: DatabaseType = new Database(config.DATABASE_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
    logger.info('Initializing database...');

    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    db.exec(schema);

    logger.info('Database initialized successfully');
}

// UUID generator for IDs
export function generateId(): string {
    return crypto.randomUUID();
}

// Helper for JSON fields
export function parseJsonField<T>(value: string | null): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

export function stringifyJsonField(value: unknown): string {
    return JSON.stringify(value);
}
