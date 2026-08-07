import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  CommitDetailsShortcut,
  defaultCommitDetailsShortcut,
} from '../../../src/lib/commit-details'
import { IMenu } from '../../../src/models/app-menu'
import { Keyboard } from '../../../src/ui/preferences/keyboard'
import { fireEvent, render, screen } from '../../helpers/ui/render'

describe('Keyboard preferences', () => {
  it('records arbitrary key combinations', () => {
    let selectedShortcut: CommitDetailsShortcut = defaultCommitDetailsShortcut
    const view = render(
      <Keyboard
        appMenu={undefined}
        onIgnoreMenuShortcutsChanged={() => {}}
        commitDetailsShortcut={defaultCommitDetailsShortcut}
        onCommitDetailsShortcutChanged={shortcut => {
          selectedShortcut = shortcut
        }}
      />
    )
    const recorder = view.container.querySelector<HTMLButtonElement>(
      '#commit-details-shortcut-recorder'
    )

    assert.ok(recorder)
    assert.equal(recorder.textContent, 'E')

    fireEvent.click(recorder)
    assert.equal(recorder.textContent, 'Press shortcut…')

    fireEvent.keyDown(recorder, {
      key: 'J',
      code: 'KeyJ',
      altKey: true,
      shiftKey: true,
    })

    assert.deepEqual(selectedShortcut, {
      key: 'j',
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      altKey: true,
    })
    assert.equal(recorder.textContent, 'E')
    fireEvent.keyUp(window, { key: 'j', code: 'KeyJ' })
    fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftLeft' })
    fireEvent.keyUp(window, { key: 'Alt', code: 'AltLeft' })
  })

  it('cancels recording with Escape and disables it with Clear', () => {
    const recordedShortcuts: CommitDetailsShortcut[] = []
    const view = render(
      <Keyboard
        appMenu={undefined}
        onIgnoreMenuShortcutsChanged={() => {}}
        commitDetailsShortcut={defaultCommitDetailsShortcut}
        onCommitDetailsShortcutChanged={shortcut => {
          recordedShortcuts.push(shortcut)
        }}
      />
    )
    const recorder = view.container.querySelector<HTMLButtonElement>(
      '#commit-details-shortcut-recorder'
    )

    assert.ok(recorder)
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'Escape', code: 'Escape' })
    assert.deepEqual(recordedShortcuts, [])
    assert.equal(recorder.textContent, 'E')

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    assert.deepEqual(recordedShortcuts, ['off'])
  })

  it('consumes held cancellation and activation keys through keyup', () => {
    let leakedKeyDowns = 0
    const recordedShortcuts: CommitDetailsShortcut[] = []
    const onWindowKeyDown = () => {
      leakedKeyDowns++
    }
    window.addEventListener('keydown', onWindowKeyDown)

    const view = render(
      <Keyboard
        appMenu={undefined}
        onIgnoreMenuShortcutsChanged={() => {}}
        commitDetailsShortcut={defaultCommitDetailsShortcut}
        onCommitDetailsShortcutChanged={shortcut => {
          recordedShortcuts.push(shortcut)
        }}
      />
    )
    const recorder = view.container.querySelector<HTMLButtonElement>(
      '#commit-details-shortcut-recorder'
    )

    assert.ok(recorder)
    fireEvent.click(recorder)
    assert.equal(
      fireEvent.keyDown(recorder, { key: 'Escape', code: 'Escape' }),
      false
    )
    assert.equal(
      fireEvent.keyDown(recorder, {
        key: 'Escape',
        code: 'Escape',
        repeat: true,
      }),
      false
    )
    assert.equal(
      fireEvent.keyUp(recorder, { key: 'Escape', code: 'Escape' }),
      false
    )
    assert.equal(leakedKeyDowns, 0)
    assert.deepEqual(recordedShortcuts, [])

    for (const key of ['Enter', ' ']) {
      fireEvent.click(recorder)
      fireEvent.keyDown(recorder, { key, code: key === ' ' ? 'Space' : key })
      fireEvent.keyDown(recorder, {
        key,
        code: key === ' ' ? 'Space' : key,
        repeat: true,
      })
      fireEvent.keyUp(recorder, { key, code: key === ' ' ? 'Space' : key })
    }

    assert.equal(leakedKeyDowns, 0)
    assert.equal(recordedShortcuts.length, 2)
    assert.match(
      recorder.getAttribute('aria-label') ?? '',
      /Current shortcut: E/
    )
    window.removeEventListener('keydown', onWindowKeyDown)
  })

  it('consumes every key in a recorded chord in either release order', () => {
    const leakedKeyUpCodes: string[] = []
    const ignoreMenuShortcutChanges: boolean[] = []
    const onWindowKeyUp = (event: KeyboardEvent) => {
      leakedKeyUpCodes.push(event.code)
    }
    window.addEventListener('keyup', onWindowKeyUp)

    const view = render(
      <Keyboard
        appMenu={undefined}
        onIgnoreMenuShortcutsChanged={ignore => {
          ignoreMenuShortcutChanges.push(ignore)
        }}
        commitDetailsShortcut={defaultCommitDetailsShortcut}
        onCommitDetailsShortcutChanged={() => {}}
      />
    )
    const recorder = view.container.querySelector<HTMLButtonElement>(
      '#commit-details-shortcut-recorder'
    )
    assert.ok(recorder)

    for (const releasePrimaryFirst of [true, false]) {
      fireEvent.click(recorder)
      fireEvent.keyDown(recorder, {
        key: 'Control',
        code: 'ControlLeft',
        ctrlKey: true,
      })
      fireEvent.keyDown(recorder, {
        key: 'J',
        code: 'KeyJ',
        ctrlKey: true,
      })

      const releases = releasePrimaryFirst
        ? [
            { key: 'j', code: 'KeyJ' },
            { key: 'Control', code: 'ControlLeft' },
          ]
        : [
            { key: 'Control', code: 'ControlLeft' },
            { key: 'j', code: 'KeyJ' },
          ]
      for (const release of releases) {
        fireEvent.keyUp(recorder, release)
      }
    }

    assert.deepEqual(leakedKeyUpCodes, [])
    assert.deepEqual(ignoreMenuShortcutChanges, [true, false, true, false])
    window.removeEventListener('keyup', onWindowKeyUp)
  })

  it('keeps pre-held modifiers captured until they are released', () => {
    const leakedKeyUpCodes: string[] = []
    const ignoreMenuShortcutChanges: boolean[] = []
    const onWindowKeyUp = (event: KeyboardEvent) => {
      leakedKeyUpCodes.push(event.code)
    }
    window.addEventListener('keyup', onWindowKeyUp)

    const view = render(
      <Keyboard
        appMenu={undefined}
        onIgnoreMenuShortcutsChanged={ignore => {
          ignoreMenuShortcutChanges.push(ignore)
        }}
        commitDetailsShortcut={defaultCommitDetailsShortcut}
        onCommitDetailsShortcutChanged={() => {}}
      />
    )
    const recorder = view.container.querySelector<HTMLButtonElement>(
      '#commit-details-shortcut-recorder'
    )
    assert.ok(recorder)

    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, {
      key: 'j',
      code: 'KeyJ',
      ctrlKey: true,
    })
    fireEvent.keyUp(window, { key: 'j', code: 'KeyJ' })
    assert.deepEqual(ignoreMenuShortcutChanges, [true])

    fireEvent.keyUp(window, { key: 'Control', code: 'ControlLeft' })
    assert.deepEqual(ignoreMenuShortcutChanges, [true, false])
    assert.deepEqual(leakedKeyUpCodes, [])
    window.removeEventListener('keyup', onWindowKeyUp)
  })

  it('keeps a recorded chord captured after the recorder unmounts', () => {
    const leakedKeyUpCodes: string[] = []
    const ignoreMenuShortcutChanges: boolean[] = []
    const onWindowKeyUp = (event: KeyboardEvent) => {
      leakedKeyUpCodes.push(event.code)
    }
    window.addEventListener('keyup', onWindowKeyUp)

    const view = render(
      <Keyboard
        appMenu={undefined}
        onIgnoreMenuShortcutsChanged={ignore => {
          ignoreMenuShortcutChanges.push(ignore)
        }}
        commitDetailsShortcut={defaultCommitDetailsShortcut}
        onCommitDetailsShortcutChanged={() => {}}
      />
    )
    const recorder = view.container.querySelector<HTMLButtonElement>(
      '#commit-details-shortcut-recorder'
    )
    assert.ok(recorder)

    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, {
      key: 'Control',
      code: 'ControlLeft',
      ctrlKey: true,
    })
    fireEvent.keyDown(recorder, {
      key: 'j',
      code: 'KeyJ',
      ctrlKey: true,
    })
    view.unmount()

    fireEvent.keyUp(window, { key: 'j', code: 'KeyJ' })
    fireEvent.keyUp(window, { key: 'Control', code: 'ControlLeft' })

    assert.deepEqual(ignoreMenuShortcutChanges, [true, false])
    assert.deepEqual(leakedKeyUpCodes, [])
    window.removeEventListener('keyup', onWindowKeyUp)
  })

  it('rejects shortcuts owned by the application menu', () => {
    const appMenu: IMenu = {
      type: 'menu',
      items: [
        {
          id: 'push',
          type: 'menuItem',
          label: '&Push',
          enabled: true,
          visible: true,
          accelerator: 'CmdOrCtrl+P',
          accessKey: null,
        },
      ],
    }
    const recordedShortcuts: CommitDetailsShortcut[] = []
    const view = render(
      <Keyboard
        appMenu={appMenu}
        onIgnoreMenuShortcutsChanged={() => {}}
        commitDetailsShortcut={defaultCommitDetailsShortcut}
        onCommitDetailsShortcutChanged={shortcut => {
          recordedShortcuts.push(shortcut)
        }}
      />
    )
    const recorder = view.container.querySelector<HTMLButtonElement>(
      '#commit-details-shortcut-recorder'
    )
    assert.ok(recorder)

    fireEvent.click(recorder)
    assert.match(
      recorder.getAttribute('aria-label') ?? '',
      /Recording shortcut/
    )
    fireEvent.keyDown(recorder, {
      key: 'p',
      code: 'KeyP',
      ctrlKey: !__DARWIN__,
      metaKey: __DARWIN__,
    })

    assert.deepEqual(recordedShortcuts, [])
    assert.match(screen.getByRole('alert').textContent ?? '', /used by Push/)
    assert.match(
      recorder.getAttribute('aria-label') ?? '',
      /already used by Push/
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    assert.equal(screen.queryByRole('alert'), null)
  })

  it('rejects shortcuts owned by renderer navigation', () => {
    const recordedShortcuts: CommitDetailsShortcut[] = []
    const view = render(
      <Keyboard
        appMenu={undefined}
        onIgnoreMenuShortcutsChanged={() => {}}
        commitDetailsShortcut={defaultCommitDetailsShortcut}
        onCommitDetailsShortcutChanged={shortcut => {
          recordedShortcuts.push(shortcut)
        }}
      />
    )
    const recorder = view.container.querySelector<HTMLButtonElement>(
      '#commit-details-shortcut-recorder'
    )
    assert.ok(recorder)

    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, {
      key: 'Tab',
      code: 'Tab',
      ctrlKey: true,
    })

    assert.deepEqual(recordedShortcuts, [])
    assert.match(
      screen.getByRole('alert').textContent ?? '',
      /used by Switch repository section/
    )

    fireEvent.keyUp(window, { key: 'Tab', code: 'Tab' })
    fireEvent.keyUp(window, { key: 'Control', code: 'ControlLeft' })
  })
})
