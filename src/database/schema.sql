-- Frameo Sync Database Schema

-- Registered Frameo devices
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    serial TEXT UNIQUE NOT NULL,
    connection_type TEXT NOT NULL CHECK (connection_type IN ('usb', 'network')),
    network_address TEXT,
    network_port INTEGER DEFAULT 5555,
    device_path TEXT DEFAULT '/sdcard/DCIM/FrameoSync',
    is_active INTEGER DEFAULT 1,
    last_seen_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Configured photo sources
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('local_folder', 'google_photos', 'google_drive')),
    config TEXT NOT NULL, -- JSON blob with source-specific config
    is_active INTEGER DEFAULT 1,
    last_sync_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- OAuth tokens for cloud sources
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT DEFAULT 'Bearer',
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Mapping between sources and devices (which source syncs to which device)
CREATE TABLE IF NOT EXISTS sync_mappings (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    sync_mode TEXT DEFAULT 'mirror' CHECK (sync_mode IN ('mirror', 'add_only')),
    max_photos INTEGER,
    schedule TEXT, -- cron expression
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, device_id)
);

-- Track which photos have been synced
CREATE TABLE IF NOT EXISTS synced_photos (
    id TEXT PRIMARY KEY,
    mapping_id TEXT NOT NULL REFERENCES sync_mappings(id) ON DELETE CASCADE,
    source_photo_id TEXT NOT NULL, -- unique ID from the source
    source_path TEXT, -- original path/URL
    device_path TEXT NOT NULL, -- path on the Frameo device
    file_hash TEXT, -- MD5 hash for change detection
    file_size INTEGER,
    synced_at TEXT DEFAULT (datetime('now')),
    UNIQUE(mapping_id, source_photo_id)
);

-- Sync operation logs
CREATE TABLE IF NOT EXISTS sync_logs (
    id TEXT PRIMARY KEY,
    mapping_id TEXT REFERENCES sync_mappings(id) ON DELETE SET NULL,
    operation TEXT NOT NULL CHECK (operation IN ('sync_start', 'sync_complete', 'photo_push', 'photo_delete', 'error')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'in_progress')),
    message TEXT,
    details TEXT, -- JSON blob with additional details
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
CREATE INDEX IF NOT EXISTS idx_sync_mappings_source ON sync_mappings(source_id);
CREATE INDEX IF NOT EXISTS idx_sync_mappings_device ON sync_mappings(device_id);
CREATE INDEX IF NOT EXISTS idx_synced_photos_mapping ON synced_photos(mapping_id);
CREATE INDEX IF NOT EXISTS idx_synced_photos_hash ON synced_photos(file_hash);
CREATE INDEX IF NOT EXISTS idx_sync_logs_mapping ON sync_logs(mapping_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created ON sync_logs(created_at);
