import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  Repository,
  ILocalRepositoryState,
} from '../../../src/models/repository'
import { WorktreeEntry } from '../../../src/models/worktree'
import { groupRepositories } from '../../../src/ui/repositories-list/group-repositories'
import { getFilteredItems } from '../../../src/ui/lib/section-filter-list'
import {
  postProcessRepositoryListMatches,
  RepositoriesList,
} from '../../../src/ui/repositories-list/repositories-list'

const buildWorktree = (
  path: string,
  type: WorktreeEntry['type'],
  branch: string | null
): WorktreeEntry => ({
  path,
  type,
  branch,
  head: 'deadbeef',
  isDetached: branch === null,
  isLocked: false,
  isPrunable: false,
})

const buildLocalState = (
  worktrees: ReadonlyArray<WorktreeEntry>
): ILocalRepositoryState => ({
  aheadBehind: null,
  changedFilesCount: 0,
  branchName: 'feature',
  defaultBranchName: 'main',
  worktrees,
})

describe('RepositoriesList', () => {
  it('does not inject unmatched root rows above filtered linked worktrees', () => {
    const mainPath = '/tmp/project-alpha'
    const linkedPath = '/tmp/project-alpha-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/feature-a'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories([mainRepo, linkedRepo], worktreeState, [])
    const group = groups[0]
    const filteredItems = getFilteredItems('feature-a', group.items, true)

    assert.deepEqual(
      filteredItems.map(match => match.item.repository.id),
      [linkedRepo.id]
    )

    const processedItems = postProcessRepositoryListMatches(
      groups,
      'feature-a',
      true
    )(filteredItems)

    assert.deepEqual(
      processedItems.map(match => match.item.repository.id),
      [linkedRepo.id]
    )
    assert.equal(processedItems[0].item.worktree?.path, linkedPath)
    assert.ok(
      processedItems[0].matches.title.length > 0 ||
        processedItems[0].matches.subtitle.length > 0
    )
  })

  it('switches a saved linked worktree row through its source repository', () => {
    const mainPath = '/tmp/project-alpha'
    const linkedPath = '/tmp/project-alpha-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/feature-a'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories([mainRepo, linkedRepo], worktreeState, [])
    const linkedItem = groups[0].items.find(
      item => item.worktree?.path === linkedPath
    )

    assert.notEqual(linkedItem, undefined)
    assert.equal(linkedItem?.repository, linkedRepo)
    assert.equal(linkedItem?.sourceRepository, mainRepo)

    let selectedRepository: Repository | null = null
    let switchedRepository: Repository | null = null
    let switchedWorktree: WorktreeEntry | null = null
    const closedFoldouts: Array<unknown> = []
    const clickedIndicators: Array<boolean> = []
    const dispatcher = {
      recordRepoClicked(hasIndicator: boolean) {
        clickedIndicators.push(hasIndicator)
      },
      closeFoldout(foldout: unknown) {
        closedFoldouts.push(foldout)
      },
      switchWorktree(repo: Repository, worktree: WorktreeEntry) {
        switchedRepository = repo
        switchedWorktree = worktree
      },
      postError(error: Error) {
        throw error
      },
    }

    const list = new RepositoriesList({
      dispatcher,
      onSelectionChanged: (repo: Repository) => {
        selectedRepository = repo
      },
    } as any)

    ;(list as any).onItemClick(linkedItem)

    assert.equal(selectedRepository, null)
    assert.deepEqual(clickedIndicators, [false])
    assert.equal(closedFoldouts.length, 1)
    assert.equal(switchedRepository, mainRepo)
    assert.equal(switchedWorktree, linkedWorktree)
  })

  it('switches a synthetic root worktree row back to the root path', () => {
    const mainPath = '/tmp/project-alpha'
    const linkedPath = '/tmp/project-alpha-feature-a'
    const repository = new Repository(linkedPath, 1, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/feature-a'
    )
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [repository.id, buildLocalState([mainWorktree, linkedWorktree])],
    ])
    const groups = groupRepositories([repository], worktreeState, [])
    const rootItem = groups[0].items[0]

    assert.equal(rootItem.isSyntheticWorktreeRoot, true)
    assert.equal(rootItem.worktree?.path, mainPath)

    let selectedRepository: Repository | null = null
    let switchedRepository: Repository | null = null
    let switchedWorktree: WorktreeEntry | null = null
    const dispatcher = {
      recordRepoClicked() {},
      closeFoldout() {},
      switchWorktree(repo: Repository, worktree: WorktreeEntry) {
        switchedRepository = repo
        switchedWorktree = worktree
      },
      postError(error: Error) {
        throw error
      },
    }

    const list = new RepositoriesList({
      dispatcher,
      onSelectionChanged: (repo: Repository) => {
        selectedRepository = repo
      },
    } as any)

    ;(list as any).onItemClick(rootItem)

    assert.equal(selectedRepository, null)
    assert.equal(switchedRepository, repository)
    assert.equal(switchedWorktree, mainWorktree)
  })
})
