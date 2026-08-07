import * as React from 'react'

import { Image } from '../../../models/diff'
import { TabBar, TabBarType } from '../../tab-bar'
import { ImageContainer } from './image-container'
import {
  ImageDiffViewport,
  ImageDiffZoomControls,
  ImageDiffZoomScaleChanged,
} from './image-diff-zoom'
import { getAspectFitSize, getSvgSize, ISize } from './sizing'
import { getSvgDiffShowCode, saveSvgDiffShowCode } from './svg-diff-preferences'

interface ISingleImageDiffProps {
  readonly image: Image
  readonly status: 'Added' | 'Deleted'
  readonly renderCodeDiff?: () => React.ReactNode
}

interface ISingleImageDiffState {
  readonly imageSize: ISize | null
  readonly containerSize: ISize | null
  readonly showCode: boolean
  readonly zoomScale: number
}

/** Shared one-sided image viewer for newly added and deleted files. */
export class SingleImageDiff extends React.Component<
  ISingleImageDiffProps,
  ISingleImageDiffState
> {
  private container: HTMLElement | null = null
  private readonly resizeObserver: ResizeObserver
  private resizedTimeoutID: NodeJS.Immediate | null = null

  public constructor(props: ISingleImageDiffProps) {
    super(props)

    this.resizeObserver = new ResizeObserver(entries => {
      for (const { target, contentRect } of entries) {
        if (target !== this.container || !(target instanceof HTMLElement)) {
          continue
        }

        if (this.resizedTimeoutID !== null) {
          clearImmediate(this.resizedTimeoutID)
        }

        this.resizedTimeoutID = setImmediate(this.onResized, contentRect)
      }
    })

    this.state = {
      imageSize: null,
      containerSize: null,
      showCode: props.renderCodeDiff !== undefined && getSvgDiffShowCode(),
      zoomScale: 1,
    }
  }

  public componentDidUpdate(prevProps: ISingleImageDiffProps) {
    if (prevProps.image !== this.props.image) {
      this.setState({ imageSize: null, zoomScale: 1 })
    }

    if (!prevProps.renderCodeDiff && this.props.renderCodeDiff) {
      this.setState({ showCode: getSvgDiffShowCode() })
    }
  }

  public componentWillUnmount() {
    this.resizeObserver.disconnect()
    if (this.resizedTimeoutID !== null) {
      clearImmediate(this.resizedTimeoutID)
    }
  }

  public render() {
    const { renderCodeDiff } = this.props
    if (renderCodeDiff !== undefined && this.state.showCode) {
      return (
        <div className="panel svg-diff-container svg-2tab">
          {this.renderTabs(0)}
          {renderCodeDiff()}
        </div>
      )
    }

    const panelClassName =
      renderCodeDiff === undefined
        ? 'panel image'
        : 'panel image svg-image svg-2tab'

    return (
      <div className={panelClassName} id="diff">
        <div className="image-diff-header-container">
          {renderCodeDiff === undefined ? null : this.renderTabs(1)}
          <ImageDiffZoomControls
            zoomScale={this.state.zoomScale}
            onZoomScaleChanged={this.onZoomScaleChanged}
          />
        </div>
        <ImageDiffViewport
          zoomScale={this.state.zoomScale}
          onZoomScaleChanged={this.onZoomScaleChanged}
        >
          {this.renderImage()}
        </ImageDiffViewport>
      </div>
    )
  }

  private renderTabs(selectedIndex: number) {
    return (
      <TabBar
        selectedIndex={selectedIndex}
        onTabClicked={this.onTabClicked}
        type={TabBarType.Switch}
      >
        <span>Code</span>
        <span>Image</span>
      </TabBar>
    )
  }

  private renderImage() {
    const renderedSize = this.getRenderedSize()
    const sideClassName =
      this.props.status === 'Added'
        ? 'image-diff-current'
        : 'image-diff-previous'
    const imageStyle: React.CSSProperties | undefined =
      renderedSize === null
        ? undefined
        : {
            width: renderedSize.width,
            height: renderedSize.height,
          }
    const imageContainerStyle: React.CSSProperties | undefined =
      renderedSize === null ? undefined : { width: renderedSize.width }

    return (
      <div className="image-diff-single">
        <div className={`image-diff-single-header ${sideClassName}`}>
          {this.props.status}
        </div>
        <div
          className="image-diff-single-sizing-container"
          ref={this.onContainerRef}
        >
          <div className={sideClassName} style={imageContainerStyle}>
            <ImageContainer
              image={this.props.image}
              style={imageStyle}
              onElementLoad={this.onImageLoad}
            />
          </div>
        </div>
      </div>
    )
  }

  private getRenderedSize(): ISize | null {
    const { containerSize, imageSize, zoomScale } = this.state
    if (
      containerSize === null ||
      imageSize === null ||
      containerSize.width <= 0 ||
      containerSize.height <= 0 ||
      imageSize.width <= 0 ||
      imageSize.height <= 0
    ) {
      return null
    }

    const fitSize = getAspectFitSize(imageSize, containerSize)
    return {
      width: Math.round(fitSize.width * zoomScale),
      height: Math.round(fitSize.height * zoomScale),
    }
  }

  private onImageLoad = (imageElement: HTMLImageElement) => {
    const svgSize = getSvgSize(this.props.image)
    this.setState({
      imageSize: svgSize ?? {
        width: imageElement.naturalWidth || 300,
        height: imageElement.naturalHeight || 150,
      },
    })
  }

  private onResized = (contentRect: DOMRectReadOnly) => {
    this.resizedTimeoutID = null
    this.setState({
      containerSize: {
        width: contentRect.width,
        height: contentRect.height,
      },
    })
  }

  private onContainerRef = (container: HTMLElement | null) => {
    this.container = container
    this.resizeObserver.disconnect()

    if (container !== null) {
      this.resizeObserver.observe(container)
    }
  }

  private onZoomScaleChanged: ImageDiffZoomScaleChanged = (
    zoomScale,
    afterUpdate
  ) => {
    this.setState({ zoomScale }, afterUpdate)
  }

  private onTabClicked = (index: number) => {
    const showCode = index === 0
    saveSvgDiffShowCode(showCode)
    this.setState({ showCode })
  }
}
