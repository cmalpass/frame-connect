import { readdir, stat, copyFile } from 'fs/promises';
import { join, basename, extname } from 'path';
import { createHash } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { BaseSource, PhotoInfo, SourceRecord, registerSourceFactory } from './BaseSource.js';
import { logger } from '../../utils/logger.js';

export interface LocalFolderConfig {
    folderPath: string;
    recursive?: boolean;
    includeExtensions?: string[];
}

const DEFAULT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.webp'];

export class LocalFolderSource extends BaseSource {
    get folderConfig(): LocalFolderConfig {
        return this.config as unknown as LocalFolderConfig;
    }

    async testConnection(): Promise<boolean> {
        try {
            const stats = await stat(this.folderConfig.folderPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    async listAlbums(): Promise<{ id: string; name: string; photoCount?: number }[]> {
        // For local folders, we treat subdirectories as "albums"
        const basePath = this.folderConfig.folderPath;
        const albums: { id: string; name: string; photoCount?: number }[] = [];

        // Add root folder
        const rootPhotos = await this.countPhotosInDir(basePath, false);
        albums.push({
            id: '',
            name: basename(basePath),
            photoCount: rootPhotos,
        });

        // Add subdirectories
        try {
            const entries = await readdir(basePath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const subPath = join(basePath, entry.name);
                    const photoCount = await this.countPhotosInDir(subPath, false);
                    albums.push({
                        id: entry.name,
                        name: entry.name,
                        photoCount,
                    });
                }
            }
        } catch (err) {
            logger.error({ error: err, path: basePath }, 'Failed to list albums');
        }

        return albums;
    }

    async getPhotos(albumId?: string): Promise<PhotoInfo[]> {
        const basePath = albumId
            ? join(this.folderConfig.folderPath, albumId)
            : this.folderConfig.folderPath;

        return this.scanDirectory(basePath, this.folderConfig.recursive ?? false);
    }

    async downloadPhoto(photo: PhotoInfo, tempDir: string): Promise<string> {
        // For local files, we just copy to temp dir
        const tempPath = join(tempDir, basename(photo.path));
        await copyFile(photo.path, tempPath);
        return tempPath;
    }

    private async scanDirectory(dirPath: string, recursive: boolean): Promise<PhotoInfo[]> {
        const photos: PhotoInfo[] = [];
        const extensions = this.folderConfig.includeExtensions ?? DEFAULT_EXTENSIONS;

        try {
            const entries = await readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dirPath, entry.name);

                if (entry.isFile()) {
                    const ext = extname(entry.name).toLowerCase();
                    if (extensions.includes(ext)) {
                        const stats = await stat(fullPath);
                        const hash = await this.computeFileHash(fullPath);

                        photos.push({
                            id: fullPath, // Use full path as ID
                            name: entry.name,
                            path: fullPath,
                            mimeType: this.getMimeType(ext),
                            size: stats.size,
                            createdAt: stats.birthtime,
                            hash,
                        });
                    }
                } else if (entry.isDirectory() && recursive) {
                    const subPhotos = await this.scanDirectory(fullPath, true);
                    photos.push(...subPhotos);
                }
            }
        } catch (err) {
            logger.error({ error: err, path: dirPath }, 'Failed to scan directory');
        }

        return photos;
    }

    private async countPhotosInDir(dirPath: string, recursive: boolean): Promise<number> {
        const extensions = this.folderConfig.includeExtensions ?? DEFAULT_EXTENSIONS;
        let count = 0;

        try {
            const entries = await readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isFile()) {
                    const ext = extname(entry.name).toLowerCase();
                    if (extensions.includes(ext)) {
                        count++;
                    }
                } else if (entry.isDirectory() && recursive) {
                    count += await this.countPhotosInDir(join(dirPath, entry.name), true);
                }
            }
        } catch {
            // Ignore errors
        }

        return count;
    }

    private async computeFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = createHash('md5');
            const stream = createReadStream(filePath);

            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    private getMimeType(ext: string): string {
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.heic': 'image/heic',
            '.webp': 'image/webp',
        };
        return mimeTypes[ext] ?? 'image/jpeg';
    }
}

// Register factory
registerSourceFactory('local_folder', (record) => new LocalFolderSource(record));
