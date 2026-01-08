import cron from 'node-cron';
import { syncEngine, SyncMapping } from './SyncEngine.js';
import { logger } from '../../utils/logger.js';

interface ScheduledTask {
    mappingId: string;
    task: cron.ScheduledTask;
}

export class SyncScheduler {
    private tasks: Map<string, ScheduledTask> = new Map();
    private isRunning: boolean = false;

    /**
     * Start the scheduler
     */
    start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        logger.info('Sync scheduler started');

        // Load all active mappings with schedules
        const mappings = syncEngine.getMappings().filter(m => m.isActive && m.schedule);

        for (const mapping of mappings) {
            this.scheduleMapping(mapping);
        }
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (!this.isRunning) return;

        for (const [id, scheduled] of this.tasks) {
            scheduled.task.stop();
        }
        this.tasks.clear();

        this.isRunning = false;
        logger.info('Sync scheduler stopped');
    }

    /**
     * Schedule a sync mapping
     */
    scheduleMapping(mapping: SyncMapping): void {
        if (!mapping.schedule) return;

        // Validate cron expression
        if (!cron.validate(mapping.schedule)) {
            logger.error({ mappingId: mapping.id, schedule: mapping.schedule }, 'Invalid cron expression');
            return;
        }

        // Stop existing task if any
        this.unscheduleMapping(mapping.id);

        // Create new scheduled task
        const task = cron.schedule(mapping.schedule, async () => {
            logger.info({ mappingId: mapping.id }, 'Running scheduled sync');

            try {
                const result = await syncEngine.executeSync(mapping.id);
                logger.info({ mappingId: mapping.id, result }, 'Scheduled sync completed');
            } catch (err) {
                logger.error({ mappingId: mapping.id, error: err }, 'Scheduled sync failed');
            }
        });

        this.tasks.set(mapping.id, { mappingId: mapping.id, task });
        logger.info({ mappingId: mapping.id, schedule: mapping.schedule }, 'Sync scheduled');
    }

    /**
     * Unschedule a sync mapping
     */
    unscheduleMapping(mappingId: string): void {
        const scheduled = this.tasks.get(mappingId);
        if (scheduled) {
            scheduled.task.stop();
            this.tasks.delete(mappingId);
            logger.info({ mappingId }, 'Sync unscheduled');
        }
    }

    /**
     * Get scheduled task info
     */
    getScheduledTasks(): Array<{ mappingId: string; schedule: string }> {
        const result: Array<{ mappingId: string; schedule: string }> = [];

        for (const [id, scheduled] of this.tasks) {
            const mapping = syncEngine.getMapping(id);
            if (mapping?.schedule) {
                result.push({ mappingId: id, schedule: mapping.schedule });
            }
        }

        return result;
    }

    /**
     * Trigger an immediate sync for a mapping
     */
    async triggerSync(mappingId: string): Promise<void> {
        logger.info({ mappingId }, 'Triggering manual sync');
        await syncEngine.executeSync(mappingId);
    }
}

// Singleton instance
export const syncScheduler = new SyncScheduler();
