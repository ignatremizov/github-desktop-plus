export interface ISvgAttribute {
  readonly value: string
  readonly quote: '"' | "'"
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getSvgAttributePattern(name: string) {
  return new RegExp(
    `(^|\\s)${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\2`,
    'i'
  )
}

/**
 * Return the opening root SVG tag, accounting for `>` characters inside
 * quoted attribute values.
 */
export function getSvgRootTag(content: string): string | null {
  const start = content.search(/<svg(?=[\s>])/i)
  if (start === -1) {
    return null
  }

  let quote: '"' | "'" | null = null
  for (let i = start; i < content.length; i++) {
    const character = content[i]
    if (quote !== null) {
      if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return content.slice(start, i + 1)
    }
  }

  return null
}

/** Read an exact attribute from the root tag (for example, not stroke-width). */
export function getSvgAttribute(
  svgTag: string,
  name: string
): ISvgAttribute | null {
  const match = getSvgAttributePattern(name).exec(svgTag)
  if (match === null) {
    return null
  }

  return {
    value: match[3],
    quote: match[2] as '"' | "'",
  }
}

/** Replace an exact root-tag attribute while preserving its leading spacing. */
export function replaceSvgAttribute(
  svgTag: string,
  name: string,
  value: string
) {
  return svgTag.replace(
    getSvgAttributePattern(name),
    (_match, spacing: string, quote: '"' | "'") =>
      `${spacing}${name}=${quote}${value}${quote}`
  )
}

/** Add an attribute immediately after the root SVG element name. */
export function addSvgAttribute(svgTag: string, name: string, value: string) {
  return svgTag.replace(
    /<svg(?=[\s>])/i,
    match => `${match} ${name}="${value}"`
  )
}

/**
 * Parse an SVG/CSS absolute length into CSS pixels. Relative and viewport
 * units intentionally return null because their pixel size depends on the
 * document in which the SVG is rendered.
 */
export function parseSvgLength(value: string): number | null {
  const match =
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)$/i.exec(
      value.trim()
    )
  if (match === null) {
    return null
  }

  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  const unit = match[2].toLowerCase()
  let pixelsPerUnit: number
  switch (unit) {
    case '':
    case 'px':
      pixelsPerUnit = 1
      break
    case 'in':
      pixelsPerUnit = 96
      break
    case 'cm':
      pixelsPerUnit = 96 / 2.54
      break
    case 'mm':
      pixelsPerUnit = 96 / 25.4
      break
    case 'q':
      pixelsPerUnit = 96 / 101.6
      break
    case 'pt':
      pixelsPerUnit = 96 / 72
      break
    case 'pc':
      pixelsPerUnit = 16
      break
    default:
      return null
  }

  return amount * pixelsPerUnit
}
