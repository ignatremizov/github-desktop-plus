import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  Repository,
  ILocalRepositoryState,
} from '../../../src/models/repository'
import { WorktreeEntry } from '../../../src/models/worktree'
import {
  groupRepositories,
  IRepositoryListItem,
  RepositoryListGroup,
} from '../../../src/ui/repositories-list/group-repositories'
import { getFilteredItems } from '../../../src/ui/lib/section-filter-list'
import {
  getRepositoryListBranchNameHighlight,
  getRepositoryListFilterText,
  getRepositoryListFilterQuery,
  postProcessRepositoryListMatches,
  RepositoriesList,
  sortRepositoryListGroupsForFilter,
} from '../../../src/ui/repositories-list/repositories-list'
import { IFilterListGroup } from '../../../src/ui/lib/filter-list'
import { ShowBranchNameInRepoListSetting } from '../../../src/models/show-branch-name-in-repo-list'

const showBranchNames = ShowBranchNameInRepoListSetting.Always
const hideBranchNames = ShowBranchNameInRepoListSetting.Never

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

const buildListItem = (
  repository: Repository,
  text: ReadonlyArray<string>,
  overrides: Partial<IRepositoryListItem> = {}
): IRepositoryListItem => ({
  text,
  pathText: [],
  id: repository.id.toString(),
  title: text[0],
  repository,
  needsDisambiguation: false,
  aheadBehind: null,
  changedFilesCount: 0,
  branchName: null,
  defaultBranchName: null,
  needsBranchNameDisambiguation: false,
  worktreePathDisambiguation: null,
  isNestedWorktree: false,
  isPrunableWorktree: false,
  isSyntheticWorktreeRoot: false,
  sourceRepository: null,
  familyMainPath: null,
  worktree: null,
  ...overrides,
})

const buildGroup = (
  displayName: string,
  items: ReadonlyArray<IRepositoryListItem>
): IFilterListGroup<IRepositoryListItem, RepositoryListGroup> => ({
  identifier: { kind: 'other', displayName },
  items,
})

const filterRepositoryListItems = (
  filterText: string,
  items: ReadonlyArray<IRepositoryListItem>
) => {
  const filterQuery = getRepositoryListFilterQuery(filterText)
  return getFilteredItems(filterQuery, items, true, item =>
    getRepositoryListFilterText(item, filterQuery)
  )
}

describe('RepositoriesList', () => {
  it('ranks contiguous repository list matches before scattered fuzzy matches', () => {
    const scatteredMatchRepository = new Repository(
      '/tmp/projects/teal-anchor-ridge-element-tree',
      1,
      null,
      false
    )
    const contiguousMatchRepository = new Repository(
      '/tmp/projects/project-target-module',
      2,
      null,
      false
    )
    const group = buildGroup('Projects', [
      buildListItem(scatteredMatchRepository, [
        'teal-anchor-ridge-element-tree',
      ]),
      buildListItem(contiguousMatchRepository, ['project-target-module']),
    ])

    const filteredItems = getFilteredItems('target', group.items, true)
    const processedItems = postProcessRepositoryListMatches(
      [group],
      'target',
      false,
      hideBranchNames
    )(filteredItems)

    assert.deepEqual(
      processedItems.map(match => match.item.title),
      ['project-target-module', 'teal-anchor-ridge-element-tree']
    )
  })

  it('treats asterisks as wildcard boundaries in repository list filters', () => {
    const repository = new Repository(
      '/tmp/projects/project-alpha-feature',
      1,
      null,
      false
    )
    const group = buildGroup('Projects', [
      buildListItem(repository, ['project-alpha-feature']),
    ])
    const filteredItems = filterRepositoryListItems('*-alpha-*', group.items)

    assert.deepEqual(
      filteredItems.map(match => match.item.title),
      ['project-alpha-feature']
    )
  })

  it('ranks groups by their best contiguous repository list match', () => {
    const weakGroup = buildGroup('Weak', [
      buildListItem(
        new Repository(
          '/tmp/projects/teal-anchor-ridge-element-tree',
          1,
          null,
          false
        ),
        ['teal-anchor-ridge-element-tree']
      ),
    ])
    const exactGroup = buildGroup('Exact', [
      buildListItem(
        new Repository('/tmp/projects/project-target-module', 2, null, false),
        ['project-target-module']
      ),
    ])

    const groups = sortRepositoryListGroupsForFilter(
      [weakGroup, exactGroup],
      'target',
      hideBranchNames
    )

    assert.deepEqual(
      groups.map(group => group.identifier.displayName),
      ['Exact', 'Weak']
    )
  })

  it('matches linked worktrees by exact path', () => {
    const mainPath = '/tmp/projects/project-alpha'
    const linkedPath = '/tmp/projects/.worktrees/project-target-module'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/target-module'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories([mainRepo, linkedRepo], worktreeState, [])
    const filteredItems = filterRepositoryListItems(linkedPath, groups[0].items)

    assert.equal(filteredItems.length, 1)
    assert.equal(filteredItems[0].item.worktree?.path, linkedPath)
  })

  it('matches exact paths with trailing separators', () => {
    const mainPath = '/tmp/projects/project-alpha'
    const linkedPath = '/tmp/projects/.worktrees/project-target-module'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/target-module'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories([mainRepo, linkedRepo], worktreeState, [])
    const filteredItems = filterRepositoryListItems(
      `${linkedPath}/`,
      groups[0].items
    )

    assert.deepEqual(
      filteredItems.map(match => match.item.worktree?.path),
      [linkedPath]
    )
  })

  it('matches branch filters with slashes without requiring a path match', () => {
    const mainPath = '/tmp/projects/project-alpha'
    const linkedPath = '/tmp/projects/.worktrees/project-target-module'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/target-module'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories([mainRepo, linkedRepo], worktreeState, [])
    const filteredItems = filterRepositoryListItems(
      'feature/target-module',
      groups[0].items
    )

    assert.equal(filteredItems.length, 1)
    assert.equal(filteredItems[0].item.worktree?.path, linkedPath)
  })

  it('matches the main worktree exact path without linked rows', () => {
    const mainPath = '/tmp/projects/project-alpha'
    const linkedPath = '/tmp/projects/.worktrees/project-alpha-feature'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/target-module'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories([mainRepo, linkedRepo], worktreeState, [])
    const filteredItems = filterRepositoryListItems(mainPath, groups[0].items)

    assert.deepEqual(
      filteredItems.map(match => match.item.worktree?.path),
      [mainPath]
    )
  })

  it('does not match rows by parent worktree container path', () => {
    const mainPath = '/tmp/projects/project-alpha'
    const linkedPath = '/tmp/projects/.worktrees/project-target-module'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/target-module'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories([mainRepo, linkedRepo], worktreeState, [])
    const filteredItems = filterRepositoryListItems(
      '/tmp/projects/.worktrees',
      groups[0].items
    )

    assert.equal(filteredItems.length, 0)
  })

  it('does not match linked worktrees by a generic worktree container name', () => {
    const mainPath = '/tmp/projects/project-alpha'
    const linkedPath = '/tmp/projects/.worktrees/project-target-module'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/target-module'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories([mainRepo, linkedRepo], worktreeState, [])
    const filteredItems = filterRepositoryListItems('.worktrees', groups[0].items)

    assert.equal(filteredItems.length, 0)
  })

  it('does not match hidden helper text by scattered characters across fields', () => {
    const repository = new Repository(
      '/tmp/projects/project-alpha-beta-gamma',
      1,
      null,
      false
    )
    const title = 'project-alpha-beta-gamma'
    const item = buildListItem(repository, [
      title,
      `project ${title} feature/${title} project`,
    ])

    assert.deepEqual(filterRepositoryListItems('target', [item]), [])
  })

  it('matches visible worktree path disambiguation text', () => {
    const repository = new Repository('/tmp/projects/project-alpha', 1, null, false)
    const item = buildListItem(repository, ['project-alpha'], {
      worktreePathDisambiguation: '/tmp/projects/target-area',
    })

    assert.deepEqual(
      filterRepositoryListItems('target', [item]).map(match => match.item.title),
      ['project-alpha']
    )
  })

  it('ranks contiguous branch matches before scattered fuzzy matches in worktree families', () => {
    const mainPath = '/tmp/projects/project-alpha'
    const weakLinkedPath =
      '/tmp/projects/.worktrees/repo-teal-alpha-ridge-green-entry-tree'
    const branchLinkedPath = '/tmp/projects/.worktrees/project-item-1234'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const weakLinkedRepo = new Repository(weakLinkedPath, 2, null, false)
    const branchLinkedRepo = new Repository(branchLinkedPath, 3, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const weakLinkedWorktree = buildWorktree(
      weakLinkedPath,
      'linked',
      'refs/heads/fix/repo-teal-alpha-ridge-green-entry-tree'
    )
    const branchLinkedWorktree = buildWorktree(
      branchLinkedPath,
      'linked',
      'refs/heads/feature/item-1234-target-module-refactored'
    )
    const worktrees = [
      mainWorktree,
      weakLinkedWorktree,
      branchLinkedWorktree,
    ]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [weakLinkedRepo.id, buildLocalState(worktrees)],
      [branchLinkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories(
      [mainRepo, weakLinkedRepo, branchLinkedRepo],
      worktreeState,
      []
    )
    const filteredItems = filterRepositoryListItems('target', groups[0].items)
    const processedItems = postProcessRepositoryListMatches(
      groups,
      'target',
      true,
      showBranchNames
    )(filteredItems)

    assert.deepEqual(
      processedItems.map(match => match.item.worktree?.path),
      [branchLinkedPath, weakLinkedPath]
    )
  })

  it('does not keep fuzzy worktree siblings above later visible branch matches', () => {
    const firstFamilyPath = '/tmp/projects/project-alpha'
    const secondFamilyPath = '/tmp/projects/project-beta'
    const firstExactRepository = new Repository(
      '/tmp/projects/project-alpha-item',
      1,
      null,
      false
    )
    const fuzzyRepository = new Repository(
      '/tmp/projects/repo-tangent-archive-green-element-route',
      2,
      null,
      false
    )
    const secondExactRepository = new Repository(
      '/tmp/projects/project-beta-item',
      3,
      null,
      false
    )
    const group = buildGroup('Projects', [
      buildListItem(
        firstExactRepository,
        ['project-alpha-item', 'feature/item-target-module'],
        {
          branchName: 'feature/item-target-module',
          familyMainPath: firstFamilyPath,
        }
      ),
      buildListItem(
        fuzzyRepository,
        ['repo-tangent-archive-green-element-route', 'feature/scattered'],
        {
          branchName: 'feature/scattered',
          familyMainPath: firstFamilyPath,
        }
      ),
      buildListItem(
        secondExactRepository,
        ['project-beta-item', 'feature/item-target-scoring'],
        {
          branchName: 'feature/item-target-scoring',
          familyMainPath: secondFamilyPath,
        }
      ),
    ])
    const filteredItems = filterRepositoryListItems('target', group.items)
    const processedItems = postProcessRepositoryListMatches(
      [group],
      'target',
      true,
      showBranchNames
    )(filteredItems)

    assert.deepEqual(
      processedItems.map(match => match.item.title),
      [
        'project-alpha-item',
        'project-beta-item',
        'repo-tangent-archive-green-element-route',
      ]
    )
  })

  it('ranks visible branch substrings above hidden search text matches', () => {
    const hiddenRepository = new Repository(
      '/tmp/projects/project-hidden',
      1,
      null,
      false
    )
    const branchRepository = new Repository(
      '/tmp/projects/project-item',
      2,
      null,
      false
    )
    const group = buildGroup('Projects', [
      buildListItem(
        hiddenRepository,
        ['project-hidden', 'target-hidden-helper-text'],
        {
          branchName: 'feature/hidden',
        }
      ),
      buildListItem(
        branchRepository,
        ['project-item', 'feature/item-target-module'],
        {
          branchName: 'feature/item-target-module',
        }
      ),
    ])
    const filteredItems = filterRepositoryListItems('target', group.items)
    const processedItems = postProcessRepositoryListMatches(
      [group],
      'target',
      true,
      showBranchNames
    )(filteredItems)

    assert.deepEqual(
      processedItems.map(match => match.item.title),
      ['project-item', 'project-hidden']
    )
  })

  it('does not rank hidden branch names as visible matches', () => {
    const hiddenBranchRepository = new Repository(
      '/tmp/projects/project-alpha',
      1,
      null,
      false
    )
    const titleRepository = new Repository(
      '/tmp/projects/project-target-module',
      2,
      null,
      false
    )
    const group = buildGroup('Projects', [
      buildListItem(
        hiddenBranchRepository,
        ['project-alpha', 'feature/item-target-module'],
        {
          branchName: 'feature/item-target-module',
        }
      ),
      buildListItem(titleRepository, ['project-target-module']),
    ])
    const filteredItems = filterRepositoryListItems('target', group.items)
    const processedItems = postProcessRepositoryListMatches(
      [group],
      'target',
      true,
      hideBranchNames
    )(filteredItems)

    assert.deepEqual(
      processedItems.map(match => match.item.title),
      ['project-target-module', 'project-alpha']
    )
  })

  it('highlights branch-name matches independently of the repository title', () => {
    assert.deepEqual(
      getRepositoryListBranchNameHighlight(
        'feature/item-1234-target-scoring',
        'target'
      ),
      [18, 19, 20, 21, 22, 23]
    )
  })

  it('does not highlight scattered fuzzy branch-name matches', () => {
    assert.deepEqual(
      getRepositoryListBranchNameHighlight(
        'fix/teal-anchor-ridge-element-tree',
        'target'
      ),
      []
    )
  })

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
      true,
      showBranchNames
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

  it('keeps matched main worktree rows before linked worktree rows when filtering', () => {
    const mainPath = '/tmp/projects/project-alpha'
    const linkedPath = '/tmp/projects/.worktrees/project-target-module'
    const unrelatedPath = '/tmp/projects/project-target-archive'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const unrelatedRepo = new Repository(unrelatedPath, 3, null, false)
    const mainWorktree = buildWorktree(
      mainPath,
      'main',
      'refs/heads/feature/target-root'
    )
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/target-module'
    )
    const worktrees = [mainWorktree, linkedWorktree]
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])
    const groups = groupRepositories(
      [mainRepo, linkedRepo, unrelatedRepo],
      worktreeState,
      []
    )
    const group = groups[0]
    const filteredItems = filterRepositoryListItems('target', group.items)
    const processedItems = postProcessRepositoryListMatches(
      groups,
      'target',
      true,
      showBranchNames
    )(filteredItems)

    const familyPaths = processedItems
      .filter(match => match.item.familyMainPath === mainPath)
      .map(match => match.item.worktree?.path)

    assert.deepEqual(familyPaths, [mainPath, linkedPath])

    const allPaths = processedItems.map(match => match.item.worktree?.path)
    assert.equal(
      allPaths.indexOf(linkedPath),
      allPaths.indexOf(mainPath) + 1
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
