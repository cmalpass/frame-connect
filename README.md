# Frameo Sync

Sync photos from various sources (Google Photos, local folders) to your Frameo digital photo frames.

## Features

- 📷 **Multiple Photo Sources**: Google Photos, local folders (more coming soon)
- 📺 **Multi-Device Support**: Sync different albums to different Frameo frames
- 🔄 **Automatic Sync**: Schedule syncs with cron expressions
- 🖼️ **Image Processing**: Auto-resize, format conversion, HEIC support
- 🔒 **OAuth Integration**: Secure Google Photos authorization

## Prerequisites

- Frameo digital photo frame with **ADB enabled**
  - Settings → About → Beta Program → ADB Access → Enable
- For USB connection: Frame connected via USB cable
- For network connection: Frame IP address and ADB port (usually 5555)

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Docker

```bash
# Build and run with Docker Compose
docker compose up --build
```

The server runs on `http://localhost:3000`

## API Endpoints

### Devices
- `GET /api/devices` - List registered frames
- `GET /api/devices/discover` - Discover connected ADB devices
- `POST /api/devices` - Register a new frame
- `GET /api/devices/:id/status` - Get frame status

### Sources
- `GET /api/sources` - List photo sources
- `POST /api/sources` - Create a source
- `GET /api/sources/:id/albums` - List albums
- `GET /api/sources/:id/oauth/google` - Get OAuth URL

### Sync
- `GET /api/sync/mappings` - List sync mappings
- `POST /api/sync/mappings` - Create a mapping
- `POST /api/sync/mappings/:id/sync` - Trigger sync
- `GET /api/sync/logs` - View sync history

## Configuration

Environment variables (or `.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DATABASE_PATH` | ./data/frameo.db | SQLite database path |
| `PHOTOS_PATH` | ./photos | Temp photo storage |
| `GOOGLE_CLIENT_ID` | - | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | - | Google OAuth client secret |

## Setting Up Google Photos

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Photos Library API**
3. Create OAuth 2.0 credentials (Web application)
4. Set redirect URI to `http://localhost:3000/api/oauth/google/callback`
5. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your environment

## Example: Sync Local Folder to Frame

```bash
# 1. Discover devices
curl http://localhost:3000/api/devices/discover

# 2. Register a device
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"name": "Living Room Frame", "serial": "ABCD1234", "connectionType": "network", "networkAddress": "192.168.1.100"}'

# 3. Create a local folder source
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{"name": "Family Photos", "type": "local_folder", "config": {"folderPath": "/path/to/photos"}}'

# 4. Create a sync mapping
curl -X POST http://localhost:3000/api/sync/mappings \
  -H "Content-Type: application/json" \
  -d '{"sourceId": "<source-id>", "deviceId": "<device-id>", "syncMode": "add_only"}'

# 5. Trigger sync
curl -X POST http://localhost:3000/api/sync/mappings/<mapping-id>/sync
```

## License

MIT
