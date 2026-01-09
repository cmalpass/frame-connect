const API_BASE = '/api';

export interface Device {
    id: string;
    name: string;
    serial: string;
    connectionType: 'usb' | 'network';
    networkAddress?: string;
    networkPort?: number;
    devicePath: string;
    isActive: boolean;
}

export interface DeviceStatus {
    online: boolean;
    storage?: { total: number; used: number; available: number };
    photoCount?: number;
}

export interface DiscoveredDevice {
    serial: string;
    state: string;
    model?: string;
    product?: string;
}

export interface Source {
    id: string;
    name: string;
    type: 'local_folder' | 'google_photos' | 'google_drive';
    config: Record<string, unknown>;
    isActive: boolean;
    lastSyncAt?: string;
}

export interface Album {
    id: string;
    name: string;
    photoCount?: number;
}

export interface SyncMapping {
    id: string;
    sourceId: string;
    deviceId: string;
    syncMode: 'mirror' | 'add_only';
    maxPhotos?: number;
    schedule?: string;
    isActive: boolean;
}

export interface SyncLog {
    id: string;
    mappingId?: string;
    operation: string;
    status: string;
    message: string;
    createdAt: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error.error || 'Request failed');
    }

    return res.json();
}

// Device API
export const deviceApi = {
    list: () => request<{ devices: Device[] }>('/devices'),
    discover: () => request<{ devices: DiscoveredDevice[] }>('/devices/discover'),
    get: (id: string) => request<{ device: Device }>(`/devices/${id}`),
    getStatus: (id: string) => request<DeviceStatus>(`/devices/${id}/status`),
    refresh: (id: string) => request<{ success: boolean; message: string }>(`/devices/${id}/refresh`, { method: 'POST' }),
    restartApp: (id: string) => request<{ success: boolean; message: string }>(`/devices/${id}/restart-app`, { method: 'POST' }),
    create: (data: Partial<Device>) => request<{ device: Device }>('/devices', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    update: (id: string, data: Partial<Device>) => request<{ device: Device }>(`/devices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    delete: (id: string) => request<void>(`/devices/${id}`, { method: 'DELETE' }),
    connect: (id: string) => request<{ success: boolean }>(`/devices/${id}/connect`, { method: 'POST' }),
    listPhotos: (id: string) => request<{ photos: string[]; count: number }>(`/devices/${id}/photos`),
    deletePhotos: (id: string, photos: string[]) => request<{ success: boolean; deleted: string[]; failed: string[] }>(`/devices/${id}/photos`, {
        method: 'DELETE',
        body: JSON.stringify({ photos }),
    }),
};

// Source API
export const sourceApi = {
    list: () => request<{ sources: Source[] }>('/sources'),
    get: (id: string) => request<{ source: Source }>(`/sources/${id}`),
    create: (data: { name: string; type: string; config?: Record<string, unknown> }) =>
        request<{ source: Source }>('/sources', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<Source>) => request<{ source: Source }>(`/sources/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    delete: (id: string) => request<void>(`/sources/${id}`, { method: 'DELETE' }),
    test: (id: string) => request<{ connected: boolean }>(`/sources/${id}/test`, { method: 'POST' }),
    listAlbums: (id: string) => request<{ albums: Album[] }>(`/sources/${id}/albums`),
    listPhotos: (id: string, albumId?: string) =>
        request<{ photos: unknown[]; count: number }>(`/sources/${id}/photos${albumId ? `?albumId=${albumId}` : ''}`),
    getOAuthUrl: (id: string) => request<{ authUrl: string }>(`/sources/${id}/oauth/google`),
};

// Sync API
export const syncApi = {
    listMappings: () => request<{ mappings: SyncMapping[] }>('/sync/mappings'),
    getMapping: (id: string) => request<{ mapping: SyncMapping }>(`/sync/mappings/${id}`),
    createMapping: (data: Partial<SyncMapping>) => request<{ mapping: SyncMapping }>('/sync/mappings', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    deleteMapping: (id: string) => request<void>(`/sync/mappings/${id}`, { method: 'DELETE' }),
    triggerSync: (id: string) => request<{ result: unknown }>(`/sync/mappings/${id}/sync`, { method: 'POST' }),
    getLogs: (mappingId?: string, limit?: number) => {
        const params = new URLSearchParams();
        if (mappingId) params.append('mappingId', mappingId);
        if (limit) params.append('limit', limit.toString());
        const query = params.toString() ? `?${params.toString()}` : '';
        return request<{ logs: SyncLog[] }>(`/sync/logs${query}`);
    },
    getSchedule: () => request<{ tasks: { mappingId: string; schedule: string }[] }>('/sync/schedule'),
};

// Health API
export const healthApi = {
    check: () => request<{ status: string; timestamp: string; version: string }>('/health'),
};
