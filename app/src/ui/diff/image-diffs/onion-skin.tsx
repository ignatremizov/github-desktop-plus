import * as React from 'react'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { ImageContainer } from './image-container'

interface IOnionSkinProps extends ICommonImageDiffProperties {
  readonly crossfade: number
}

export class OnionSkin extends React.Component<IOnionSkinProps, {}> {
  public render() {
    const style: React.CSSProperties = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }

    const renderedSize: React.CSSProperties = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }

    return (
      <div className="image-diff-onion-skin">
        <div className="sizing-container" ref={this.props.onContainerRef}>
          <div className="image-container" style={style}>
            <div className="image-diff-previous" style={style}>
              <ImageContainer
                image={this.props.previous}
                onElementLoad={this.props.onPreviousImageLoad}
                style={renderedSize}
              />
            </div>

            <div
              className="image-diff-current"
              style={{
                ...style,
                opacity: this.props.crossfade / 100.0,
              }}
            >
              <ImageContainer
                image={this.props.current}
                onElementLoad={this.props.onCurrentImageLoad}
                style={renderedSize}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }
}
