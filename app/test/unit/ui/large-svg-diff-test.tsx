import assert from 'node:assert'
import { describe, it } from 'node:test'
import { writeFile } from 'fs/promises'
import { join } from 'node:path'
import * as React from 'react'

import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
  ImageDiffType,
} from '../../../src/models/diff'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { Diff } from '../../../src/ui/diff'
import { setupEmptyRepository } from '../../helpers/repositories'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

describe('large SVG diff', () => {
  it('loads the image revision only after the user requests a preview', async t => {
    const repository = await setupEmptyRepository(t)
    const path = 'large-preview.svg'
    await writeFile(
      join(repository.path, path),
      `<svg viewBox="0 0 100 100"><path d="${'a'.repeat(6000)}"/></svg>\n`
    )
    const file = new WorkingDirectoryFileChange(
      path,
      { kind: AppFileStatusKind.Untracked },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    const diff = {
      kind: DiffType.LargeImage as const,
      newestCommitish: 'HEAD',
      oldestCommitish: 'HEAD',
    }

    const view = render(
      <Diff
        repository={repository}
        readOnly={false}
        file={file}
        diff={diff}
        fileContents={null}
        imageDiffType={ImageDiffType.TwoUp}
        hideWhitespaceInDiff={false}
        showSideBySideDiff={false}
        showDiffMinimap={false}
        wrapDiffLines={false}
        enhancedDiffHighlighting={false}
        showDiffCheckMarks={false}
        onOpenBinaryFile={() => {}}
        onChangeImageDiffType={() => {}}
        onHideWhitespaceInDiffChanged={() => {}}
      />
    )

    assert.equal(
      view.container.querySelector('img:not(.blankslate-image)'),
      null
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview SVG' }))

    await waitFor(() => {
      assert.ok(screen.getByText('Added'))
      assert.ok(view.container.querySelector('#diff img'))
      assert.ok(screen.getByRole('button', { name: 'Zoom in' }))
    })
  })
})
