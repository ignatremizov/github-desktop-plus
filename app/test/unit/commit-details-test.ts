import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  commitDetailsShortcutsEqual,
  createCommitDetailsShortcut,
  defaultCommitDetailsShortcut,
  findCommitDetailsShortcutConflict,
  getCommitDetailsAriaKeyShortcuts,
  getCommitDetailsToggleShortcutLabel,
  isCommitDetailsToggleShortcut,
  parseCommitDetailsShortcut,
  reconcileCommitDetailsPreferencesDraft,
  serializeCommitDetailsShortcut,
  shouldExpandCommitDetailsByDefault,
} from '../../src/lib/commit-details'
import { IMenu, menuFromElectronMenu } from '../../src/models/app-menu'

const modifiedShortcut = {
  key: ' ',
  ctrlKey: true,
  metaKey: false,
  shiftKey: true,
  altKey: false,
}

describe('commit details presentation', () => {
  it('matches the recorded key and modifiers exactly', () => {
    assert.equal(
      isCommitDetailsToggleShortcut(
        defaultCommitDetailsShortcut,
        defaultCommitDetailsShortcut
      ),
      true
    )
    assert.equal(
      isCommitDetailsToggleShortcut(
        { ...defaultCommitDetailsShortcut, key: 'E' },
        defaultCommitDetailsShortcut
      ),
      true
    )
    assert.equal(
      isCommitDetailsToggleShortcut(
        { ...defaultCommitDetailsShortcut, ctrlKey: true },
        defaultCommitDetailsShortcut
      ),
      false
    )
    assert.equal(
      isCommitDetailsToggleShortcut(modifiedShortcut, modifiedShortcut),
      true
    )
    assert.equal(
      isCommitDetailsToggleShortcut(
        { ...modifiedShortcut, shiftKey: false },
        modifiedShortcut
      ),
      false
    )
    assert.equal(
      isCommitDetailsToggleShortcut(defaultCommitDetailsShortcut, 'off'),
      false
    )
  })

  it('captures complete shortcuts and ignores modifier-only events', () => {
    assert.deepEqual(
      createCommitDetailsShortcut({
        key: 'J',
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
        altKey: true,
      }),
      {
        key: 'j',
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
        altKey: true,
      }
    )
    assert.equal(
      createCommitDetailsShortcut({
        key: 'Control',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
      null
    )
    assert.equal(
      createCommitDetailsShortcut({
        key: 'Escape',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
      null
    )
    assert.equal(
      createCommitDetailsShortcut({
        key: 'Delete',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
      null
    )
    assert.equal(
      createCommitDetailsShortcut({
        key: 'Tab',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
      null
    )
    assert.deepEqual(
      createCommitDetailsShortcut({
        key: 'Tab',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }),
      {
        key: 'Tab',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      }
    )
    assert.deepEqual(
      createCommitDetailsShortcut({
        key: '<',
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: false,
      }),
      {
        key: ',',
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: false,
      }
    )
  })

  it('serializes recorded shortcuts and rejects invalid persisted values', () => {
    const serializedShortcut = serializeCommitDetailsShortcut(modifiedShortcut)

    assert.deepEqual(
      parseCommitDetailsShortcut(serializedShortcut),
      modifiedShortcut
    )
    assert.equal(parseCommitDetailsShortcut('off'), 'off')
    assert.deepEqual(
      parseCommitDetailsShortcut(null),
      defaultCommitDetailsShortcut
    )
    assert.deepEqual(
      parseCommitDetailsShortcut('e'),
      defaultCommitDetailsShortcut
    )
    assert.deepEqual(
      parseCommitDetailsShortcut('{"key":"x"}'),
      defaultCommitDetailsShortcut
    )
    for (const key of [
      'Escape',
      'Backspace',
      'Delete',
      'Tab',
      'multiple words',
      '\n',
    ]) {
      assert.deepEqual(
        parseCommitDetailsShortcut(
          JSON.stringify({
            ...defaultCommitDetailsShortcut,
            key,
          })
        ),
        defaultCommitDetailsShortcut
      )
    }
    assert.deepEqual(
      parseCommitDetailsShortcut(
        JSON.stringify({
          ...defaultCommitDetailsShortcut,
          key: 'Delete',
          ctrlKey: true,
        })
      ),
      {
        ...defaultCommitDetailsShortcut,
        key: 'Delete',
        ctrlKey: true,
      }
    )
    for (const shortcut of [
      {
        ...defaultCommitDetailsShortcut,
        key: 'Tab',
        ctrlKey: true,
      },
      {
        ...defaultCommitDetailsShortcut,
        key: 'F10',
        shiftKey: true,
      },
    ]) {
      assert.deepEqual(
        parseCommitDetailsShortcut(serializeCommitDetailsShortcut(shortcut)),
        defaultCommitDetailsShortcut
      )
    }
    assert.equal(serializeCommitDetailsShortcut('off'), 'off')
  })

  it('compares shortcut values rather than object identity', () => {
    assert.equal(
      commitDetailsShortcutsEqual(modifiedShortcut, { ...modifiedShortcut }),
      true
    )
    assert.equal(
      commitDetailsShortcutsEqual(modifiedShortcut, {
        ...modifiedShortcut,
        altKey: true,
      }),
      false
    )
    assert.equal(commitDetailsShortcutsEqual('off', 'off'), true)
    assert.equal(
      commitDetailsShortcutsEqual('off', defaultCommitDetailsShortcut),
      false
    )
  })

  it('finds conflicts regardless of transient menu state', () => {
    const menu: IMenu = {
      type: 'menu',
      items: [
        {
          id: 'repository',
          type: 'submenuItem',
          label: 'Repository',
          enabled: true,
          visible: true,
          accessKey: null,
          menu: {
            id: 'repository',
            type: 'menu',
            items: [
              {
                id: 'push',
                type: 'menuItem',
                label: 'Push',
                enabled: false,
                visible: false,
                accelerator: 'CmdOrCtrl+P',
                accessKey: null,
              },
            ],
          },
        },
      ],
    }

    assert.deepEqual(
      findCommitDetailsShortcutConflict(
        menu,
        {
          ...defaultCommitDetailsShortcut,
          key: 'p',
          ctrlKey: true,
        },
        false
      ),
      { accelerator: 'CmdOrCtrl+P', label: 'Push' }
    )
    assert.deepEqual(
      findCommitDetailsShortcutConflict(
        menu,
        {
          ...defaultCommitDetailsShortcut,
          key: 'p',
          metaKey: true,
        },
        true
      ),
      { accelerator: 'CmdOrCtrl+P', label: 'Push' }
    )
    assert.equal(
      findCommitDetailsShortcutConflict(menu, defaultCommitDetailsShortcut),
      null
    )
  })

  it('finds conflicts with renderer-owned application shortcuts', () => {
    assert.deepEqual(
      findCommitDetailsShortcutConflict(
        undefined,
        {
          ...defaultCommitDetailsShortcut,
          key: 'Tab',
          ctrlKey: true,
          shiftKey: true,
        },
        false
      ),
      {
        accelerator: 'Ctrl+Shift+Tab',
        label: 'Switch repository section',
      }
    )
    assert.deepEqual(
      findCommitDetailsShortcutConflict(
        undefined,
        {
          ...defaultCommitDetailsShortcut,
          key: 'F10',
          shiftKey: true,
        },
        false
      ),
      {
        accelerator: 'Shift+F10',
        label: 'Open context menu',
      }
    )
  })

  it('matches shifted punctuation and native menu access keys', () => {
    const menu: IMenu = {
      type: 'menu',
      items: [
        {
          id: 'file',
          type: 'submenuItem',
          label: '&File',
          enabled: true,
          visible: true,
          accessKey: 'F',
          menu: {
            id: 'file',
            type: 'menu',
            items: [
              {
                id: 'repository-options',
                type: 'menuItem',
                label: 'Repository Options',
                enabled: true,
                visible: true,
                accelerator: 'CmdOrCtrl+Shift+,',
                accessKey: null,
              },
            ],
          },
        },
      ],
    }

    assert.deepEqual(
      findCommitDetailsShortcutConflict(
        menu,
        {
          key: '<',
          ctrlKey: true,
          metaKey: false,
          shiftKey: true,
          altKey: false,
        },
        false
      ),
      {
        accelerator: 'CmdOrCtrl+Shift+,',
        label: 'Repository Options',
      }
    )
    assert.deepEqual(
      findCommitDetailsShortcutConflict(
        menu,
        {
          key: 'f',
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          altKey: true,
        },
        false
      ),
      { accelerator: 'Alt+F', label: '&File' }
    )
  })

  it('normalizes Electron accelerator key names to DOM key names', () => {
    const cases = [
      ['Command+Up', 'ArrowUp', false],
      ['Command+VolumeUp', 'AudioVolumeUp', false],
      ['Command+MediaNextTrack', 'MediaTrackNext', false],
      ['Command+numadd', '+', false],
      ['Command+Plus', '=', true],
      ['Command++', '=', true],
      ['Command+!', '1', true],
      ['Command+F12', 'F12', false],
    ] as const
    cases.forEach(([accelerator, key, shiftKey], index) => {
      const menu: IMenu = {
        type: 'menu',
        items: [
          {
            id: `item-${index}`,
            type: 'menuItem',
            label: `Item ${index}`,
            enabled: true,
            visible: true,
            accelerator,
            accessKey: null,
          },
        ],
      }
      assert.deepEqual(
        findCommitDetailsShortcutConflict(
          menu,
          {
            key,
            ctrlKey: false,
            metaKey: true,
            shiftKey,
            altKey: false,
          },
          true
        ),
        {
          accelerator,
          label: `Item ${index}`,
        }
      )
    })
  })

  it('serializes the effective user-assigned menu accelerator', () => {
    const electronItem = {
      id: 'custom',
      type: 'normal',
      label: 'Custom',
      enabled: true,
      visible: true,
      checked: false,
      accelerator: 'Command+P',
      userAccelerator: 'Command+K',
      role: null,
    } as unknown as Electron.MenuItem
    const menu = menuFromElectronMenu({
      items: [electronItem],
    } as Electron.Menu)
    const item = menu.items[0]

    assert.notEqual(item.type, 'separator')
    assert.notEqual(item.type, 'submenuItem')
    if (item.type === 'separator' || item.type === 'submenuItem') {
      return
    }
    assert.equal(item.accelerator, 'Command+K')
  })

  it('describes visual and assistive shortcut forms', () => {
    assert.equal(
      getCommitDetailsToggleShortcutLabel(defaultCommitDetailsShortcut, false),
      'E'
    )
    assert.equal(
      getCommitDetailsToggleShortcutLabel(modifiedShortcut, false),
      'Ctrl+Shift+Space'
    )
    assert.equal(
      getCommitDetailsToggleShortcutLabel(
        { ...modifiedShortcut, ctrlKey: false, metaKey: true },
        true
      ),
      '⇧⌘Space'
    )
    assert.equal(getCommitDetailsToggleShortcutLabel('off'), null)
    assert.equal(
      getCommitDetailsAriaKeyShortcuts(modifiedShortcut),
      'Control+Shift+Space'
    )
    const plusShortcut = {
      ...defaultCommitDetailsShortcut,
      key: '+',
      ctrlKey: true,
    }
    assert.equal(
      getCommitDetailsToggleShortcutLabel(plusShortcut, false),
      'Ctrl+Plus'
    )
    assert.equal(getCommitDetailsAriaKeyShortcuts(plusShortcut), 'Control+Plus')
    const nonAsciiShortcut = {
      ...defaultCommitDetailsShortcut,
      key: 'ß',
    }
    assert.deepEqual(
      createCommitDetailsShortcut(nonAsciiShortcut),
      nonAsciiShortcut
    )
    assert.equal(
      getCommitDetailsToggleShortcutLabel(nonAsciiShortcut, false),
      'ß'
    )
    assert.equal(getCommitDetailsAriaKeyShortcuts(nonAsciiShortcut), 'ß')
    const emojiShortcut = {
      ...defaultCommitDetailsShortcut,
      key: '🙂',
    }
    assert.deepEqual(createCommitDetailsShortcut(emojiShortcut), emojiShortcut)
    assert.equal(
      getCommitDetailsToggleShortcutLabel(emojiShortcut, false),
      '🙂'
    )
    assert.equal(getCommitDetailsAriaKeyShortcuts(emojiShortcut), '🙂')
    assert.equal(getCommitDetailsAriaKeyShortcuts('off'), undefined)
  })

  it('applies the expanded default only to one selected commit', () => {
    assert.equal(shouldExpandCommitDetailsByDefault(1, true), true)
    assert.equal(shouldExpandCommitDetailsByDefault(1, false), false)
    assert.equal(shouldExpandCommitDetailsByDefault(0, true), false)
    assert.equal(shouldExpandCommitDetailsByDefault(2, true), false)
  })

  it('reconciles external preferences only into untouched draft fields', () => {
    const shortcut = {
      ...defaultCommitDetailsShortcut,
      key: 'k',
      ctrlKey: true,
    }
    const cleanDraft = {
      expandCommitDetailsByDefault: false,
      expandCommitDetailsByDefaultDirty: false,
      commitDetailsShortcut: defaultCommitDetailsShortcut,
      commitDetailsShortcutDirty: false,
    }

    assert.deepEqual(
      reconcileCommitDetailsPreferencesDraft(cleanDraft, {
        expandCommitDetailsByDefault: true,
        commitDetailsShortcut: shortcut,
      }),
      {
        expandCommitDetailsByDefault: true,
        commitDetailsShortcut: shortcut,
      }
    )
    assert.equal(
      reconcileCommitDetailsPreferencesDraft(
        {
          ...cleanDraft,
          expandCommitDetailsByDefaultDirty: true,
          commitDetailsShortcutDirty: true,
        },
        {
          expandCommitDetailsByDefault: true,
          commitDetailsShortcut: shortcut,
        }
      ),
      null
    )
    assert.deepEqual(
      reconcileCommitDetailsPreferencesDraft(
        {
          ...cleanDraft,
          expandCommitDetailsByDefaultDirty: true,
        },
        {
          expandCommitDetailsByDefault: true,
          commitDetailsShortcut: shortcut,
        }
      ),
      {
        expandCommitDetailsByDefault: false,
        commitDetailsShortcut: shortcut,
      }
    )
    assert.equal(
      reconcileCommitDetailsPreferencesDraft(cleanDraft, {
        expandCommitDetailsByDefault: false,
        commitDetailsShortcut: { ...defaultCommitDetailsShortcut },
      }),
      null
    )
  })
})
