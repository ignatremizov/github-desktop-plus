import * as React from 'react'
import { ImageContainer } from './image-container'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { ISize } from './sizing'
import { formatBytes } from '../../lib/bytes'
import classNames from 'classnames'

function percentDiff(previous: number, current: number) {
  return `${Math.abs(Math.round((current / previous) * 100))}%`
}

interface ITwoUpProps extends ICommonImageDiffProperties {
  readonly previousImageSize: ISize | null
  readonly currentImageSize: ISize | null
}

function getRenderedSize(imageSize: ISize | null, bounds: ISize): ISize | null {
  if (
    imageSize === null ||
    imageSize.width <= 0 ||
    imageSize.height <= 0 ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null
  }

  const scale = Math.min(
    bounds.width / imageSize.width,
    bounds.height / imageSize.height
  )
  return {
    width: Math.round(imageSize.width * scale),
    height: Math.round(imageSize.height * scale),
  }
}

export class TwoUp extends React.Component<ITwoUpProps, {}> {
  public render() {
    const zeroSize = { width: 0, height: 0 }
    const previousImageSize = this.props.previousImageSize || zeroSize
    const currentImageSize = this.props.currentImageSize || zeroSize

    const { current, previous } = this.props

    const diffPercent = percentDiff(previous.bytes, current.bytes)
    const diffBytes = current.bytes - previous.bytes
    const diffBytesSign = diffBytes >= 0 ? '+' : ''

    const hasSize =
      this.props.maxSize.width > 0 && this.props.maxSize.height > 0
    const previousRenderedSize = getRenderedSize(
      this.props.previousImageSize,
      this.props.maxSize
    )
    const currentRenderedSize = getRenderedSize(
      this.props.currentImageSize,
      this.props.maxSize
    )
    const columnStyle: React.CSSProperties = {
      width: hasSize ? this.props.maxSize.width : undefined,
    }
    const previousImageStyle: React.CSSProperties = {
      width: previousRenderedSize?.width,
      height: previousRenderedSize?.height,
    }
    const currentImageStyle: React.CSSProperties = {
      width: currentRenderedSize?.width,
      height: currentRenderedSize?.height,
    }

    return (
      <div className="image-diff-container" ref={this.props.onContainerRef}>
        <div className="image-diff-two-up">
          <div className="image-diff-previous" style={columnStyle}>
            <div className="image-diff-header">Deleted</div>
            <ImageContainer
              image={previous}
              onElementLoad={this.props.onPreviousImageLoad}
              style={previousImageStyle}
            />

            <div className="image-diff-footer">
              <span className="strong">W:</span> {previousImageSize.width}
              px | <span className="strong">H:</span> {previousImageSize.height}
              px | <span className="strong">Size:</span>{' '}
              {formatBytes(previous.bytes, 2)}
            </div>
          </div>

          <div className="image-diff-current" style={columnStyle}>
            <div className="image-diff-header">Added</div>
            <ImageContainer
              image={current}
              onElementLoad={this.props.onCurrentImageLoad}
              style={currentImageStyle}
            />

            <div className="image-diff-footer">
              <span className="strong">W:</span> {currentImageSize.width}
              px | <span className="strong">H:</span> {currentImageSize.height}
              px | <span className="strong">Size:</span>{' '}
              {formatBytes(current.bytes, 2)}
            </div>
          </div>
        </div>
        <div className="image-diff-summary">
          Diff:{' '}
          <span
            className={classNames({
              added: diffBytes > 0,
              removed: diffBytes < 0,
            })}
          >
            {diffBytes !== 0
              ? `${diffBytesSign}${formatBytes(diffBytes, 2)} (${diffPercent})`
              : 'No size difference'}
          </span>
        </div>
      </div>
    )
  }
}
