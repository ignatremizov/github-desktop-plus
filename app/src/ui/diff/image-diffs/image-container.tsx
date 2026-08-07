import * as React from 'react'

import { Image } from '../../../models/diff'
import { convertDDSImage } from './dds-converter'
import { ISize, getSvgSize } from './sizing'
import {
  addSvgAttribute,
  getSvgAttribute,
  getSvgRootTag,
  replaceSvgAttribute,
} from './svg'

export function getSvgDataUri(image: Image): {
  src: string
  size: ISize | null
} {
  const svgSize = getSvgSize(image)
  let svgText = ''
  if (image.rawContents) {
    svgText = new TextDecoder().decode(image.rawContents)
  } else if (image.contents) {
    svgText = Buffer.from(image.contents, 'base64').toString('utf-8')
  }

  if (!svgText) {
    return {
      src: `data:${image.mediaType};base64,${image.contents}`,
      size: svgSize,
    }
  }

  if (svgSize) {
    const svgTag = getSvgRootTag(svgText)
    if (svgTag !== null) {
      let updatedTag = svgTag
      const width = getSvgAttribute(updatedTag, 'width')
      const height = getSvgAttribute(updatedTag, 'height')

      if (width?.value.trim().endsWith('%')) {
        updatedTag = replaceSvgAttribute(
          updatedTag,
          'width',
          String(svgSize.width)
        )
      } else if (width === null) {
        updatedTag = addSvgAttribute(updatedTag, 'width', String(svgSize.width))
      }

      if (height?.value.trim().endsWith('%')) {
        updatedTag = replaceSvgAttribute(
          updatedTag,
          'height',
          String(svgSize.height)
        )
      } else if (height === null) {
        updatedTag = addSvgAttribute(
          updatedTag,
          'height',
          String(svgSize.height)
        )
      }

      const style = getSvgAttribute(updatedTag, 'style')
      if (style !== null) {
        const cleanedStyle = style.value
          .replace(/(^|;)\s*max-width\s*:[^;]*/gi, '$1')
          .replace(/(^|;)\s*max-height\s*:[^;]*/gi, '$1')
        updatedTag = replaceSvgAttribute(updatedTag, 'style', cleanedStyle)
      }

      if (updatedTag !== svgTag) {
        svgText = svgText.replace(svgTag, updatedTag)
      }
    }
  }

  const base64 = Buffer.from(svgText, 'utf-8').toString('base64')
  return {
    src: `data:image/svg+xml;base64,${base64}`,
    size: svgSize,
  }
}

interface IImageProps {
  /** The image contents to render */
  readonly image: Image

  /** Optional styles to apply to the image container */
  readonly style?: React.CSSProperties

  /** callback to fire after the image has been loaded */
  readonly onElementLoad?: (img: HTMLImageElement) => void
}

interface IImageState {
  readonly imageSource: string | null
  readonly svgSize: ISize | null
}

export class ImageContainer extends React.Component<IImageProps, IImageState> {
  public constructor(props: IImageProps) {
    super(props)
    this.state = {
      imageSource: null,
      svgSize: null,
    }
  }

  public loadImage(image: Image) {
    if (image.mediaType === 'image/vnd-ms.dds') {
      try {
        const dataURL = convertDDSImage(image.rawContents)
        this.setState({
          imageSource: dataURL,
          svgSize: null,
        })
      } catch (error) {
        console.error('Error loading DDS image:', error)
        this.setState({ imageSource: null, svgSize: null })
      }
    } else if (image.mediaType === 'image/svg+xml') {
      const { src, size } = getSvgDataUri(image)
      this.setState({
        imageSource: src,
        svgSize: size,
      })
    } else {
      this.setState({
        imageSource: `data:${image.mediaType};base64,${image.contents}`,
        svgSize: null,
      })
    }
  }

  public componentDidMount() {
    const { image } = this.props
    this.loadImage(image)
  }

  public componentDidUpdate(prevProps: IImageProps) {
    const { image } = this.props
    if (image === prevProps.image) {
      return
    }

    this.loadImage(image)
  }

  public render() {
    const { imageSource, svgSize } = this.state
    if (!imageSource) {
      return null
    }

    return (
      <div className="image-wrapper">
        <img
          src={imageSource}
          width={svgSize?.width}
          height={svgSize?.height}
          style={this.props.style}
          onLoad={this.onLoad}
          alt=""
        />
      </div>
    )
  }

  private onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (this.props.onElementLoad) {
      this.props.onElementLoad(e.currentTarget)
    }
  }
}
