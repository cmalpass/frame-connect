/**
 * Database Helper Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateId, parseJsonField, stringifyJsonField } from '../database/index.js';

describe('Database Helpers', () => {
    describe('generateId', () => {
        it('should generate a valid UUID', () => {
            const id = generateId();
            expect(id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );
        });

        it('should generate unique IDs', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add(generateId());
            }
            expect(ids.size).toBe(100);
        });
    });

    describe('parseJsonField', () => {
        it('should parse valid JSON', () => {
            const result = parseJsonField<{ foo: string }>('{"foo":"bar"}');
            expect(result).toEqual({ foo: 'bar' });
        });

        it('should return null for null input', () => {
            const result = parseJsonField(null);
            expect(result).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            const result = parseJsonField('not-json');
            expect(result).toBeNull();
        });

        it('should parse arrays', () => {
            const result = parseJsonField<number[]>('[1,2,3]');
            expect(result).toEqual([1, 2, 3]);
        });
    });

    describe('stringifyJsonField', () => {
        it('should stringify objects', () => {
            const result = stringifyJsonField({ foo: 'bar' });
            expect(result).toBe('{"foo":"bar"}');
        });

        it('should stringify arrays', () => {
            const result = stringifyJsonField([1, 2, 3]);
            expect(result).toBe('[1,2,3]');
        });

        it('should stringify null', () => {
            const result = stringifyJsonField(null);
            expect(result).toBe('null');
        });

        it('should handle nested objects', () => {
            const result = stringifyJsonField({ a: { b: { c: 1 } } });
            expect(JSON.parse(result)).toEqual({ a: { b: { c: 1 } } });
        });
    });
});
