import { z } from 'zod';
import { resolve } from 'path';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_PATH: z.string().default('./data/frameo.db'),
    PHOTOS_PATH: z.string().default('./photos'),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

    // Google OAuth (optional - set when configuring Google Photos/Drive)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().default('http://localhost:3000/api/oauth/google/callback'),

    // ADB configuration
    ADB_HOST: z.string().default('localhost'),
    ADB_PORT: z.coerce.number().default(5037),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Invalid environment configuration:');
        console.error(result.error.format());
        process.exit(1);
    }

    return {
        ...result.data,
        DATABASE_PATH: resolve(result.data.DATABASE_PATH),
        PHOTOS_PATH: resolve(result.data.PHOTOS_PATH),
    };
}

export const config = loadConfig();
