import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Image, ImageDiffType } from '../../../src/models/diff'
import { ModifiedImageDiff } from '../../../src/ui/diff/image-diffs/modified-image-diff'
import { TwoUp } from '../../../src/ui/diff/image-diffs/two-up'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function createImage() {
  return new Image(new ArrayBuffer(0), '', 'image/png', 1)
}

function renderImageDiff(diffType = ImageDiffType.TwoUp) {
  return render(
    <ModifiedImageDiff
      previous={createImage()}
      current={createImage()}
      diffType={diffType}
      onChangeDiffType={() => {}}
    />
  )
}

function createPointerEvent(
  type: string,
  options: {
    readonly pointerId: number
    readonly clientX: number
    readonly clientY: number
    readonly button?: number
  }
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId },
    clientX: { value: options.clientX },
    clientY: { value: options.clientY },
    button: { value: options.button ?? 0 },
  })
  return event
}

describe('ModifiedImageDiff', () => {
  it('labels zoom controls and consumes modified wheel zoom gestures', () => {
    const view = renderImageDiff()
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' })
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' })
    const viewport = screen.getByRole('region', {
      name: 'Image diff viewport',
    })

    assert.equal(zoomIn.hasAttribute('disabled'), false)
    assert.equal(zoomOut.hasAttribute('disabled'), false)

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

    const scrollEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    })
    fireEvent(viewport, scrollEvent)
    assert.equal(scrollEvent.defaultPrevented, false)
  })

  it('keeps the image point under the cursor while wheel zooming', () => {
    const view = renderImageDiff(ImageDiffType.Swipe)
    const viewport = screen.getByRole('region', {
      name: 'Image diff viewport',
    }) as HTMLDivElement
    const image = view.container.querySelector('img')
    const imageWrapper = image?.closest<HTMLElement>('.image-wrapper')
    assert(image)
    assert(imageWrapper)

    let measurement = 0
    imageWrapper.getBoundingClientRect = () => {
      measurement++
      return (
        measurement === 1
          ? { left: 50, top: 60, width: 200, height: 100 }
          : { left: 20, top: 10, width: 300, height: 150 }
      ) as DOMRect
    }
    viewport.scrollLeft = 40
    viewport.scrollTop = 60

    const zoomEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 150,
      clientY: 110,
      deltaY: -100,
      ctrlKey: !__DARWIN__,
      metaKey: __DARWIN__,
    })
    fireEvent(image, zoomEvent)

    assert.equal(viewport.scrollLeft, 60)
    assert.equal(viewport.scrollTop, 35)
  })

  it('pans the scroll-owning viewport with pointer capture', () => {
    renderImageDiff()
    const viewport = screen.getByRole('region', {
      name: 'Image diff viewport',
    }) as HTMLDivElement
    let capturedPointer: number | null = null

    Object.assign(viewport, {
      setPointerCapture: (pointerID: number) => {
        capturedPointer = pointerID
      },
      hasPointerCapture: (pointerID: number) => capturedPointer === pointerID,
      releasePointerCapture: () => {
        capturedPointer = null
      },
    })
    viewport.scrollLeft = 40
    viewport.scrollTop = 60

    fireEvent(
      viewport,
      createPointerEvent('pointerdown', {
        pointerId: 7,
        clientX: 100,
        clientY: 120,
      })
    )
    fireEvent(
      viewport,
      createPointerEvent('pointermove', {
        pointerId: 7,
        clientX: 70,
        clientY: 80,
      })
    )

    assert.equal(viewport.scrollLeft, 70)
    assert.equal(viewport.scrollTop, 100)
    assert.equal(viewport.classList.contains('dragging'), true)

    fireEvent(
      viewport,
      createPointerEvent('pointerup', {
        pointerId: 7,
        clientX: 70,
        clientY: 80,
      })
    )
    assert.equal(capturedPointer, null)
    assert.equal(viewport.classList.contains('dragging'), false)
  })

  it('keeps comparison sliders outside the scrollable viewport', () => {
    renderImageDiff(ImageDiffType.Swipe)
    const viewport = screen.getByRole('region', {
      name: 'Image diff viewport',
    }) as HTMLDivElement
    const slider = screen.getByRole('slider', {
      name: 'Swipe comparison position',
    })

    assert.equal(viewport.contains(slider), false)
    fireEvent.change(slider, {
      target: { value: '50' },
    })
    assert.equal((slider as HTMLInputElement).value, '50')
  })

  it('applies rendered dimensions below the old 200px cutoff', () => {
    const view = render(
      <TwoUp
        previous={createImage()}
        current={createImage()}
        previousImageSize={{ width: 120, height: 80 }}
        currentImageSize={{ width: 120, height: 80 }}
        maxSize={{ width: 120, height: 80 }}
        onPreviousImageLoad={() => {}}
        onCurrentImageLoad={() => {}}
        onContainerRef={() => {}}
      />
    )
    const images = view.container.querySelectorAll('img')
    assert.equal(images.length, 2)
    for (const image of images) {
      assert.equal(image.style.width, '120px')
      assert.equal(image.style.height, '80px')
    }
  })

  it('preserves each image aspect ratio within two-up comparison bounds', () => {
    const view = render(
      <TwoUp
        previous={createImage()}
        current={createImage()}
        previousImageSize={{ width: 1000, height: 100 }}
        currentImageSize={{ width: 100, height: 1000 }}
        maxSize={{ width: 250, height: 500 }}
        onPreviousImageLoad={() => {}}
        onCurrentImageLoad={() => {}}
        onContainerRef={() => {}}
      />
    )
    const images = view.container.querySelectorAll('img')
    assert.equal(images[0].style.width, '250px')
    assert.equal(images[0].style.height, '25px')
    assert.equal(images[1].style.width, '50px')
    assert.equal(images[1].style.height, '500px')
  })
})
