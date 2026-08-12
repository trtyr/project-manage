import { describe, it, expect } from 'vitest'
import { classifyApiError } from './index'

// Builds an axios-shaped error: `{ response?: { status? }, message? }`.
// `classifyApiError` only reads those two fields, so we cast a plain object.
function axiosError(status: number | undefined, message = 'boom'): unknown {
  return { response: { status }, message }
}

/**
 * Contract tests for `classifyApiError`, pinning the classification table
 * documented in docs/context/conventions.md §6.1. The React UI relies on
 * `kind` to decide which error surface to render, so this mapping is a
 * real behavioural contract — not an implementation detail.
 */
describe('classifyApiError — conventions.md §6.1 contract', () => {
  describe('offline — no HTTP response reached the server', () => {
    it('classifies a request with no `response` as offline (network down)', () => {
      // axios sets `message: 'Network Error'` and no `response` on failure.
      expect(classifyApiError({ message: 'Network Error' })).toEqual({
        kind: 'offline',
        message: 'Network Error',
      })
    })

    it('classifies a timeout (no response) as offline', () => {
      expect(
        classifyApiError({ message: 'timeout of 30000ms exceeded' }),
      ).toMatchObject({ kind: 'offline' })
    })

    it('falls back to 未知错误 when the error has no message', () => {
      expect(classifyApiError(undefined)).toEqual({
        kind: 'offline',
        message: '未知错误',
      })
    })
  })

  describe('server — 5xx [500, 600)', () => {
    it.each([500, 502, 503, 599])(
      'classifies status %i as server',
      (status) => {
        const info = classifyApiError(axiosError(status))
        expect(info.kind).toBe('server')
        expect(info.status).toBe(status)
      },
    )
  })

  describe('validation — 400 / 422', () => {
    it.each([400, 422])('classifies status %i as validation', (status) => {
      const info = classifyApiError(axiosError(status))
      expect(info.kind).toBe('validation')
      expect(info.status).toBe(status)
    })
  })

  describe('conflict — 409', () => {
    it('classifies status 409 as conflict', () => {
      const info = classifyApiError(axiosError(409))
      expect(info.kind).toBe('conflict')
      expect(info.status).toBe(409)
    })
  })

  describe('unknown — everything else', () => {
    it.each([200, 301, 401, 403, 404, 600])(
      'classifies status %i as unknown',
      (status) => {
        const info = classifyApiError(axiosError(status))
        expect(info.kind).toBe('unknown')
        expect(info.status).toBe(status)
      },
    )

    it('classifies a response with undefined status as unknown', () => {
      const info = classifyApiError({ response: {}, message: 'weird' })
      expect(info.kind).toBe('unknown')
    })
  })

  describe('boundary invariants', () => {
    it('server upper bound is exclusive: 599 server, 600 unknown', () => {
      expect(classifyApiError(axiosError(599)).kind).toBe('server')
      expect(classifyApiError(axiosError(600)).kind).toBe('unknown')
    })

    it('server lower bound is inclusive: 499 unknown, 500 server', () => {
      expect(classifyApiError(axiosError(499)).kind).toBe('unknown')
      expect(classifyApiError(axiosError(500)).kind).toBe('server')
    })
  })

  describe('message propagation', () => {
    it('forwards the underlying error message', () => {
      const info = classifyApiError({
        response: { status: 503 },
        message: 'Service Unavailable',
      })
      expect(info.message).toBe('Service Unavailable')
    })
  })
})
