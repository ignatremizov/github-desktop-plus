import { IStatusResult } from '../../git'
import { normalizePath } from '../../helpers/path'
import { ILocalRepositoryState, Repository } from '../../../models/repository'
import { WorktreeEntry } from '../../../models/worktree'

/**
 * Refresh sidebar worktree metadata more sparingly than the repository
 * indicator loop to avoid repeatedly shelling out to `git worktree list`.
 */
export const SidebarWorktreeRefreshInterval = 2 * 60 * 1000

export function findSidebarWorktreeStateRepository(
  repositories: ReadonlyArray<Repository>,
  repository: Repository
) {
  if (!repository.isLinkedWorktree) {
    return repository
  }

  const mainWorktreePath = normalizePath(repository.mainWorktreePath)
  return (
    repositories.find(
      candidate => normalizePath(candidate.path) === mainWorktreePath
    ) ?? repository
  )
}

export function getCurrentWorktreeEntryForRepository(
  allWorktrees: ReadonlyArray<WorktreeEntry>,
  repository: Repository
) {
  return (
    allWorktrees.find(
      worktree =>
        normalizePath(worktree.path) === normalizePath(repository.path)
    ) ?? null
  )
}

export function createSidebarStateFromStatus(
  repository: Repository,
  status: IStatusResult,
  existing: ILocalRepositoryState | undefined,
  allWorktrees: ReadonlyArray<WorktreeEntry>,
  showWorktreesInSidebar: boolean
): ILocalRepositoryState {
  return {
    aheadBehind: status.branchAheadBehind || null,
    changedFilesCount: status.workingDirectory.files.length,
    branchName: status.currentBranch || null,
    defaultBranchName: repository.defaultBranch,
    isLoadingWorktrees:
      showWorktreesInSidebar && (existing?.isLoadingWorktrees ?? false),
    allWorktrees: showWorktreesInSidebar ? allWorktrees : [],
  }
}

export function createLoadingSidebarState(
  repository: Repository,
  status: IStatusResult,
  existing: ILocalRepositoryState | undefined
): ILocalRepositoryState {
  return {
    aheadBehind: existing?.aheadBehind ?? status.branchAheadBehind ?? null,
    changedFilesCount:
      existing?.changedFilesCount ?? status.workingDirectory.files.length,
    branchName: existing?.branchName ?? status.currentBranch ?? null,
    defaultBranchName: existing?.defaultBranchName ?? repository.defaultBranch,
    isLoadingWorktrees: true,
    allWorktrees: existing?.allWorktrees ?? [],
  }
}

export function createInitialLoadingSidebarState(
  repository: Repository,
  existing: ILocalRepositoryState | undefined
): ILocalRepositoryState {
  return {
    aheadBehind: existing?.aheadBehind ?? null,
    changedFilesCount: existing?.changedFilesCount ?? 0,
    branchName: existing?.branchName ?? null,
    defaultBranchName: existing?.defaultBranchName ?? repository.defaultBranch,
    isLoadingWorktrees: true,
    allWorktrees: existing?.allWorktrees ?? [],
  }
}

export function withSidebarWorktrees(
  existing: ILocalRepositoryState,
  allWorktrees: ReadonlyArray<WorktreeEntry>
): ILocalRepositoryState {
  return {
    ...existing,
    isLoadingWorktrees: false,
    allWorktrees,
  }
}

export function shouldRefreshSidebarWorktrees(
  lastRefreshedAt: number | undefined,
  now: number = Date.now()
) {
  if (lastRefreshedAt === undefined) {
    return true
  }

  return now - lastRefreshedAt >= SidebarWorktreeRefreshInterval
}
