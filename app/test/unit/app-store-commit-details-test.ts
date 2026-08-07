import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'

import {
  CommitDetailsShortcut,
  defaultCommitDetailsShortcut,
  serializeCommitDetailsShortcut,
} from '../../src/lib/commit-details'
import { AppStore } from '../../src/lib/stores/app-store'

const expandStorageKey = 'expand-commit-details-by-default'
const shortcutStorageKey = 'commit-details-shortcut-key'

interface ICommitDetailsAppStoreHarness {
  expandCommitDetailsByDefault: boolean
  commitDetailsShortcut: CommitDetailsShortcut
  emitUpdate: () => void
  _setExpandCommitDetailsByDefault: (
    expandCommitDetailsByDefault: boolean
  ) => void
  _setCommitDetailsShortcut: (
    commitDetailsShortcut: CommitDetailsShortcut
  ) => void
}

function createHarness() {
  return Object.assign(Object.create(AppStore.prototype), {
    expandCommitDetailsByDefault: false,
    commitDetailsShortcut: defaultCommitDetailsShortcut,
    emitUpdate: () => {},
  }) as ICommitDetailsAppStoreHarness
}

afterEach(() => {
  localStorage.removeItem(expandStorageKey)
  localStorage.removeItem(shortcutStorageKey)
})

describe('AppStore commit details preferences', () => {
  it('persists an explicit draft even when cached state already matches it', () => {
    const store = createHarness()
    const otherShortcut = {
      ...defaultCommitDetailsShortcut,
      key: 'k',
      ctrlKey: true,
    }
    localStorage.setItem(expandStorageKey, '1')
    localStorage.setItem(
      shortcutStorageKey,
      serializeCommitDetailsShortcut(otherShortcut)
    )

    store._setExpandCommitDetailsByDefault(false)
    store._setCommitDetailsShortcut(defaultCommitDetailsShortcut)

    assert.equal(localStorage.getItem(expandStorageKey), '0')
    assert.equal(
      localStorage.getItem(shortcutStorageKey),
      serializeCommitDetailsShortcut(defaultCommitDetailsShortcut)
    )
  })
})
