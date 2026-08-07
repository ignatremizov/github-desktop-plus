import { Image } from '../../../models/diff'
import { getSvgAttribute, getSvgRootTag, parseSvgLength } from './svg'

export interface ISize {
  readonly width: number
  readonly height: number
}

/**
 * Get the size which fits in the container without scaling and maintaining
 * aspect ratio.
 */
export function getAspectFitSize(
  imageSize: ISize,
  containerSize: ISize
): ISize {
  const heightRatio =
    containerSize.height < imageSize.height
      ? imageSize.height / containerSize.height
      : 1
  const widthRatio =
    containerSize.width < imageSize.width
      ? imageSize.width / containerSize.width
      : 1

  let ratio = Math.max(1, widthRatio)
  if (widthRatio < heightRatio) {
    ratio = Math.max(1, heightRatio)
  }

  return {
    width: imageSize.width / ratio,
    height: imageSize.height / ratio,
  }
}

/**
 * Get the size which will fit the bigger of the two images while maintaining
 * aspect ratio.
 */
export function getMaxFitSize(
  previousImageSize: ISize,
  currentImageSize: ISize,
  containerSize: ISize
): ISize {
  const previousSize = getAspectFitSize(previousImageSize, containerSize)
  const currentSize = getAspectFitSize(currentImageSize, containerSize)

  const width = Math.max(previousSize.width, currentSize.width)
  const height = Math.max(previousSize.height, currentSize.height)
  return { width, height }
}

/**
 * Extracts intrinsic dimensions from an SVG image's raw contents.
 * SVGs often omit explicit pixel width/height attributes or set them to 100%,
 * causing Chromium's <img> naturalWidth/naturalHeight to default to 150px height
 * or unhelpful fallback values.
 */
export function getSvgSize(image: Image): ISize | null {
  if (image.mediaType !== 'image/svg+xml') {
    return null
  }

  try {
    let content = ''
    if (image.rawContents) {
      content = new TextDecoder().decode(image.rawContents)
    } else if (image.contents) {
      content = Buffer.from(image.contents, 'base64').toString('utf-8')
    }

    if (!content) {
      return null
    }
    const svgTag = getSvgRootTag(content)
    if (svgTag === null) {
      return null
    }

    const parseAttr = (name: string): number | null => {
      const attribute = getSvgAttribute(svgTag, name)
      return attribute === null ? null : parseSvgLength(attribute.value)
    }

    let width = parseAttr('width')
    let height = parseAttr('height')

    const viewBox = getSvgAttribute(svgTag, 'viewBox')
    let vbWidth: number | null = null
    let vbHeight: number | null = null

    if (viewBox !== null) {
      const coords = viewBox.value
        .trim()
        .split(/[\s,]+/)
        .map(value => Number(value))
      if (
        coords.length === 4 &&
        coords.every(Number.isFinite) &&
        coords[2] > 0 &&
        coords[3] > 0
      ) {
        vbWidth = coords[2]
        vbHeight = coords[3]
      }
    }

    if (width !== null && height !== null) {
      return { width, height }
    }

    if (width !== null && vbWidth !== null && vbHeight !== null) {
      height = width * (vbHeight / vbWidth)
      return { width, height: Math.round(height) }
    }

    if (height !== null && vbWidth !== null && vbHeight !== null) {
      width = height * (vbWidth / vbHeight)
      return { width: Math.round(width), height }
    }

    if (vbWidth !== null && vbHeight !== null) {
      return { width: vbWidth, height: vbHeight }
    }
  } catch {
    // Fallback if parsing fails
  }

  return null
}
