import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { Repository } from '../../../src/models/repository'
import { ExpandableCommitSummary } from '../../../src/ui/history/expandable-commit-summary'
import { render } from '../../helpers/ui/render'

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

describe('ExpandableCommitSummary', () => {
  it('renders line totals for multiple selected commits', () => {
    const view = render(
      <ExpandableCommitSummary
        repository={createRepository()}
        selectedCommits={[
          createCommit('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'first'),
          createCommit('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'second'),
        ]}
        shasInDiff={[
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ]}
        changesetData={{ files: [], linesAdded: 12, linesDeleted: 7 }}
        emoji={new Map()}
        isExpanded={false}
        onExpandChanged={() => {}}
        onHighlightShas={() => {}}
        showUnreachableCommits={() => {}}
        accounts={[]}
      />
    )

    assert.match(
      view.container.querySelector('.ecs-title')?.textContent ?? '',
      /Showing changes from\s+2 commits/
    )
    assert.equal(
      view.container.querySelector('.lines-added')?.textContent,
      '+12'
    )
    assert.equal(
      view.container.querySelector('.lines-deleted')?.textContent,
      '-7'
    )
  })
})
