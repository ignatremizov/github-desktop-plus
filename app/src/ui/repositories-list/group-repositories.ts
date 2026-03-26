import * as Path from 'path'

import {
  Repository,
  ILocalRepositoryState,
  nameOf,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getHTMLURL } from '../../lib/api'
import { caseInsensitiveCompare, compare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { assertNever } from '../../lib/fatal-error'
import { isGHE, isGHES } from '../../lib/endpoint-capabilities'
import { Owner } from '../../models/owner'
import { normalizePath } from '../../lib/helpers/path'
import { WorktreeEntry } from '../../models/worktree'

export type RepositoryListGroup = (
  | {
      kind: 'recent' | 'other'
    }
  | {
      kind: 'dotcom'
      owner: Owner
      login: string | null
    }
  | {
      kind: 'enterprise'
      host: string
    }
) & { displayName: string | null }

/**
 * Returns a unique grouping key (string) for a repository group. Doubles as a
 * case sensitive sorting key (i.e the case sensitive sort order of the keys is
 * the order in which the groups will be displayed in the repository list).
 */
export const getGroupKey = (group: RepositoryListGroup) => {
  const { kind, displayName } = group
  switch (kind) {
    case 'recent':
      return `0:recent`
    case 'dotcom':
      return displayName
        ? `1:${displayName}`
        : `1:${group.owner.login}:${group.login ?? group.owner.login}`
    case 'enterprise':
      // Allow mixing together dotcom and enterprise repos when setting a group name manually
      return displayName ? `1:${displayName}` : `2:${group.host}`
    case 'other':
      return displayName ? `1:${displayName}` : `3:other`
    default:
      assertNever(group, `Unknown repository group kind ${kind}`)
  }
}
export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly title: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly branchName: string | null
  readonly defaultBranchName: string | null
  readonly isNestedWorktree: boolean
  readonly mainWorktreeName: string | null
  readonly isLoadingNestedWorktrees: boolean
  readonly isVirtualLinkedWorktree: boolean
  readonly worktreePath: string | null
  readonly sourceRepository: Repository | null
}

interface IGroupRepositoriesOptions {
  readonly showWorktreesInSidebar?: boolean
}

const recentRepositoriesThreshold = 7

const getHostForRepository = (repo: RepositoryWithGitHubRepository) =>
  new URL(getHTMLURL(repo.gitHubRepository.endpoint)).host

const getGroupForRepository = (repo: Repositoryish): RepositoryListGroup => {
  if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
    return isGHE(repo.gitHubRepository.endpoint) ||
      isGHES(repo.gitHubRepository.endpoint)
      ? {
          kind: 'enterprise',
          host: getHostForRepository(repo),
          displayName: repo.groupName,
        }
      : {
          kind: 'dotcom',
          owner: repo.gitHubRepository.owner,
          displayName: repo.groupName,
          login: repo.gitHubRepository.login,
        }
  }
  if (repo instanceof Repository) {
    return { kind: 'other', displayName: repo.groupName }
  }
  return { kind: 'other', displayName: null }
}

type RepoGroupItem = { group: RepositoryListGroup; repos: Repositoryish[] }

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  recentRepositories: ReadonlyArray<number>,
  options: IGroupRepositoriesOptions = {}
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  const includeRecentGroup = repositories.length > recentRepositoriesThreshold
  const recentSet = includeRecentGroup ? new Set(recentRepositories) : undefined
  const groups = new Map<string, RepoGroupItem>()

  const addToGroup = (group: RepositoryListGroup, repo: Repositoryish) => {
    const key = getGroupKey(group)
    let rg = groups.get(key)
    if (!rg) {
      rg = { group, repos: [] }
      groups.set(key, rg)
    }

    rg.repos.push(repo)
  }

  for (const repo of repositories) {
    if (recentSet?.has(repo.id) && repo instanceof Repository) {
      addToGroup({ kind: 'recent', displayName: repo.groupName }, repo)
    }

    addToGroup(getGroupForRepository(repo), repo)
  }

  return Array.from(groups)
    .sort(([xKey], [yKey]) => compare(xKey, yKey))
    .map(([, { group, repos }]) => ({
      identifier: group,
      items: toSortedListItems(
        group,
        repos,
        localRepositoryStateLookup,
        groups,
        options
      ),
    }))
}

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (r: Repositoryish) =>
  r instanceof Repository && r.alias != null ? r.alias : r.name

const getBranchNameForWorktree = (worktree: WorktreeEntry) =>
  worktree.branch?.replace(/^refs\/heads\//, '') ?? null

const getWorktreeEntryForPath = (
  allWorktrees: ReadonlyArray<WorktreeEntry>,
  worktreePath: string
) =>
  allWorktrees.find(
    worktree => normalizePath(worktree.path) === normalizePath(worktreePath)
  ) ?? null

const toSortedListItems = (
  group: RepositoryListGroup,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groups: Map<string, RepoGroupItem>,
  options: IGroupRepositoriesOptions
): IRepositoryListItem[] => {
  const groupNames = new Map<string, number>()
  const allNames = new Map<string, number>()

  for (const groupItem of groups.values()) {
    // All items in the recent group are by definition present in another
    // group and therefore we don't want to count them.
    if (groupItem.group.kind === 'recent') {
      continue
    }

    for (const title of groupItem.repos.map(getDisplayTitle)) {
      allNames.set(title, (allNames.get(title) ?? 0) + 1)
      if (groupItem.group === group) {
        groupNames.set(title, (groupNames.get(title) ?? 0) + 1)
      }
    }
  }

  const toListItem = (
    r: Repositoryish,
    isNestedWorktree: boolean,
    options?: {
      readonly isVirtualLinkedWorktree?: boolean
      readonly worktreePath?: string
      readonly sourceRepository?: Repository | null
      readonly branchName?: string | null
      readonly changedFilesCount?: number
      readonly aheadBehind?: IAheadBehind | null
    }
  ): IRepositoryListItem => {
    const repoState = localRepositoryStateLookup.get(r.id)
    const isLinkedWorktree = r instanceof Repository && r.isLinkedWorktree
    const isVirtualLinkedWorktree = options?.isVirtualLinkedWorktree ?? false
    const worktreePath = options?.worktreePath ?? r.path
    const parentRepository =
      options?.sourceRepository ??
      (r instanceof Repository && isLinkedWorktree
        ? repositories.find(
            candidate =>
              candidate instanceof Repository &&
              normalizePath(candidate.path) === normalizePath(r.mainWorktreePath)
          ) ?? null
        : null)
    const parentRepoState =
      parentRepository !== null
        ? localRepositoryStateLookup.get(parentRepository.id)
        : null
    const startupWorktreeEntry =
      (isLinkedWorktree || isVirtualLinkedWorktree) && parentRepoState != null
        ? getWorktreeEntryForPath(parentRepoState.allWorktrees, worktreePath)
        : null
    const title =
      isLinkedWorktree || isVirtualLinkedWorktree
        ? Path.basename(worktreePath)
        : getDisplayTitle(r)
    const mainWorktreePath =
      r instanceof Repository
        ? r.mainWorktreePath
        : options?.sourceRepository?.mainWorktreePath ?? r.path
    const mainWorktreeName =
      (isLinkedWorktree || isVirtualLinkedWorktree) && isNestedWorktree
        ? Path.basename(mainWorktreePath)
        : null

    return {
      text:
        r instanceof Repository
          ? isLinkedWorktree || isVirtualLinkedWorktree
            ? [title, nameOf(r), Path.basename(mainWorktreePath)]
            : [title, nameOf(r)]
          : [title],
      title,
      id: options?.worktreePath
        ? `worktree:${normalizePath(options.worktreePath)}`
        : r.id.toString(),
      repository: r,
      needsDisambiguation:
        // If the repository is in the enterprise group and has a duplicate
        // name in the group, we need to disambiguate it. We don't have to
        // disambiguate repositories in the 'dotcom' group because they are
        // already grouped by owner. If the repository is in the 'recent'
        // group and has a duplicate name in any group, we need to
        // disambiguate it.
        ((groupNames.get(title) ?? 0) > 1 && group.kind === 'enterprise') ||
        ((allNames.get(title) ?? 0) > 1 && group.kind === 'recent'),
      aheadBehind: options?.aheadBehind ?? repoState?.aheadBehind ?? null,
      changedFilesCount:
        options?.changedFilesCount ?? repoState?.changedFilesCount ?? 0,
      branchName:
        options?.branchName ??
        repoState?.branchName ??
        (startupWorktreeEntry ? getBranchNameForWorktree(startupWorktreeEntry) : null),
      defaultBranchName: repoState?.defaultBranchName ?? null,
      isNestedWorktree,
      mainWorktreeName,
      isLoadingNestedWorktrees:
        !isNestedWorktree &&
        r instanceof Repository &&
        !r.isLinkedWorktree &&
        (repoState?.isLoadingWorktrees ?? false),
      isVirtualLinkedWorktree,
      worktreePath: options?.worktreePath ?? null,
      sourceRepository: options?.sourceRepository ?? null,
    }
  }

  const sortedRepositories = [...repositories].sort((x, y) =>
    caseInsensitiveCompare(getDisplayTitle(x), getDisplayTitle(y))
  )

  if (!options.showWorktreesInSidebar || group.kind === 'recent') {
    return sortedRepositories.map(r => toListItem(r, false))
  }

  const mainRepos: Repositoryish[] = []
  const orphanLinkedRepos: Repositoryish[] = []
  const linkedReposByParentPath = new Map<string, Repository[]>()
  const repoPathsInGroup = new Set<string>()

  for (const repository of sortedRepositories) {
    if (repository instanceof Repository) {
      repoPathsInGroup.add(normalizePath(repository.path))
    }

    if (!(repository instanceof Repository) || !repository.isLinkedWorktree) {
      mainRepos.push(repository)
      continue
    }

    const parentPath = normalizePath(repository.mainWorktreePath)
    const linkedRepos = linkedReposByParentPath.get(parentPath)
    if (linkedRepos !== undefined) {
      linkedRepos.push(repository)
    } else {
      linkedReposByParentPath.set(parentPath, [repository])
    }
  }

  const items: IRepositoryListItem[] = []
  const seenLinkedRepoIds = new Set<number>()

  for (const repository of mainRepos) {
    items.push(toListItem(repository, false))

    if (!(repository instanceof Repository)) {
      continue
    }

    const linkedRepos = linkedReposByParentPath.get(normalizePath(repository.path))
    if (linkedRepos !== undefined) {
      for (const linkedRepo of linkedRepos) {
        seenLinkedRepoIds.add(linkedRepo.id)
        items.push(toListItem(linkedRepo, true))
      }
    }

    const repoState = localRepositoryStateLookup.get(repository.id)
    const allWorktrees = repoState?.allWorktrees ?? []
    const virtualWorktrees = allWorktrees
      .filter(
        worktree =>
          worktree.type === 'linked' &&
          !repoPathsInGroup.has(normalizePath(worktree.path))
      )
      .sort((x, y) =>
        caseInsensitiveCompare(Path.basename(x.path), Path.basename(y.path))
      )

    for (const worktree of virtualWorktrees) {
      const virtualRepository = new Repository(
        worktree.path,
        -Math.abs(
          Array.from(normalizePath(worktree.path)).reduce(
            (acc, char) => acc * 31 + char.charCodeAt(0),
            7
          )
        ),
        repository.gitHubRepository,
        false,
        null,
        repository.groupName,
        repository.defaultBranch,
        repository.workflowPreferences,
        repository.customEditorOverride,
        repository.isTutorialRepository,
        repository.overrideLogin
      )

      items.push(
        toListItem(virtualRepository, true, {
          isVirtualLinkedWorktree: true,
          worktreePath: worktree.path,
          sourceRepository: repository,
          branchName: getBranchNameForWorktree(worktree),
          changedFilesCount: 0,
          aheadBehind: null,
        })
      )
    }
  }

  for (const repository of sortedRepositories) {
    if (
      repository instanceof Repository &&
      repository.isLinkedWorktree &&
      !seenLinkedRepoIds.has(repository.id)
    ) {
      orphanLinkedRepos.push(repository)
    }
  }

  for (const repository of orphanLinkedRepos) {
    items.push(toListItem(repository, false))
  }

  return items
}
