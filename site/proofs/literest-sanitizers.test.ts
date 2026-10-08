import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LiteREST } from './index'
import type { DataSource } from '../types'
import type { StarbaseDBConfiguration } from '../handler'

/*
 * Additional MEANINGFUL coverage for LiteREST's input sanitizers (issue #71: raise coverage
 * above 75% with tests that reveal issues, not just line coverage). The existing suite exercises
 * sanitizeIdentifier with 2 inputs and sanitizeOperator with 3; these methods guard raw-SQL
 * construction (e.g. `PRAGMA table_info(${tableName})`), so their edge/branch behaviour is
 * security-relevant. This file covers the full operator mapping table and identifier edge cases
 * (empty, all-invalid, injection-shaped, whitespace, unicode) with NO overlap with the existing file.
 */
let liteRest: LiteREST
beforeEach(() => {
    const mockDataSource = {
        source: 'external',
        external: { dialect: 'sqlite' } as any,
        rpc: { executeQuery: vi.fn() },
    } as any as DataSource
    const mockConfig = {
        outerbaseApiKey: 'mock-api-key',
        role: 'admin',
        features: { allowlist: true, rls: true, rest: true },
    } as StarbaseDBConfiguration
    liteRest = new LiteREST(mockDataSource, mockConfig)
})

describe('LiteREST sanitizers — additional coverage (issue #71)', () => {
    describe('sanitizeIdentifier edge cases', () => {
        const id = (s: string): string =>
            // @ts-expect-error: testing private method
            liteRest.sanitizeIdentifier(s)

        it('empty string stays empty', () => {
            expect(id('')).toBe('')
        })
        it('all-invalid characters are stripped to empty', () => {
            expect(id('$%^&*()!?')).toBe('')
        })
        it('strips an SQL-injection-shaped identifier to bare word chars', () => {
            expect(id('"; DROP TABLE users;--')).toBe('DROPTABLEusers')
            expect(id('Robert");DROP TABLE students;')).toBe(
                'RobertDROPTABLEstudents'
            )
        })
        it('removes whitespace inside an identifier', () => {
            expect(id('user name')).toBe('username')
            expect(id('  spaced  ')).toBe('spaced')
        })
        it('drops non-ASCII/unicode letters (keeps ASCII word chars only)', () => {
            expect(id('café')).toBe('caf')
            expect(id('naïve_table')).toBe('nave_table')
        })
        it('preserves digits, underscores and leading digits', () => {
            expect(id('123table')).toBe('123table')
            expect(id('a_b_1')).toBe('a_b_1')
            expect(id('_hidden')).toBe('_hidden')
        })
    })

    describe('sanitizeOperator full mapping table', () => {
        const op = (s: string | undefined): string =>
            // @ts-expect-error: testing private method
            liteRest.sanitizeOperator(s)

        it('maps every allowed operator to its SQL form', () => {
            expect(op('eq')).toBe('=')
            expect(op('ne')).toBe('!=')
            expect(op('gt')).toBe('>')
            expect(op('lt')).toBe('<')
            expect(op('gte')).toBe('>=')
            expect(op('lte')).toBe('<=')
            expect(op('like')).toBe('LIKE')
            expect(op('in')).toBe('IN')
        })
        it('defaults to "=" for undefined (no operator supplied)', () => {
            expect(op(undefined)).toBe('=')
        })
        it('defaults to "=" for empty string (falsy ⇒ eq)', () => {
            expect(op('')).toBe('=')
        })
        it('defaults to "=" for an unknown/unsupported operator', () => {
            expect(op('xyz')).toBe('=')
            expect(op('DROP')).toBe('=')
        })
    })
})
