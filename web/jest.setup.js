// Jest setup file - runs before all tests
import '@testing-library/jest-dom'

// Mock Next.js environment
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: jest.fn((data, options) => ({
      json: jest.fn(() => Promise.resolve(data)),
      status: options?.status || 200,
      ...options,
    })),
    next: jest.fn(),
    redirect: jest.fn(),
  },
}))

// Suppress console warnings in tests (optional)
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: useLayoutEffect does nothing on the server')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})
