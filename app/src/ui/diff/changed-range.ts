import { diffWordsWithSpace } from 'diff'

export interface IRange {
  /** The starting location for the range. */
  readonly location: number

  /** The length of the range. */
  readonly length: number
}

export interface IRelativeChange {
  readonly stringARange: IRange
  readonly stringBRange: IRange
}

interface IComparisonToken extends IRange {
  readonly value: string
  readonly kind: 'word' | 'literal' | 'number'
  readonly context: 'comment' | 'content'
  readonly assignmentSide: 'before' | 'after' | 'unpartitioned'
}

const MaxDynamicProgrammingCells = 250_000
const MaxLongLiteralEditLength = 128
const MinimumLongLiteralLength = 512
const MinimumLongLiteralAnchorLength = 64
const MinimumSemanticBoundaryWordLength = 3

/** Get the maximum position in the range. */
function rangeMax(range: IRange): number {
  return range.location + range.length
}

/** Get the length of the common substring between the two strings. */
function commonLength(
  stringA: string,
  rangeA: IRange,
  stringB: string,
  rangeB: IRange,
  reverse: boolean
): number {
  const max = Math.min(rangeA.length, rangeB.length)
  const startA = reverse ? rangeMax(rangeA) - 1 : rangeA.location
  const startB = reverse ? rangeMax(rangeB) - 1 : rangeB.location
  const stride = reverse ? -1 : 1

  let length = 0
  while (Math.abs(length) < max) {
    if (stringA[startA + length] !== stringB[startB + length]) {
      break
    }

    length += stride
  }

  return Math.abs(length)
}

/** Get the changed ranges in the strings, relative to each other. */
export function relativeChanges(
  stringA: string,
  stringB: string
): IRelativeChange {
  let bRange = { location: 0, length: stringB.length }
  let aRange = { location: 0, length: stringA.length }

  const prefixLength = commonLength(stringB, bRange, stringA, aRange, false)
  bRange = {
    location: bRange.location + prefixLength,
    length: bRange.length - prefixLength,
  }
  aRange = {
    location: aRange.location + prefixLength,
    length: aRange.length - prefixLength,
  }

  const suffixLength = commonLength(stringB, bRange, stringA, aRange, true)
  bRange.length -= suffixLength
  aRange.length -= suffixLength

  return { stringARange: aRange, stringBRange: bRange }
}

/**
 * Gets each changed range between two strings.
 *
 * Character-level comparison powers refinement within lexical tokens and
 * whitespace-only regions. Public intraline comparison below composes these
 * ranges with token alignment to avoid coincidental character matches.
 */
function relativeCharacterChangeRanges(
  stringA: string,
  stringB: string
): ReadonlyArray<IRelativeChange> {
  if (stringA === stringB) {
    return []
  }

  if (stringA.length * stringB.length > MaxDynamicProgrammingCells) {
    return [relativeChanges(stringA, stringB)]
  }

  const columnCount = stringB.length + 1
  const lengths = new Uint16Array((stringA.length + 1) * columnCount)

  for (let aIndex = stringA.length - 1; aIndex >= 0; aIndex--) {
    for (let bIndex = stringB.length - 1; bIndex >= 0; bIndex--) {
      const cell = aIndex * columnCount + bIndex

      lengths[cell] =
        stringA[aIndex] === stringB[bIndex]
          ? lengths[cell + columnCount + 1] + 1
          : Math.max(lengths[cell + columnCount], lengths[cell + 1])
    }
  }

  const changes = new Array<IRelativeChange>()
  let aIndex = 0
  let bIndex = 0
  let changeStartA: number | null = null
  let changeStartB: number | null = null

  const flushChange = () => {
    if (changeStartA === null || changeStartB === null) {
      return
    }

    changes.push({
      stringARange: {
        location: changeStartA,
        length: aIndex - changeStartA,
      },
      stringBRange: {
        location: changeStartB,
        length: bIndex - changeStartB,
      },
    })
    changeStartA = null
    changeStartB = null
  }

  while (aIndex < stringA.length || bIndex < stringB.length) {
    if (
      aIndex < stringA.length &&
      bIndex < stringB.length &&
      stringA[aIndex] === stringB[bIndex]
    ) {
      flushChange()
      aIndex++
      bIndex++
      continue
    }

    changeStartA ??= aIndex
    changeStartB ??= bIndex

    const deleteLength =
      aIndex < stringA.length
        ? lengths[(aIndex + 1) * columnCount + bIndex]
        : -1
    const addLength =
      bIndex < stringB.length ? lengths[aIndex * columnCount + bIndex + 1] : -1

    if (bIndex < stringB.length && addLength >= deleteLength) {
      bIndex++
    } else {
      aIndex++
    }
  }

  flushChange()
  return changes
}

export function relativeChangeRanges(
  stringA: string,
  stringB: string
): ReadonlyArray<IRelativeChange> {
  if (stringA === stringB) {
    return []
  }

  const tokenChanges = relativeTokenUnitChangeRanges(stringA, stringB)
  return tokenChanges === undefined || tokenChanges.length === 0
    ? relativeCharacterChangeRanges(stringA, stringB)
    : tokenChanges
}

function tokenizeForComparison(value: string): ReadonlyArray<IComparisonToken> {
  const tokens = new Array<IComparisonToken>()
  const lines = value.split('\n')
  let lineOffset = 0

  for (const line of lines) {
    const commentStart = findCommentStart(line)
    const assignmentBoundary = findAssignmentBoundary(line)

    for (const match of line.matchAll(
      /"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?/g
    )) {
      if (match.index === undefined) {
        continue
      }

      const matchedValue = match[0]
      if (/^[A-Za-z_$]/.test(matchedValue)) {
        for (const wordMatch of matchedValue.matchAll(
          /[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g
        )) {
          if (wordMatch.index === undefined) {
            continue
          }

          tokens.push({
            value: wordMatch[0],
            location: lineOffset + match.index + wordMatch.index,
            length: wordMatch[0].length,
            kind: 'word',
            context:
              commentStart !== undefined && match.index >= commentStart
                ? 'comment'
                : 'content',
            assignmentSide: getAssignmentSide(match.index, assignmentBoundary),
          })
        }
        continue
      }

      tokens.push({
        value: matchedValue,
        location: lineOffset + match.index,
        length: matchedValue.length,
        kind: /^["']/.test(matchedValue) ? 'literal' : 'number',
        context:
          commentStart !== undefined && match.index >= commentStart
            ? 'comment'
            : 'content',
        assignmentSide: getAssignmentSide(match.index, assignmentBoundary),
      })
    }

    lineOffset += line.length + 1
  }

  return tokens
}

function getAssignmentSide(
  location: number,
  assignmentBoundary: number | undefined
): IComparisonToken['assignmentSide'] {
  return assignmentBoundary === undefined
    ? 'unpartitioned'
    : location < assignmentBoundary
    ? 'before'
    : 'after'
}

function findAssignmentBoundary(line: string): number | undefined {
  const commentStart = findCommentStart(line) ?? line.length
  let quote: '"' | "'" | '`' | undefined
  let escaped = false

  for (let index = 0; index < commentStart; index++) {
    const character = line[index]

    if (quote !== undefined) {
      if (escaped) {
        escaped = false
      } else if (character === '\\' && quote !== '`') {
        escaped = true
      } else if (character === quote) {
        quote = undefined
      }
      continue
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character
      continue
    }

    if (character !== '=') {
      continue
    }

    const previous = line[index - 1]
    const next = line[index + 1]
    if (
      previous === '=' ||
      previous === '!' ||
      previous === '<' ||
      previous === '>' ||
      next === '=' ||
      next === '>'
    ) {
      continue
    }

    return index
  }

  return undefined
}

export function findCommentStart(line: string): number | undefined {
  const firstContent = line.search(/\S/)
  if (
    firstContent >= 0 &&
    /^(?:\/\/|#|--|\/\*|\*\/|\*)/.test(line.slice(firstContent))
  ) {
    return firstContent
  }

  let quote: '"' | "'" | '`' | undefined
  let escaped = false

  for (let index = 0; index < line.length - 1; index++) {
    const character = line[index]

    if (quote !== undefined) {
      if (escaped) {
        escaped = false
      } else if (character === '\\' && quote !== '`') {
        escaped = true
      } else if (character === quote) {
        quote = undefined
      }
      continue
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character
      continue
    }

    const startsLineComment =
      line.startsWith('//', index) &&
      (index === 0 || /\s/.test(line[index - 1]))
    if (
      startsLineComment ||
      line.startsWith('/*', index) ||
      line.startsWith('<!--', index)
    ) {
      return index
    }
  }

  return undefined
}

function getTokenMatches(
  tokensA: ReadonlyArray<IComparisonToken>,
  tokensB: ReadonlyArray<IComparisonToken>
): ReadonlyArray<readonly [number, number]> | undefined {
  if (tokensA.length * tokensB.length > MaxDynamicProgrammingCells) {
    return undefined
  }

  const columnCount = tokensB.length + 1
  const lengths = new Uint16Array((tokensA.length + 1) * columnCount)

  for (let aIndex = tokensA.length - 1; aIndex >= 0; aIndex--) {
    for (let bIndex = tokensB.length - 1; bIndex >= 0; bIndex--) {
      const cell = aIndex * columnCount + bIndex
      lengths[cell] = areComparisonTokensEqual(tokensA[aIndex], tokensB[bIndex])
        ? lengths[cell + columnCount + 1] + 1
        : Math.max(lengths[cell + columnCount], lengths[cell + 1])
    }
  }

  const matches = new Array<readonly [number, number]>()
  let aIndex = 0
  let bIndex = 0

  while (aIndex < tokensA.length && bIndex < tokensB.length) {
    if (areComparisonTokensEqual(tokensA[aIndex], tokensB[bIndex])) {
      const cell = aIndex * columnCount + bIndex

      // If skipping an identical destination token preserves the same optimal
      // subsequence, prefer the later occurrence. This keeps repeated tokens
      // attached to a stronger following suffix, such as visible JSX text
      // before a shared closing tag instead of a subword in a changed prop.
      if (lengths[cell + 1] === lengths[cell]) {
        bIndex++
        continue
      }

      matches.push([aIndex, bIndex])
      aIndex++
      bIndex++
    } else if (
      lengths[(aIndex + 1) * columnCount + bIndex] >=
      lengths[aIndex * columnCount + bIndex + 1]
    ) {
      aIndex++
    } else {
      bIndex++
    }
  }

  return matches
}

function areComparisonTokensEqual(
  tokenA: IComparisonToken,
  tokenB: IComparisonToken
): boolean {
  const assignmentSidesMatch =
    tokenA.assignmentSide === tokenB.assignmentSide ||
    tokenA.assignmentSide === 'unpartitioned' ||
    tokenB.assignmentSide === 'unpartitioned'

  return (
    tokenA.value === tokenB.value &&
    tokenA.kind === tokenB.kind &&
    tokenA.context === tokenB.context &&
    assignmentSidesMatch
  )
}

function isComparisonWordCharacter(value: string): boolean {
  return /[A-Za-z0-9_$]/.test(value)
}

function appendTokenChange(
  changes: Array<IRelativeChange>,
  stringA: string,
  stringB: string,
  initialStartA: number,
  initialEndA: number,
  initialStartB: number,
  initialEndB: number
) {
  let startA = initialStartA
  let endA = initialEndA
  let startB = initialStartB
  let endB = initialEndB

  while (
    startA < endA &&
    startB < endB &&
    stringA[startA] === stringB[startB]
  ) {
    startA++
    startB++
  }

  // A single shared identifier character is usually coincidental rather than
  // a useful stable boundary. Keep common punctuation and longer word
  // prefixes, but include a lone character in the changed range.
  let commonPrefixWordLength = 0
  while (
    startA - commonPrefixWordLength > initialStartA &&
    isComparisonWordCharacter(stringA[startA - commonPrefixWordLength - 1])
  ) {
    commonPrefixWordLength++
  }

  if (
    commonPrefixWordLength > 0 &&
    commonPrefixWordLength < MinimumSemanticBoundaryWordLength
  ) {
    startA -= commonPrefixWordLength
    startB -= commonPrefixWordLength
  }

  while (
    startA < endA &&
    startB < endB &&
    stringA[endA - 1] === stringB[endB - 1]
  ) {
    endA--
    endB--
  }

  let commonSuffixWordLength = 0
  while (
    endA + commonSuffixWordLength < initialEndA &&
    isComparisonWordCharacter(stringA[endA + commonSuffixWordLength])
  ) {
    commonSuffixWordLength++
  }

  if (
    commonSuffixWordLength > 0 &&
    commonSuffixWordLength < MinimumSemanticBoundaryWordLength
  ) {
    endA += commonSuffixWordLength
    endB += commonSuffixWordLength
  }

  const valueA = stringA.slice(startA, endA)
  const valueB = stringB.slice(startB, endB)
  if (
    valueA === valueB ||
    (valueA.trim().length === 0 && valueB.trim().length === 0)
  ) {
    return
  }

  changes.push({
    stringARange: { location: startA, length: endA - startA },
    stringBRange: { location: startB, length: endB - startB },
  })
}

function appendTokenUnitChanges(
  changes: Array<IRelativeChange>,
  tokensA: ReadonlyArray<IComparisonToken>,
  startA: number,
  endA: number,
  tokensB: ReadonlyArray<IComparisonToken>,
  startB: number,
  endB: number
) {
  const countA = endA - startA
  const countB = endB - startB

  if (countA === 1 && countB === 1) {
    const tokenA = tokensA[startA]
    const tokenB = tokensB[startB]
    const refinedChanges =
      tokenA.kind === 'literal' && tokenB.kind === 'literal'
        ? relativeLiteralChangeRanges(tokenA.value, tokenB.value)
        : [
            {
              stringARange: { location: 0, length: tokenA.length },
              stringBRange: { location: 0, length: tokenB.length },
            },
          ]

    for (const refined of refinedChanges) {
      changes.push({
        stringARange: {
          location: tokenA.location + refined.stringARange.location,
          length: refined.stringARange.length,
        },
        stringBRange: {
          location: tokenB.location + refined.stringBRange.location,
          length: refined.stringBRange.length,
        },
      })
    }
    return
  }

  const count = Math.max(countA, countB)
  const emptyLocationA =
    startA < tokensA.length
      ? tokensA[startA].location
      : tokensA[tokensA.length - 1]?.location +
          tokensA[tokensA.length - 1]?.length || 0
  const emptyLocationB =
    startB < tokensB.length
      ? tokensB[startB].location
      : tokensB[tokensB.length - 1]?.location +
          tokensB[tokensB.length - 1]?.length || 0

  for (let index = 0; index < count; index++) {
    const tokenA = index < countA ? tokensA[startA + index] : undefined
    const tokenB = index < countB ? tokensB[startB + index] : undefined

    changes.push({
      stringARange:
        tokenA === undefined
          ? { location: emptyLocationA, length: 0 }
          : { location: tokenA.location, length: tokenA.length },
      stringBRange:
        tokenB === undefined
          ? { location: emptyLocationB, length: 0 }
          : { location: tokenB.location, length: tokenB.length },
    })
  }
}

/**
 * Split distant edits inside a long quoted value without treating the entire
 * text between the first and last edit as changed.
 *
 * Myers word comparison stays bounded by edit distance. Only substantial
 * unchanged runs divide the literal into separate changes so common short
 * words inside a rewritten sentence do not create fragmented highlights.
 */
function relativeLiteralChangeRanges(
  stringA: string,
  stringB: string
): ReadonlyArray<IRelativeChange> {
  const coarseChange = relativeChanges(stringA, stringB)

  if (
    stringA.length < MinimumLongLiteralLength ||
    stringB.length < MinimumLongLiteralLength
  ) {
    return [coarseChange]
  }

  const parts = diffWordsWithSpace(stringA, stringB, {
    maxEditLength: MaxLongLiteralEditLength,
  })
  if (parts === undefined) {
    return [coarseChange]
  }

  const changes = new Array<IRelativeChange>()
  let locationA = 0
  let locationB = 0
  let changeStartA: number | undefined
  let changeStartB: number | undefined

  const flushChange = () => {
    if (changeStartA === undefined || changeStartB === undefined) {
      return
    }

    const localChange = relativeChanges(
      stringA.slice(changeStartA, locationA),
      stringB.slice(changeStartB, locationB)
    )
    changes.push({
      stringARange: {
        location: changeStartA + localChange.stringARange.location,
        length: localChange.stringARange.length,
      },
      stringBRange: {
        location: changeStartB + localChange.stringBRange.location,
        length: localChange.stringBRange.length,
      },
    })
    changeStartA = undefined
    changeStartB = undefined
  }

  for (const part of parts) {
    if (
      !part.added &&
      !part.removed &&
      part.value.length >= MinimumLongLiteralAnchorLength
    ) {
      flushChange()
      locationA += part.value.length
      locationB += part.value.length
      continue
    }

    if (part.added || part.removed) {
      changeStartA ??= locationA
      changeStartB ??= locationB
    }

    if (!part.added) {
      locationA += part.value.length
    }
    if (!part.removed) {
      locationB += part.value.length
    }
  }

  flushChange()

  return locationA === stringA.length &&
    locationB === stringB.length &&
    changes.length > 0
    ? changes
    : [coarseChange]
}

function appendCharacterRegionChanges(
  changes: Array<IRelativeChange>,
  stringA: string,
  startA: number,
  endA: number,
  stringB: string,
  startB: number,
  endB: number
) {
  const regionA = stringA.slice(startA, endA)
  const regionB = stringB.slice(startB, endB)

  for (const change of relativeCharacterChangeRanges(regionA, regionB)) {
    changes.push({
      stringARange: {
        location: startA + change.stringARange.location,
        length: change.stringARange.length,
      },
      stringBRange: {
        location: startB + change.stringBRange.location,
        length: change.stringBRange.length,
      },
    })
  }
}

/**
 * Gets token-shaped change ranges for a fragmented single-line comparison.
 *
 * Matched tokens stay unchanged, one-to-one token replacements retain their
 * common prefix and suffix, and larger rewritten regions highlight each
 * lexical token independently without painting punctuation between them.
 */
function relativeTokenUnitChangeRanges(
  stringA: string,
  stringB: string
): ReadonlyArray<IRelativeChange> | undefined {
  const tokensA = tokenizeForComparison(stringA)
  const tokensB = tokenizeForComparison(stringB)
  const matches = getTokenMatches(tokensA, tokensB)

  if (matches === undefined) {
    return undefined
  }

  const changes = new Array<IRelativeChange>()
  let previousA = 0
  let previousB = 0
  let previousEndA = 0
  let previousEndB = 0

  for (const [matchA, matchB] of matches) {
    const tokenA = tokensA[matchA]
    const tokenB = tokensB[matchB]

    if (matchA === previousA && matchB === previousB) {
      appendCharacterRegionChanges(
        changes,
        stringA,
        previousEndA,
        tokenA.location,
        stringB,
        previousEndB,
        tokenB.location
      )
    } else {
      appendTokenUnitChanges(
        changes,
        tokensA,
        previousA,
        matchA,
        tokensB,
        previousB,
        matchB
      )
    }

    previousA = matchA + 1
    previousB = matchB + 1
    previousEndA = tokenA.location + tokenA.length
    previousEndB = tokenB.location + tokenB.length
  }

  if (previousA === tokensA.length && previousB === tokensB.length) {
    appendCharacterRegionChanges(
      changes,
      stringA,
      previousEndA,
      stringA.length,
      stringB,
      previousEndB,
      stringB.length
    )
  } else {
    appendTokenUnitChanges(
      changes,
      tokensA,
      previousA,
      tokensA.length,
      tokensB,
      previousB,
      tokensB.length
    )
  }

  return changes
}

/**
 * Gets changed ranges using lexical tokens as stable units.
 *
 * This is intended for uneven multi-line replacements. It preserves words
 * and quoted values across line wrapping or expression changes without
 * treating punctuation and coincidental characters inside rewritten
 * identifiers as unchanged islands. Comparisons that exceed the token-cell
 * budget return undefined.
 */
export function relativeTokenChangeRanges(
  stringA: string,
  stringB: string
): ReadonlyArray<IRelativeChange> | undefined {
  if (stringA === stringB) {
    return []
  }

  const tokensA = tokenizeForComparison(stringA)
  const tokensB = tokenizeForComparison(stringB)
  const matches = getTokenMatches(tokensA, tokensB)
  if (matches === undefined) {
    return undefined
  }

  const changes = new Array<IRelativeChange>()
  let previousEndA = 0
  let previousEndB = 0

  for (const [matchA, matchB] of matches) {
    const tokenA = tokensA[matchA]
    const tokenB = tokensB[matchB]
    appendTokenChange(
      changes,
      stringA,
      stringB,
      previousEndA,
      tokenA.location,
      previousEndB,
      tokenB.location
    )
    previousEndA = tokenA.location + tokenA.length
    previousEndB = tokenB.location + tokenB.length
  }

  appendTokenChange(
    changes,
    stringA,
    stringB,
    previousEndA,
    stringA.length,
    previousEndB,
    stringB.length
  )

  return changes
}
