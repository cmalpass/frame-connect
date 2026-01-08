import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { db, generateId } from '../../database/index.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { BaseSource, PhotoInfo, SourceRecord, registerSourceFactory } from './BaseSource.js';

export interface GooglePhotosConfig {
    albumIds?: string[];  // Specific albums to sync (empty = all)
}

interface OAuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
}

export class GooglePhotosSource extends BaseSource {
    private oauth2Client: Auth.OAuth2Client | null = null;

    get photosConfig(): GooglePhotosConfig {
        return this.config as unknown as GooglePhotosConfig;
    }

    private async getAuthClient(): Promise<Auth.OAuth2Client> {
        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
            throw new Error('Google OAuth credentials not configured');
        }

        if (!this.oauth2Client) {
            this.oauth2Client = new google.auth.OAuth2(
                config.GOOGLE_CLIENT_ID,
                config.GOOGLE_CLIENT_SECRET,
                config.GOOGLE_REDIRECT_URI
            );
        }

        // Load stored tokens
        const tokens = this.getStoredTokens();
        if (!tokens) {
            throw new Error('No OAuth tokens found. Please authenticate first.');
        }

        this.oauth2Client.setCredentials({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
        });

        // Check if token needs refresh
        const expiresAt = new Date(tokens.expiresAt);
        if (expiresAt < new Date()) {
            logger.info({ sourceId: this.id }, 'Refreshing Google OAuth token');
            const { credentials } = await this.oauth2Client.refreshAccessToken();

            // Save new tokens
            this.saveTokens({
                accessToken: credentials.access_token!,
                refreshToken: credentials.refresh_token ?? tokens.refreshToken,
                expiresAt: new Date(credentials.expiry_date!).toISOString(),
            });

            this.oauth2Client.setCredentials(credentials);
        }

        return this.oauth2Client;
    }

    // Note: Google Photos Library API is accessed via discovery or direct HTTP
    // For simplicity, we'll use direct HTTP calls since photoslibrary isn't in the base googleapis package
    private async makePhotosApiCall(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<unknown> {
        const auth = await this.getAuthClient();
        const accessToken = (await auth.getAccessToken()).token;

        const url = `https://photoslibrary.googleapis.com/v1/${endpoint}`;
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            throw new Error(`Google Photos API error: ${response.statusText}`);
        }

        return response.json();
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.makePhotosApiCall('albums?pageSize=1');
            return true;
        } catch (err) {
            logger.error({ error: err, sourceId: this.id }, 'Google Photos connection test failed');
            return false;
        }
    }

    async listAlbums(): Promise<{ id: string; name: string; photoCount?: number }[]> {
        const albums: { id: string; name: string; photoCount?: number }[] = [];
        let pageToken: string | undefined;

        do {
            const url = pageToken
                ? `albums?pageSize=50&pageToken=${pageToken}`
                : 'albums?pageSize=50';

            const response = await this.makePhotosApiCall(url) as {
                albums?: Array<{ id: string; title: string; mediaItemsCount?: string }>;
                nextPageToken?: string;
            };

            for (const album of response.albums || []) {
                albums.push({
                    id: album.id,
                    name: album.title,
                    photoCount: album.mediaItemsCount ? parseInt(album.mediaItemsCount) : undefined,
                });
            }

            pageToken = response.nextPageToken;
        } while (pageToken);

        logger.info({ sourceId: this.id, count: albums.length }, 'Listed Google Photos albums');
        return albums;
    }

    async getPhotos(albumId?: string): Promise<PhotoInfo[]> {
        const photoList: PhotoInfo[] = [];
        let pageToken: string | undefined;

        do {
            let response: {
                mediaItems?: Array<{
                    id: string;
                    filename: string;
                    baseUrl: string;
                    mimeType: string;
                    mediaMetadata?: {
                        width?: string;
                        height?: string;
                        creationTime?: string;
                    };
                }>;
                nextPageToken?: string;
            };

            if (albumId) {
                // Search within a specific album
                response = await this.makePhotosApiCall('mediaItems:search', 'POST', {
                    albumId,
                    pageSize: 100,
                    pageToken,
                }) as typeof response;
            } else {
                // List all photos
                const url = pageToken
                    ? `mediaItems?pageSize=100&pageToken=${pageToken}`
                    : 'mediaItems?pageSize=100';
                response = await this.makePhotosApiCall(url) as typeof response;
            }

            for (const item of response.mediaItems || []) {
                // Only include photos (not videos)
                if (item.mimeType?.startsWith('image/')) {
                    photoList.push({
                        id: item.id,
                        name: item.filename,
                        path: item.baseUrl,
                        mimeType: item.mimeType,
                        width: item.mediaMetadata?.width ? parseInt(item.mediaMetadata.width) : undefined,
                        height: item.mediaMetadata?.height ? parseInt(item.mediaMetadata.height) : undefined,
                        createdAt: item.mediaMetadata?.creationTime
                            ? new Date(item.mediaMetadata.creationTime)
                            : undefined,
                    });
                }
            }

            pageToken = response.nextPageToken;
        } while (pageToken);

        logger.info({ sourceId: this.id, albumId, count: photoList.length }, 'Listed Google Photos');
        return photoList;
    }

    async downloadPhoto(photo: PhotoInfo, tempDir: string): Promise<string> {
        // Google Photos baseUrl needs dimension parameters for full resolution
        const downloadUrl = `${photo.path}=d`;  // =d means download original

        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Failed to download photo: ${response.statusText}`);
        }

        const tempPath = join(tempDir, photo.name);
        const fileStream = createWriteStream(tempPath);

        if (response.body) {
            await pipeline(
                Readable.fromWeb(response.body as any),
                fileStream
            );
        }

        return tempPath;
    }

    private getStoredTokens(): OAuthTokens | null {
        const stmt = db.prepare(`
      SELECT access_token, refresh_token, expires_at 
      FROM oauth_tokens 
      WHERE source_id = ? AND provider = 'google'
    `);
        const row = stmt.get(this.id) as { access_token: string; refresh_token: string; expires_at: string } | undefined;

        if (!row) return null;

        return {
            accessToken: row.access_token,
            refreshToken: row.refresh_token,
            expiresAt: row.expires_at,
        };
    }

    private saveTokens(tokens: OAuthTokens): void {
        const now = new Date().toISOString();

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO oauth_tokens (id, source_id, provider, access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (
        COALESCE((SELECT id FROM oauth_tokens WHERE source_id = ? AND provider = 'google'), ?),
        ?, 'google', ?, ?, ?, COALESCE((SELECT created_at FROM oauth_tokens WHERE source_id = ? AND provider = 'google'), ?), ?
      )
    `);

        stmt.run(
            this.id, generateId(),
            this.id,
            tokens.accessToken,
            tokens.refreshToken,
            tokens.expiresAt,
            this.id, now, now
        );
    }

    /**
     * Generate OAuth URL for user authorization
     */
    static getAuthUrl(sourceId: string): string {
        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
            throw new Error('Google OAuth credentials not configured');
        }

        const oauth2Client = new google.auth.OAuth2(
            config.GOOGLE_CLIENT_ID,
            config.GOOGLE_CLIENT_SECRET,
            config.GOOGLE_REDIRECT_URI
        );

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/photoslibrary.readonly',
            ],
            state: sourceId,
            prompt: 'consent',
        });
    }

    /**
     * Exchange authorization code for tokens
     */
    static async handleCallback(code: string, sourceId: string): Promise<void> {
        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
            throw new Error('Google OAuth credentials not configured');
        }

        const oauth2Client = new google.auth.OAuth2(
            config.GOOGLE_CLIENT_ID,
            config.GOOGLE_CLIENT_SECRET,
            config.GOOGLE_REDIRECT_URI
        );

        const { tokens } = await oauth2Client.getToken(code);

        const now = new Date().toISOString();
        const stmt = db.prepare(`
      INSERT OR REPLACE INTO oauth_tokens (id, source_id, provider, access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (?, ?, 'google', ?, ?, ?, ?, ?)
    `);

        stmt.run(
            generateId(),
            sourceId,
            tokens.access_token,
            tokens.refresh_token,
            tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
            now,
            now
        );

        logger.info({ sourceId }, 'Google OAuth tokens saved');
    }
}

// Register factory
registerSourceFactory('google_photos', (record) => new GooglePhotosSource(record));
