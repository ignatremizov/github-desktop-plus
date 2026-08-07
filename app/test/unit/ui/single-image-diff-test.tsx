import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Image } from '../../../src/models/diff'
import { DeletedImageDiff } from '../../../src/ui/diff/image-diffs/deleted-image-diff'
import { NewImageDiff } from '../../../src/ui/diff/image-diffs/new-image-diff'
import { saveSvgDiffShowCode } from '../../../src/ui/diff/image-diffs/svg-diff-preferences'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function createSvgImage(): Image {
  const contents =
    '<svg viewBox="0 0 800 400"><rect width="800" height="400"/></svg>'
  return new Image(
    new TextEncoder().encode(contents).buffer,
    '',
    'image/svg+xml',
    contents.length
  )
}

describe('SingleImageDiff', () => {
  it('shows the shared zoom viewport for added and deleted SVGs', () => {
    saveSvgDiffShowCode(false)
    const image = createSvgImage()
    const cases = [
      {
        status: 'Added',
        element: (
          <NewImageDiff
            current={image}
            renderCodeDiff={() => <div>Added SVG code</div>}
          />
        ),
      },
      {
        status: 'Deleted',
        element: (
          <DeletedImageDiff
            previous={image}
            renderCodeDiff={() => <div>Deleted SVG code</div>}
          />
        ),
      },
    ]

    for (const testCase of cases) {
      const view = render(testCase.element)
      assert.ok(screen.getByText(testCase.status))
      assert.ok(screen.getByRole('region', { name: 'Image diff viewport' }))
      assert.ok(screen.getByRole('button', { name: 'Zoom out' }))

      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
      assert.match(view.container.textContent ?? '', /125%/)
      view.unmount()
    }
  })

  it('supports modified-wheel zoom in a one-sided image viewport', () => {
    saveSvgDiffShowCode(false)
    const view = render(
      <NewImageDiff
        current={createSvgImage()}
        renderCodeDiff={() => <div>SVG code</div>}
      />
    )
    const viewport = screen.getByRole('region', {
      name: 'Image diff viewport',
    })
    const zoomEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      ctrlKey: !__DARWIN__,
      metaKey: __DARWIN__,
    })

    fireEvent(viewport, zoomEvent)

    assert.equal(zoomEvent.defaultPrevented, true)
    assert.match(view.container.textContent ?? '', /115%/)
  })
})
