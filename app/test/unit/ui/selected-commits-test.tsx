import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { ImageDiffType } from '../../../src/models/diff'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { SelectedCommits } from '../../../src/ui/history/selected-commits'
import {
  CommitDetailsShortcut,
  defaultCommitDetailsShortcut,
} from '../../../src/lib/commit-details'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function createRepository() {
  const owner = new Owner('octocat', 'https://api.github.com', 1)
  const gitHubRepository = new GitHubRepository(
    'desktop',
    'github',
    owner,
    null,
    99
  )

  return new Repository('/tmp/desktop-fixture', 123, gitHubRepository, false)
}

function createCommit(sha: string, summary: string) {
  const identity = new CommitIdentity(
    'Octocat',
    'octocat@example.com',
    new Date('2026-01-01T00:00:00.000Z')
  )

  return new Commit(
    sha,
    sha.substring(0, 7),
    summary,
    '',
    identity,
    identity,
    [],
    [],
    []
  )
}

const repository = createRepository()
const firstCommit = createCommit(
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'first'
)
const secondCommit = createCommit(
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'second'
)
const xShortcut = { ...defaultCommitDetailsShortcut, key: 'x' }
const modifiedShortcut = {
  key: ' ',
  ctrlKey: !__DARWIN__,
  metaKey: __DARWIN__,
  shiftKey: true,
  altKey: false,
}

function renderSelectedCommit(
  commit: Commit,
  expandCommitDetailsByDefault = false,
  commitDetailsShortcut: CommitDetailsShortcut = defaultCommitDetailsShortcut,
  isShowingModal = false,
  isShowingFoldout = false,
  enableCommitDetailsShortcut = true
) {
  return (
    <SelectedCommits
      repository={repository}
      dispatcher={{} as Dispatcher}
      emoji={new Map()}
      selectedCommits={[commit]}
      shasInDiff={[commit.sha]}
      localCommitSHAs={[]}
      changesetData={{ files: [], linesAdded: 1, linesDeleted: 0 }}
      selectedFile={null}
      currentDiff={null}
      commitSummaryWidth={{ value: 250, min: 100, max: 500 }}
      selectedDiffType={ImageDiffType.TwoUp}
      onOpenInExternalEditor={() => {}}
      onViewCommitOnGitHub={() => {}}
      hideWhitespaceInDiff={false}
      showSideBySideDiff={false}
      showDiffMinimap={false}
      wrapDiffLines={true}
      enhancedDiffHighlighting={false}
      expandCommitDetailsByDefault={expandCommitDetailsByDefault}
      commitDetailsShortcut={commitDetailsShortcut}
      isShowingModal={isShowingModal}
      isShowingFoldout={isShowingFoldout}
      enableCommitDetailsShortcut={enableCommitDetailsShortcut}
      onOpenBinaryFile={() => {}}
      onOpenSubmodule={() => {}}
      onChangeImageDiffType={() => {}}
      onDiffOptionsOpened={() => {}}
      showDragOverlay={false}
      isContiguous={true}
      accounts={[]}
    />
  )
}

describe('SelectedCommits', () => {
  it('toggles commit details while focus is in the diff pane', () => {
    const view = render(renderSelectedCommit(firstCommit))
    const history = view.container.querySelector('#history')
    const diff = view.container.querySelector<HTMLElement>('#diff')

    assert.ok(history)
    assert.ok(diff)
    assert.equal(history.classList.contains('collapsed'), true)

    diff.tabIndex = -1
    diff.focus()
    assert.equal(document.activeElement, diff)

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    assert.equal(history.classList.contains('collapsed'), true)

    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('expanded'), true)

    const input = document.createElement('input')
    view.container.appendChild(input)
    input.focus()

    fireEvent.keyDown(input, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('expanded'), true)
  })

  it('restores the configured default when selecting another commit', () => {
    const view = render(renderSelectedCommit(firstCommit, true))
    const getHistory = () => view.container.querySelector('#history')

    assert.equal(getHistory()?.classList.contains('expanded'), true)

    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(getHistory()?.classList.contains('collapsed'), true)

    view.rerender(renderSelectedCommit(secondCommit, true))
    assert.equal(getHistory()?.classList.contains('expanded'), true)
  })

  it('uses the configured single-key shortcut', () => {
    const view = render(renderSelectedCommit(firstCommit, false, xShortcut))
    const history = view.container.querySelector('#history')

    assert.ok(history)
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('collapsed'), true)

    fireEvent.keyDown(window, { code: 'KeyX', key: 'x' })
    assert.equal(history.classList.contains('expanded'), true)
  })

  it('does not toggle while the shortcut is off', () => {
    const view = render(renderSelectedCommit(firstCommit, false, 'off'))
    const history = view.container.querySelector('#history')

    assert.ok(history)
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('collapsed'), true)
    assert.equal(
      screen
        .getByRole('button', { name: 'Expand commit details' })
        .getAttribute('aria-keyshortcuts'),
      null
    )
  })

  it('does not toggle behind a modal or foldout', () => {
    const view = render(
      renderSelectedCommit(
        firstCommit,
        false,
        defaultCommitDetailsShortcut,
        true,
        false
      )
    )
    const history = view.container.querySelector('#history')

    assert.ok(history)
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('collapsed'), true)

    view.rerender(
      renderSelectedCommit(
        firstCommit,
        false,
        defaultCommitDetailsShortcut,
        false,
        true
      )
    )
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('collapsed'), true)

    view.rerender(renderSelectedCommit(firstCommit))
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('expanded'), true)
  })

  it('uses the configured portable modified shortcut', () => {
    const view = render(
      renderSelectedCommit(firstCommit, false, modifiedShortcut)
    )
    const history = view.container.querySelector('#history')

    assert.ok(history)
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('collapsed'), true)

    fireEvent.keyDown(window, {
      code: 'Space',
      key: ' ',
      ctrlKey: !__DARWIN__,
      metaKey: __DARWIN__,
      shiftKey: true,
    })
    assert.equal(history.classList.contains('expanded'), true)
  })

  it('does not toggle outside the History section', () => {
    const view = render(
      renderSelectedCommit(
        firstCommit,
        false,
        defaultCommitDetailsShortcut,
        false,
        false,
        false
      )
    )
    const history = view.container.querySelector('#history')

    assert.ok(history)
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('collapsed'), true)
    assert.equal(
      screen
        .getByRole('button', { name: 'Expand commit details' })
        .getAttribute('aria-keyshortcuts'),
      null
    )
  })

  it('preserves activation and navigation keys on interactive controls', () => {
    const spaceShortcut = {
      ...defaultCommitDetailsShortcut,
      key: ' ',
    }
    const view = render(renderSelectedCommit(firstCommit, false, spaceShortcut))
    const history = view.container.querySelector('#history')
    const button = document.createElement('button')
    view.container.appendChild(button)
    button.focus()

    assert.ok(history)
    fireEvent.keyDown(button, { code: 'Space', key: ' ' })
    assert.equal(history.classList.contains('collapsed'), true)

    view.rerender(
      renderSelectedCommit(firstCommit, false, {
        ...defaultCommitDetailsShortcut,
        key: 'Enter',
      })
    )
    fireEvent.keyDown(button, { code: 'Enter', key: 'Enter' })
    assert.equal(history.classList.contains('collapsed'), true)

    const tab = document.createElement('div')
    tab.setAttribute('role', 'tab')
    view.container.appendChild(tab)
    view.rerender(
      renderSelectedCommit(firstCommit, false, {
        ...defaultCommitDetailsShortcut,
        key: 'ArrowRight',
      })
    )
    fireEvent.keyDown(tab, { code: 'ArrowRight', key: 'ArrowRight' })
    assert.equal(history.classList.contains('collapsed'), true)

    const controlFShortcut = {
      ...defaultCommitDetailsShortcut,
      key: 'f',
      ctrlKey: true,
    }
    view.rerender(renderSelectedCommit(firstCommit, false, controlFShortcut))
    fireEvent.keyDown(button, {
      code: 'KeyF',
      key: 'f',
      ctrlKey: true,
    })
    assert.equal(history.classList.contains('collapsed'), true)

    view.rerender(renderSelectedCommit(firstCommit))
    fireEvent.keyDown(button, { code: 'KeyE', key: 'e' })
    assert.equal(history.classList.contains('expanded'), true)
  })
})
