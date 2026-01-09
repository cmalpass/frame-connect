import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { deviceApi, sourceApi, syncApi } from './api';
import type { Device, Source, SyncMapping, SyncLog, DiscoveredDevice } from './api';
import './index.css';

type Page = 'dashboard' | 'devices' | 'sources' | 'sync' | 'logs';

function App() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div className="app">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="main">
        {page === 'dashboard' && <DashboardPage />}
        {page === 'devices' && <DevicesPage />}
        {page === 'sources' && <SourcesPage />}
        {page === 'sync' && <SyncPage />}
        {page === 'logs' && <LogsPage />}
      </main>
    </div>
  );
}

function Sidebar({ currentPage, onNavigate }: { currentPage: Page; onNavigate: (p: Page) => void }) {
  const items: { id: Page; icon: string; label: string }[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'devices', icon: '📺', label: 'Devices' },
    { id: 'sources', icon: '📷', label: 'Photo Sources' },
    { id: 'sync', icon: '🔄', label: 'Sync Mappings' },
    { id: 'logs', icon: '📋', label: 'Activity Logs' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span style={{ fontSize: '1.5rem' }}>🖼️</span>
        <h1>Frameo Sync</h1>
      </div>
      <nav>
        <ul className="nav-list">
          {items.map(item => (
            <li
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

interface DashboardStats {
  overview: {
    devices: number;
    sources: number;
    mappings: number;
    totalPhotos: number;
    status: string;
  };
  devices: {
    id: string;
    photos: number;
    storage: {
      total: string;
      used: string;
      free: string;
      percent: string;
    } | null;
    isOnline: boolean;
  }[];
}

function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    // Initial load - await to clear loading screen
    const initialLoad = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const statsPromise = fetch('/api/stats', { signal: controller.signal })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);

        const logsPromise = syncApi.getLogs(undefined, 5)
          .catch(() => ({ logs: [] }));

        const [statsData, logsData] = await Promise.all([statsPromise, logsPromise]);

        if (statsData) setStats(statsData);
        if (logsData) setRecentLogs(logsData.logs || []);
      } catch (e) {
        console.error('Initial load failed', e);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    initialLoad();

    // Polling - fire and forget
    const interval = setInterval(() => {
      fetch('/api/stats').then(r => r.ok && r.json()).then(d => d && setStats(d)).catch(() => { });
      syncApi.getLogs(undefined, 5).then(d => setRecentLogs(d.logs)).catch(() => { });
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) return <div className="loading">Loading dashboard...</div>;

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your Frameo Sync setup</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.overview.devices || 0}</div>
          <div className="stat-label">Connected Devices</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.overview.totalPhotos || 0}</div>
          <div className="stat-label">Total Photos Synced</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.overview.mappings || 0}</div>
          <div className="stat-label">Active Syncs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{
            color: stats?.overview.status === 'Healthy' ? 'var(--success)' :
              stats?.overview.status === 'No Devices' ? 'var(--text-secondary)' : 'var(--danger)'
          }}>
            {stats?.overview.status || 'Unknown'}
          </div>
          <div className="stat-label">System Status</div>
        </div>
      </div>

      {/* Device Storage Status Section */}
      {stats?.devices && stats.devices.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Device Storage</h3>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', marginTop: '1rem' }}>
            {stats.devices.map(d => (
              <div key={d.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong>Device {d.id.slice(0, 8)}...</strong>
                  <span className={`badge badge-${d.isOnline ? 'success' : 'danger'}`}>
                    {d.isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                {d.isOnline && d.storage ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      <span>Storage Used ({d.storage.percent})</span>
                      <span>{d.storage.used} / {d.storage.total}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: d.storage.percent,
                        height: '100%',
                        background: parseInt(d.storage.percent) > 90 ? 'var(--danger)' : 'var(--primary)'
                      }} />
                    </div>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                      📸 {d.photos} photos found
                    </p>
                  </div>
                ) : (
                  <p style={{ color: '#999', fontSize: '0.9rem' }}>Storage info unavailable</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-header">
          <h3 className="card-title">Recent System Activity</h3>
        </div>
        {recentLogs.length === 0 ? (
          <div className="empty-state">
            <p>No recent activity</p>
          </div>
        ) : (
          <div className="log-list">
            {recentLogs.map(log => (
              <div key={log.id} className="log-item">
                <span className={`badge badge-${log.status === 'success' ? 'success' : log.status === 'failure' ? 'danger' : 'info'}`}>
                  {log.status}
                </span>
                <span className="log-message">{log.message}</span>
                <span className="log-time">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [manualDevice, setManualDevice] = useState({ name: 'Frameo Frame', ip: '', port: '5555' });
  const [adding, setAdding] = useState(false);

  const loadDevices = async () => {
    const res = await deviceApi.list();
    setDevices(res.devices);
    setLoading(false);
  };

  useEffect(() => { loadDevices(); }, []);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const res = await deviceApi.discover();
      setDiscovered(res.devices);
      setShowAddModal(true);
    } finally {
      setDiscovering(false);
    }
  };

  const handleAddDevice = async (dev: DiscoveredDevice) => {
    await deviceApi.create({
      name: dev.model || dev.product || 'Frameo Frame',
      serial: dev.serial,
      connectionType: dev.serial.includes(':') ? 'network' : 'usb',
      devicePath: '/sdcard/DCIM/Frameo',
    });
    setShowAddModal(false);
    loadDevices();
  };

  const handleManualAdd = async () => {
    if (!manualDevice.ip) return;
    setAdding(true);
    try {
      const serial = `${manualDevice.ip}:${manualDevice.port}`;
      await deviceApi.create({
        name: manualDevice.name,
        serial: serial,
        connectionType: 'network',
        networkAddress: manualDevice.ip,
        networkPort: parseInt(manualDevice.port),
        devicePath: '/sdcard/DCIM/Frameo',
      });
      setShowManualModal(false);
      setManualDevice({ name: 'Frameo Frame', ip: '', port: '5555' });
      loadDevices();
    } catch (e) {
      alert('Failed to add device: ' + (e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const handleConnect = async (device: Device) => {
    try {
      await deviceApi.connect(device.id);
      alert('✅ Connected successfully!');
      loadDevices();
    } catch (e) {
      alert('❌ Connection failed: ' + (e as Error).message);
    }
  };

  const fetchPhotos = async (device: Device) => {
    const res = await deviceApi.listPhotos(device.id);
    setPhotos(res.photos);
  };

  const handleViewPhotos = async (device: Device) => {
    setSelectedDevice(device);
    await fetchPhotos(device);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this device?')) {
      await deviceApi.delete(id);
      loadDevices();
    }
  };

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <h2>Devices</h2>
        <p>Manage your Frameo photo frames</p>
      </div>

      <div style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={handleDiscover} disabled={discovering}>
          {discovering ? '🔍 Discovering...' : '🔍 Discover Devices'}
        </button>
        <button className="btn btn-secondary" onClick={() => setShowManualModal(true)}>
          ➕ Add by IP Address
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No devices registered</h3>
            <p>Click "Add by IP Address" to connect a Frameo frame over WiFi</p>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {devices.map(device => (
            <div key={device.id} className="item-card">
              <div className="item-card-header">
                <div>
                  <div className="item-card-title">📺 {device.name}</div>
                  <div className="item-card-subtitle">{device.serial}</div>
                </div>
                <span className={`badge badge-${device.isActive ? 'success' : 'warning'}`}>
                  {device.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="item-card-meta">
                <span>📍 {device.connectionType.toUpperCase()}</span>
                <span>📁 {device.devicePath}</span>
              </div>
              <div className="item-card-actions">
                {device.connectionType === 'network' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => handleConnect(device)}>🔌 Connect</button>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    if (confirm('Force refresh media on device? This will trigger a media scan.')) {
                      try {
                        await deviceApi.refresh(device.id);
                        alert('✅ Media scan triggered');
                      } catch (e) {
                        alert('❌ Failed: ' + (e as Error).message);
                      }
                    }
                  }}
                >
                  🔄 Scan
                </button>
                <button
                  className="btn btn-warning btn-sm"
                  title="Restart Frameo app on device"
                  style={{ marginLeft: 4 }}
                  onClick={async () => {
                    if (confirm('Restart Frameo app? Use this if photos are syncing but not showing.')) {
                      try {
                        await deviceApi.restartApp(device.id);
                        alert('✅ App restart commanded');
                      } catch (e) {
                        alert('❌ Failed: ' + (e as Error).message);
                      }
                    }
                  }}
                >
                  ⚡ Restart
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleViewPhotos(device)}>📷 Photos</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(device.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <Modal title="Discovered Devices" onClose={() => setShowAddModal(false)}>
          {discovered.length === 0 ? (
            <p>No devices found. Make sure ADB is enabled on your Frameo frame.</p>
          ) : (
            discovered.map(dev => (
              <div key={dev.serial} className="item-card" style={{ marginBottom: 12 }}>
                <div className="item-card-header">
                  <div>
                    <div className="item-card-title">{dev.model || dev.product || 'Unknown Device'}</div>
                    <div className="item-card-subtitle">{dev.serial}</div>
                  </div>
                  <span className={`badge badge-${dev.state === 'device' ? 'success' : 'warning'}`}>{dev.state}</span>
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => handleAddDevice(dev)}>
                  ➕ Add Device
                </button>
              </div>
            ))
          )}
        </Modal>
      )}

      {showManualModal && (
        <Modal title="Add Device by IP Address" onClose={() => setShowManualModal(false)}>
          <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
            Enter your Frameo's IP address. Find it in Settings → About on the frame.
          </p>
          <div className="form-group">
            <label className="form-label">Device Name</label>
            <input
              className="form-input"
              value={manualDevice.name}
              onChange={e => setManualDevice({ ...manualDevice, name: e.target.value })}
              placeholder="Living Room Frame"
            />
          </div>
          <div className="form-group">
            <label className="form-label">IP Address</label>
            <input
              className="form-input"
              value={manualDevice.ip}
              onChange={e => setManualDevice({ ...manualDevice, ip: e.target.value })}
              placeholder="192.168.1.100"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Port (usually 5555)</label>
            <input
              className="form-input"
              value={manualDevice.port}
              onChange={e => setManualDevice({ ...manualDevice, port: e.target.value })}
              placeholder="5555"
            />
          </div>
          <div className="modal-footer" style={{ padding: 0, marginTop: 16, border: 'none' }}>
            <button className="btn btn-secondary" onClick={() => setShowManualModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleManualAdd} disabled={!manualDevice.ip || adding}>
              {adding ? 'Adding...' : 'Add Device'}
            </button>
          </div>
        </Modal>
      )}

      {selectedDevice && (
        <PhotoGallery
          device={selectedDevice}
          photos={photos}
          onClose={() => { setSelectedDevice(null); setPhotos([]); }}
          onRefresh={() => fetchPhotos(selectedDevice)}
        />
      )}
    </>
  );
}

function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', type: 'local_folder', folderPath: '' });

  const loadSources = async () => {
    const res = await sourceApi.list();
    setSources(res.sources);
    setLoading(false);
  };

  useEffect(() => { loadSources(); }, []);

  const handleAdd = async () => {
    const config = newSource.type === 'local_folder'
      ? { folderPath: newSource.folderPath }
      : {};
    await sourceApi.create({ name: newSource.name, type: newSource.type, config });
    setShowAddModal(false);
    setNewSource({ name: '', type: 'local_folder', folderPath: '' });
    loadSources();
  };

  const handleTest = async (id: string) => {
    const res = await sourceApi.test(id);
    alert(res.connected ? '✅ Connection successful!' : '❌ Connection failed');
  };

  const handleOAuth = async (id: string) => {
    const res = await sourceApi.getOAuthUrl(id);
    window.open(res.authUrl, '_blank', 'width=600,height=700');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this source?')) {
      await sourceApi.delete(id);
      loadSources();
    }
  };

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <h2>Photo Sources</h2>
        <p>Configure where to sync photos from</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>➕ Add Source</button>
      </div>

      {sources.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No sources configured</h3>
            <p>Add a photo source to start syncing</p>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {sources.map(source => (
            <div key={source.id} className="item-card">
              <div className="item-card-header">
                <div>
                  <div className="item-card-title">
                    {source.type === 'google_photos' ? '🌐' : '📁'} {source.name}
                  </div>
                  <div className="item-card-subtitle">{source.type.replace('_', ' ')}</div>
                </div>
                <span className={`badge badge-${source.isActive ? 'success' : 'warning'}`}>
                  {source.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {source.lastSyncAt && (
                <div className="item-card-meta">
                  <span>Last sync: {new Date(source.lastSyncAt).toLocaleString()}</span>
                </div>
              )}
              <div className="item-card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => handleTest(source.id)}>🔌 Test</button>
                {source.type === 'google_photos' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => handleOAuth(source.id)}>🔐 Auth</button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(source.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <Modal title="Add Photo Source" onClose={() => setShowAddModal(false)}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={newSource.name}
              onChange={e => setNewSource({ ...newSource, name: e.target.value })}
              placeholder="My Photos"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="form-select"
              value={newSource.type}
              onChange={e => setNewSource({ ...newSource, type: e.target.value })}
            >
              <option value="local_folder">Local Folder</option>
              <option value="google_photos">Google Photos</option>
            </select>
          </div>
          {newSource.type === 'local_folder' && (
            <div className="form-group">
              <label className="form-label">Folder Path</label>
              <input
                className="form-input"
                value={newSource.folderPath}
                onChange={e => setNewSource({ ...newSource, folderPath: e.target.value })}
                placeholder="/path/to/photos"
              />
            </div>
          )}
          <div className="modal-footer" style={{ padding: 0, marginTop: 16, border: 'none' }}>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={!newSource.name}>Add Source</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function SyncPage() {
  const [mappings, setMappings] = useState<SyncMapping[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMapping, setNewMapping] = useState({ sourceId: '', deviceId: '', syncMode: 'add_only', schedule: '' });
  const [syncing, setSyncing] = useState<string | null>(null);

  const loadData = async () => {
    const [mappingsRes, devicesRes, sourcesRes] = await Promise.all([
      syncApi.listMappings(),
      deviceApi.list(),
      sourceApi.list(),
    ]);
    setMappings(mappingsRes.mappings);
    setDevices(devicesRes.devices);
    setSources(sourcesRes.sources);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleAdd = async () => {
    await syncApi.createMapping({
      sourceId: newMapping.sourceId,
      deviceId: newMapping.deviceId,
      syncMode: newMapping.syncMode as 'mirror' | 'add_only',
      schedule: newMapping.schedule || undefined,
    });
    setShowAddModal(false);
    setNewMapping({ sourceId: '', deviceId: '', syncMode: 'add_only', schedule: '' });
    loadData();
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      await syncApi.triggerSync(id);
      alert('✅ Sync completed!');
    } catch (e) {
      alert('❌ Sync failed: ' + (e as Error).message);
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this sync mapping?')) {
      await syncApi.deleteMapping(id);
      loadData();
    }
  };

  const getSourceName = (id: string) => sources.find(s => s.id === id)?.name || id;
  const getDeviceName = (id: string) => devices.find(d => d.id === id)?.name || id;

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <h2>Sync Mappings</h2>
        <p>Configure which sources sync to which devices</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)} disabled={devices.length === 0 || sources.length === 0}>
          ➕ Create Mapping
        </button>
        {(devices.length === 0 || sources.length === 0) && (
          <span style={{ marginLeft: 12, color: 'var(--text-secondary)' }}>
            Add devices and sources first
          </span>
        )}
      </div>

      {mappings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No sync mappings</h3>
            <p>Create a mapping to sync photos from a source to a device</p>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {mappings.map(mapping => (
            <div key={mapping.id} className="item-card">
              <div className="item-card-header">
                <div>
                  <div className="item-card-title">
                    {getSourceName(mapping.sourceId)} → {getDeviceName(mapping.deviceId)}
                  </div>
                  <div className="item-card-subtitle">
                    Mode: {mapping.syncMode === 'mirror' ? '🔄 Mirror' : '➕ Add Only'}
                  </div>
                </div>
                <span className={`badge badge-${mapping.isActive ? 'success' : 'warning'}`}>
                  {mapping.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {mapping.schedule && (
                <div className="item-card-meta">
                  <span>⏰ {mapping.schedule === '0 * * * *' ? 'Hourly' :
                    mapping.schedule === '0 */6 * * *' ? 'Every 6 Hours' :
                      mapping.schedule === '0 0 * * *' ? 'Daily' :
                        mapping.schedule === '0 0 * * 0' ? 'Weekly' :
                          mapping.schedule}</span>
                </div>
              )}
              <div className="item-card-actions">
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleSync(mapping.id)}
                  disabled={syncing === mapping.id}
                >
                  {syncing === mapping.id ? '⏳ Syncing...' : '▶️ Sync Now'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(mapping.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <Modal title="Create Sync Mapping" onClose={() => setShowAddModal(false)}>
          <div className="form-group">
            <label className="form-label">Source</label>
            <select
              className="form-select"
              value={newMapping.sourceId}
              onChange={e => setNewMapping({ ...newMapping, sourceId: e.target.value })}
            >
              <option value="">Select a source...</option>
              {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Device</label>
            <select
              className="form-select"
              value={newMapping.deviceId}
              onChange={e => setNewMapping({ ...newMapping, deviceId: e.target.value })}
            >
              <option value="">Select a device...</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Sync Mode</label>
            <select
              className="form-select"
              value={newMapping.syncMode}
              onChange={e => setNewMapping({ ...newMapping, syncMode: e.target.value })}
            >
              <option value="add_only">Add Only (keep existing photos)</option>
              <option value="mirror">Mirror (remove deleted photos)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Schedule</label>
            <select
              className="form-select"
              value={newMapping.schedule}
              onChange={e => setNewMapping({ ...newMapping, schedule: e.target.value })}
            >
              <option value="">Manual (No automatic sync)</option>
              <option value="0 * * * *">Every Hour</option>
              <option value="0 */6 * * *">Every 6 Hours</option>
              <option value="0 0 * * *">Daily</option>
              <option value="0 0 * * 0">Weekly</option>
            </select>
          </div>
          <div className="modal-footer" style={{ padding: 0, marginTop: 16, border: 'none' }}>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={!newMapping.sourceId || !newMapping.deviceId}>
              Create Mapping
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function LogsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    syncApi.getLogs(undefined, 100).then(res => {
      setLogs(res.logs);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <h2>Activity Logs</h2>
        <p>Recent sync operations and events</p>
      </div>

      <div className="card">
        {logs.length === 0 ? (
          <div className="empty-state">
            <h3>No activity yet</h3>
            <p>Sync operations will appear here</p>
          </div>
        ) : (
          <div className="log-list">
            {logs.map(log => (
              <div key={log.id} className="log-item">
                <span className={`badge badge-${log.status === 'success' ? 'success' : log.status === 'failure' ? 'danger' : 'info'}`}>
                  {log.status}
                </span>
                <span className="log-message">
                  <strong>{log.operation}</strong>: {log.message}
                </span>
                <span className="log-time">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function PhotoGallery({ device, photos, onClose, onRefresh }: { device: Device; photos: string[]; onClose: () => void; onRefresh: () => void }) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const getPhotoUrl = (filename: string, thumbnail = false) =>
    `/api/devices/${device.id}/photos/${encodeURIComponent(filename)}${thumbnail ? '?thumbnail=true' : ''}`;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setUploading(true);

    const formData = new FormData();
    formData.append('photo', file);

    try {
      await fetch(`/api/devices/${device.id}/photos`, {
        method: 'POST',
        body: formData,
      });
      alert('Photo uploaded!');
      onRefresh();
    } catch (err) {
      alert('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const toggleSelection = (photo: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(photo)) {
      newSet.delete(photo);
    } else {
      newSet.add(photo);
    }
    setSelectedItems(newSet);
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedItems.size} photo(s)? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const result = await deviceApi.deletePhotos(device.id, Array.from(selectedItems));
      if (result.success) {
        setSelectedItems(new Set());
        setSelectionMode(false);
        onRefresh();
      } else {
        alert('Some photos failed to delete');
      }
    } catch (e) {
      alert('Failed to delete photos: ' + (e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const handleImageLoad = (filename: string) => {
    setLoadedImages(prev => new Set(prev).add(filename));
  };

  const handlePrev = () => {
    if (!selectedPhoto) return;
    const idx = photos.indexOf(selectedPhoto);
    if (idx > 0) setSelectedPhoto(photos[idx - 1]);
  };

  const handleNext = () => {
    if (!selectedPhoto) return;
    const idx = photos.indexOf(selectedPhoto);
    if (idx < photos.length - 1) setSelectedPhoto(photos[idx + 1]);
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3>Photos on {device.name}</h3>
              <span className="badge badge-info">{photos.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {selectionMode ? (
                <>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={selectedItems.size === 0 || deleting}
                    onClick={handleDeleteSelected}
                  >
                    {deleting ? 'Deleting...' : `🗑️ Delete (${selectedItems.size})`}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setSelectionMode(false); setSelectedItems(new Set()); }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectionMode(true)} disabled={photos.length === 0}>
                    ☑️ Select
                  </button>
                  <label className="btn btn-primary btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                    {uploading ? 'Uploading...' : '⬆️ Upload'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                  </label>
                </>
              )}
              <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
            </div>
          </div>
          <div className="modal-body" style={{ overflowY: 'auto' }}>
            {photos.length === 0 ? (
              <p>No photos found on this device.</p>
            ) : (
              <div className="photo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                {photos.map((photo, i) => {
                  const isSelected = selectedItems.has(photo);
                  return (
                    <div
                      key={i}
                      className="photo-item"
                      style={{
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                        outline: isSelected ? '3px solid var(--primary)' : 'none',
                        opacity: selectionMode && !isSelected ? 0.7 : 1
                      }}
                      onClick={() => selectionMode ? toggleSelection(photo) : setSelectedPhoto(photo)}
                    >
                      {!loadedImages.has(photo) && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div className="spinner" />
                        </div>
                      )}

                      {selectionMode && (
                        <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 10 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                        </div>
                      )}

                      <img
                        src={getPhotoUrl(photo, true)}
                        alt={photo}
                        loading="lazy"
                        onLoad={() => handleImageLoad(photo)}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          opacity: loadedImages.has(photo) ? 1 : 0,
                          transition: 'opacity 0.3s'
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox for full-size view */}
      {selectedPhoto && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1001, background: 'rgba(0,0,0,0.95)' }}
          onClick={() => setSelectedPhoto(null)}
        >
          <div style={{ position: 'relative', maxWidth: '95vw', maxHeight: '95vh' }} onClick={e => e.stopPropagation()}>
            <img
              src={getPhotoUrl(selectedPhoto, false)}
              alt={selectedPhoto}
              style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <div style={{
              position: 'absolute',
              bottom: '-40px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '16px',
              alignItems: 'center'
            }}>
              <button
                className="btn btn-secondary"
                onClick={handlePrev}
                disabled={photos.indexOf(selectedPhoto) === 0}
              >
                ← Prev
              </button>
              <span style={{ color: 'white' }}>
                {photos.indexOf(selectedPhoto) + 1} / {photos.length}
              </span>
              <button
                className="btn btn-secondary"
                onClick={handleNext}
                disabled={photos.indexOf(selectedPhoto) === photos.length - 1}
              >
                Next →
              </button>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              style={{ position: 'absolute', top: '-40px', right: 0 }}
              onClick={() => setSelectedPhoto(null)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default App;
