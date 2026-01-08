import sharp from 'sharp';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join, basename, extname } from 'path';
import heicConvert from 'heic-convert';
import { logger } from '../../utils/logger.js';

export interface ProcessingOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
    autoRotate?: boolean;
}

export interface ProcessedImage {
    path: string;
    width: number;
    height: number;
    size: number;
    format: string;
}

const DEFAULT_OPTIONS: ProcessingOptions = {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 85,
    format: 'jpeg',
    autoRotate: true,
};

export class ImageProcessor {
    private tempDir: string;

    constructor(tempDir: string) {
        this.tempDir = tempDir;
    }

    /**
     * Process an image for optimal display on Frameo frames
     */
    async processImage(inputPath: string, options: ProcessingOptions = {}): Promise<ProcessedImage> {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        const inputExt = extname(inputPath).toLowerCase();
        const outputName = `${basename(inputPath, extname(inputPath))}.${opts.format}`;
        const outputPath = join(this.tempDir, outputName);

        let imageBuffer: Buffer;

        // Handle HEIC conversion first
        if (inputExt === '.heic' || inputExt === '.heif') {
            logger.debug({ inputPath }, 'Converting HEIC image');
            const inputBuffer = await readFile(inputPath);
            imageBuffer = Buffer.from(
                await heicConvert({
                    buffer: inputBuffer,
                    format: 'JPEG',
                    quality: 1,
                })
            );
        } else {
            imageBuffer = await readFile(inputPath);
        }

        // Process with Sharp
        let pipeline = sharp(imageBuffer);

        // Auto-rotate based on EXIF data
        if (opts.autoRotate) {
            pipeline = pipeline.rotate();
        }

        // Get original metadata
        const metadata = await pipeline.metadata();

        // Resize if needed (maintaining aspect ratio)
        if (opts.maxWidth || opts.maxHeight) {
            pipeline = pipeline.resize({
                width: opts.maxWidth,
                height: opts.maxHeight,
                fit: 'inside',
                withoutEnlargement: true,
            });
        }

        // Output format and quality
        switch (opts.format) {
            case 'jpeg':
                pipeline = pipeline.jpeg({ quality: opts.quality });
                break;
            case 'png':
                pipeline = pipeline.png();
                break;
            case 'webp':
                pipeline = pipeline.webp({ quality: opts.quality });
                break;
        }

        // Write processed image
        const outputBuffer = await pipeline.toBuffer();
        await writeFile(outputPath, outputBuffer);

        // Get output metadata
        const outputMetadata = await sharp(outputBuffer).metadata();

        logger.debug({
            inputPath,
            outputPath,
            originalSize: metadata.size,
            outputSize: outputBuffer.length,
            width: outputMetadata.width,
            height: outputMetadata.height,
        }, 'Image processed');

        return {
            path: outputPath,
            width: outputMetadata.width || 0,
            height: outputMetadata.height || 0,
            size: outputBuffer.length,
            format: opts.format || 'jpeg',
        };
    }

    /**
     * Get image metadata without processing
     */
    async getMetadata(imagePath: string): Promise<{
        width: number;
        height: number;
        format: string;
        size: number;
    }> {
        const inputExt = extname(imagePath).toLowerCase();

        // HEIC needs conversion first
        if (inputExt === '.heic' || inputExt === '.heif') {
            const inputBuffer = await readFile(imagePath);
            const jpegBuffer = Buffer.from(
                await heicConvert({
                    buffer: inputBuffer,
                    format: 'JPEG',
                    quality: 1,
                })
            );
            const metadata = await sharp(jpegBuffer).metadata();
            return {
                width: metadata.width || 0,
                height: metadata.height || 0,
                format: 'heic',
                size: inputBuffer.length,
            };
        }

        const metadata = await sharp(imagePath).metadata();
        return {
            width: metadata.width || 0,
            height: metadata.height || 0,
            format: metadata.format || 'unknown',
            size: metadata.size || 0,
        };
    }

    /**
     * Clean up temp file
     */
    async cleanup(filePath: string): Promise<void> {
        try {
            await unlink(filePath);
        } catch {
            // Ignore cleanup errors
        }
    }
}

export const createImageProcessor = (tempDir: string) => new ImageProcessor(tempDir);
