import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { DiffOptions } from '../../../src/ui/diff/diff-options'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function ControlledDiffOptions() {
  const [wrapDiffLines, setWrapDiffLines] = React.useState(true)
  const [enhancedDiffHighlighting, setEnhancedDiffHighlighting] =
    React.useState(false)

  return (
    <DiffOptions
      isInteractiveDiff={false}
      hideWhitespaceChanges={false}
      onHideWhitespaceChangesChanged={() => {}}
      showSideBySideDiff={false}
      onShowSideBySideDiffChanged={() => {}}
      showDiffMinimap={false}
      onShowDiffMinimapChanged={() => {}}
      wrapDiffLines={wrapDiffLines}
      onWrapDiffLinesChanged={setWrapDiffLines}
      enhancedDiffHighlighting={enhancedDiffHighlighting}
      onEnhancedDiffHighlightingChanged={setEnhancedDiffHighlighting}
      onDiffOptionsOpened={() => {}}
    />
  )
}

describe('DiffOptions', () => {
  it('controls the line wrapping preference through props', () => {
    render(<ControlledDiffOptions />)
    fireEvent.click(
      screen.getByRole('button', { name: /^Diff (Options|Settings)$/ })
    )

    const wrapLines = screen.getByLabelText(/wrap lines/i)
    assert.strictEqual((wrapLines as HTMLInputElement).checked, true)

    fireEvent.click(wrapLines)

    assert.strictEqual((wrapLines as HTMLInputElement).checked, false)
  })

  it('controls enhanced highlighting through props', () => {
    render(<ControlledDiffOptions />)
    fireEvent.click(
      screen.getByRole('button', { name: /^Diff (Options|Settings)$/ })
    )

    const enhancedHighlighting = screen.getByLabelText(
      /enhanced diff highlighting/i
    )
    assert.strictEqual(
      (enhancedHighlighting as HTMLInputElement).checked,
      false
    )

    fireEvent.click(enhancedHighlighting)

    assert.strictEqual((enhancedHighlighting as HTMLInputElement).checked, true)
  })
})
