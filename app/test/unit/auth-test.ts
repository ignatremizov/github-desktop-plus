import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'

import { getKeyForEndpoint } from '../../src/lib/auth'

const originalDev = __DEV__
const originalOverride = process.env.GITHUB_DESKTOP_PLUS_KEYCHAIN_APP_NAME

afterEach(() => {
  ;(globalThis as any).__DEV__ = originalDev

  if (originalOverride === undefined) {
    delete process.env.GITHUB_DESKTOP_PLUS_KEYCHAIN_APP_NAME
  } else {
    process.env.GITHUB_DESKTOP_PLUS_KEYCHAIN_APP_NAME = originalOverride
  }
})

describe('auth keychain names', () => {
  it('ignores the keychain app name override outside development builds', () => {
    ;(globalThis as any).__DEV__ = false
    process.env.GITHUB_DESKTOP_PLUS_KEYCHAIN_APP_NAME =
      'GitHub Desktop Plus Test'

    assert.equal(
      getKeyForEndpoint('https://example.test', 'octocat'),
      'GitHub Desktop Plus - https://example.test - octocat'
    )
  })

  it('uses the keychain app name override in development builds', () => {
    ;(globalThis as any).__DEV__ = true
    process.env.GITHUB_DESKTOP_PLUS_KEYCHAIN_APP_NAME =
      'GitHub Desktop Plus Test'

    assert.equal(
      getKeyForEndpoint('https://example.test', 'octocat'),
      'GitHub Desktop Plus Test - https://example.test - octocat'
    )
  })
})
