import * as React from 'react'

import { Button } from '../../lib/button'
import { Octicon } from '../../octicons'
import * as OcticonSymbol from '../../octicons/octicons.generated'

const MinimumZoomScale = 0.25
const MaximumZoomScale = 5
const ButtonZoomStep = 0.25
const WheelZoomStep = 0.15

export type ImageDiffZoomScaleChanged = (
  zoomScale: number,
  afterUpdate?: () => void
) => void

interface IImageDiffZoomControlsProps {
  readonly zoomScale: number
  readonly onZoomScaleChanged: ImageDiffZoomScaleChanged
}

interface IImageDiffViewportProps extends IImageDiffZoomControlsProps {
  readonly children: React.ReactNode
}

interface IZoomAnchor {
  readonly element: HTMLElement
  readonly horizontalRatio: number
  readonly verticalRatio: number
  readonly clientX: number
  readonly clientY: number
}

function clampZoomScale(zoomScale: number): number {
  return Math.min(
    MaximumZoomScale,
    Math.max(MinimumZoomScale, Number(zoomScale.toFixed(2)))
  )
}

export class ImageDiffZoomControls extends React.Component<IImageDiffZoomControlsProps> {
  public render() {
    const modifier = __DARWIN__ ? 'Command' : 'Ctrl'

    return (
      <div className="image-diff-zoom-controls">
        <Button
          onClick={this.onZoomOut}
          disabled={this.props.zoomScale <= MinimumZoomScale}
          tooltip={`Zoom Out (${modifier} + Scroll Down)`}
          ariaLabel="Zoom out"
        >
          <Octicon symbol={OcticonSymbol.dash} />
        </Button>
        <Button
          onClick={this.onZoomReset}
          className="zoom-reset-button"
          tooltip="Reset Zoom"
        >
          {Math.round(this.props.zoomScale * 100)}%
        </Button>
        <Button
          onClick={this.onZoomIn}
          disabled={this.props.zoomScale >= MaximumZoomScale}
          tooltip={`Zoom In (${modifier} + Scroll Up)`}
          ariaLabel="Zoom in"
        >
          <Octicon symbol={OcticonSymbol.plus} />
        </Button>
      </div>
    )
  }

  private onZoomOut = () => {
    this.props.onZoomScaleChanged(
      clampZoomScale(this.props.zoomScale - ButtonZoomStep)
    )
  }

  private onZoomReset = () => {
    this.props.onZoomScaleChanged(1)
  }

  private onZoomIn = () => {
    this.props.onZoomScaleChanged(
      clampZoomScale(this.props.zoomScale + ButtonZoomStep)
    )
  }
}

export class ImageDiffViewport extends React.Component<IImageDiffViewportProps> {
  private viewport: HTMLDivElement | null = null
  private draggingPointerID: number | null = null
  private startX = 0
  private startY = 0
  private startScrollLeft = 0
  private startScrollTop = 0

  private onViewportRef = (viewport: HTMLDivElement | null) => {
    this.viewport = viewport
  }

  private onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const zoomAnchor = this.getZoomAnchor(event)
    const delta = event.deltaY < 0 ? WheelZoomStep : -WheelZoomStep
    const zoomScale = clampZoomScale(this.props.zoomScale + delta)

    this.props.onZoomScaleChanged(zoomScale, () =>
      this.restoreZoomAnchor(zoomAnchor)
    )
  }

  private getZoomAnchor(
    event: React.WheelEvent<HTMLDivElement>
  ): IZoomAnchor | null {
    const viewport = this.viewport
    if (viewport === null) {
      return null
    }

    const eventTarget = event.target
    const target =
      eventTarget instanceof Element
        ? eventTarget.closest<HTMLElement>(
            '.image-wrapper, .image-container, .image-diff-two-up'
          )
        : null
    const element =
      target ??
      viewport.querySelector<HTMLElement>(
        '.image-wrapper, .image-container, .image-diff-two-up'
      )
    if (element === null) {
      return null
    }

    const bounds = element.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null
    }

    return {
      element,
      horizontalRatio: Math.max(
        0,
        Math.min(1, (event.clientX - bounds.left) / bounds.width)
      ),
      verticalRatio: Math.max(
        0,
        Math.min(1, (event.clientY - bounds.top) / bounds.height)
      ),
      clientX: event.clientX,
      clientY: event.clientY,
    }
  }

  private restoreZoomAnchor(anchor: IZoomAnchor | null) {
    const viewport = this.viewport
    if (anchor === null || viewport === null || !anchor.element.isConnected) {
      return
    }

    const bounds = anchor.element.getBoundingClientRect()
    const anchoredClientX = bounds.left + bounds.width * anchor.horizontalRatio
    const anchoredClientY = bounds.top + bounds.height * anchor.verticalRatio
    viewport.scrollLeft += anchoredClientX - anchor.clientX
    viewport.scrollTop += anchoredClientY - anchor.clientY
  }

  private onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = this.viewport
    if (event.button !== 0 || viewport === null) {
      return
    }

    const target = event.target
    if (
      target instanceof Element &&
      target.closest('button, input, select, textarea, a[href]') !== null
    ) {
      return
    }

    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.classList.add('dragging')
    this.draggingPointerID = event.pointerId
    this.startX = event.clientX
    this.startY = event.clientY
    this.startScrollLeft = viewport.scrollLeft
    this.startScrollTop = viewport.scrollTop
  }

  private onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = this.viewport
    if (this.draggingPointerID !== event.pointerId || viewport === null) {
      return
    }

    event.preventDefault()
    viewport.scrollLeft = this.startScrollLeft - (event.clientX - this.startX)
    viewport.scrollTop = this.startScrollTop - (event.clientY - this.startY)
  }

  private onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (this.draggingPointerID !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    event.currentTarget.classList.remove('dragging')
    this.draggingPointerID = null
  }

  // A native scroll region must be focusable for keyboard scrolling. The
  // accessibility rule does not account for that browser behavior.
  /* eslint-disable jsx-a11y/no-noninteractive-tabindex */
  public render() {
    return (
      <div
        className="image-diff-content-viewport"
        role="region"
        aria-label="Image diff viewport"
        tabIndex={0}
        onWheel={this.onWheel}
        onPointerDown={this.onPointerDown}
        onPointerMove={this.onPointerMove}
        onPointerUp={this.onPointerEnd}
        onPointerCancel={this.onPointerEnd}
        ref={this.onViewportRef}
      >
        {this.props.children}
      </div>
    )
  }
  /* eslint-enable jsx-a11y/no-noninteractive-tabindex */
}
