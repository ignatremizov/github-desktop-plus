import { findCommentStart } from './changed-range'

export interface IDiffLineAlignment {
  readonly beforeIndex: number | null
  readonly afterIndex: number | null
}

interface IStructuralLineKey {
  readonly value: string
  readonly words: ReadonlyArray<string>
  readonly kind:
    | 'field'
    | 'assignment'
    | 'list-item'
    | 'declaration'
    | 'database-declaration'
    | 'comment-subject'
}

interface ILineFingerprint {
  readonly normalized: string
  readonly compact: string
  readonly bigrams: ReadonlyMap<string, number>
  readonly structuralKey: IStructuralLineKey | null
}

enum AlignmentDirection {
  Pair = 1,
  Delete = 2,
  Add = 3,
}

const GapCost = 1
const PairOrderBias = 0.0001
const MaxAlignmentCells = 40_000
const MaxSimilarityFingerprintLength = 1_024
const MinimumLineSimilarity = 0.55
const GenericListItemSubjects = new Set([
  'a',
  'an',
  'the',
  'this',
  'that',
  'if',
  'for',
  'to',
  'use',
  'add',
  'keep',
])

function getBigrams(value: string): ReadonlyMap<string, number> {
  const bigrams = new Map<string, number>()

  for (let i = 0; i < value.length - 1; i++) {
    const bigram = value.slice(i, i + 2)
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1)
  }

  return bigrams
}

function getIdentifierWords(value: string): ReadonlyArray<string> {
  return Array.from(
    value.matchAll(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g),
    match => match[0].toLocaleLowerCase()
  )
}

function isLikelyDatabaseDeclarationType(value: string): boolean {
  const normalized = value.replace(/[,;]$/, '')
  const databaseType =
    /^(?:bigint|bigserial|boolean|bytea|char|date|decimal|double|integer|interval|jsonb?|numeric|real|smallint|smallserial|text|time|timestamp|timestamptz|uuid|varchar)(?:\([^)]*\))?(?:\[\])?$/i

  return databaseType.test(normalized)
}

function isLikelyDatabaseDeclarationSuffix(value: string): boolean {
  const suffix = value.trimStart()
  return (
    suffix.length === 0 ||
    /^[,;)]/.test(suffix) ||
    /^(?:check|collate|constraint|default|generated|not|null|primary|references|unique)\b/i.test(
      suffix
    )
  )
}

function isLikelyDeclarationType(value: string): boolean {
  const normalized = value.replace(/[,;]$/, '')
  const primitiveType =
    /^(?:(?:\[\])*\*?)?(?:any|bool|byte|complex(?:64|128)|error|float(?:32|64)|int(?:8|16|32|64)?|rune|string|uint(?:8|16|32|64|ptr)?)$/
  const qualifiedType =
    /^(?:(?:\[\])*\*?)?(?:[A-Za-z_$][A-Za-z0-9_$]*\.)+[A-Za-z_$][A-Za-z0-9_$]*$/

  return (
    primitiveType.test(normalized) ||
    isLikelyDatabaseDeclarationType(normalized) ||
    qualifiedType.test(normalized) ||
    normalized.startsWith('*') ||
    normalized.startsWith('[]') ||
    normalized.startsWith('map[')
  )
}

function getStructuralLineKey(value: string): IStructuralLineKey | null {
  const commentSubjectMatch = value.match(
    /^\/\/+\s*([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*[-:]|\s*$)/
  )
  if (commentSubjectMatch !== null) {
    return {
      value: commentSubjectMatch[1],
      words: getIdentifierWords(commentSubjectMatch[1]),
      kind: 'comment-subject',
    }
  }

  const fieldMatch = value.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/)
  if (fieldMatch !== null) {
    return {
      value: fieldMatch[1],
      words: getIdentifierWords(fieldMatch[1]),
      kind: 'field',
    }
  }

  const assignmentMatch = value.match(
    /^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::=|=(?!=))/
  )
  if (assignmentMatch !== null) {
    return {
      value: assignmentMatch[1],
      words: getIdentifierWords(assignmentMatch[1]),
      kind: 'assignment',
    }
  }

  const listItemMatch = value.match(
    /^-\s+([`'"]?)([A-Za-z_$][A-Za-z0-9_$-]*)\1\s*$/
  )
  if (listItemMatch !== null) {
    return {
      value: listItemMatch[2],
      words: getIdentifierWords(listItemMatch[2]),
      kind: 'list-item',
    }
  }

  const listItemSubjectMatch = value.match(
    /^-\s+(?:\*\*|[`'"])?([A-Za-z_$][A-Za-z0-9_$-]*)(?:\*\*|[`'"])?(?=\s|:|$)/
  )
  if (
    listItemSubjectMatch !== null &&
    !GenericListItemSubjects.has(listItemSubjectMatch[1].toLocaleLowerCase())
  ) {
    return {
      value: listItemSubjectMatch[1],
      words: getIdentifierWords(listItemSubjectMatch[1]),
      kind: 'list-item',
    }
  }

  const declarationMatch = value.match(
    /^([`'"]?)([A-Za-z_$][A-Za-z0-9_$]*)\1\s+([A-Za-z][A-Za-z0-9_]*\s*\([^)]*\)|\S+)/
  )
  const declarationType = declarationMatch?.[3]
  if (
    declarationMatch !== null &&
    declarationType !== undefined &&
    isLikelyDeclarationType(declarationType) &&
    (!isLikelyDatabaseDeclarationType(declarationType) ||
      isLikelyDatabaseDeclarationSuffix(
        value.slice(declarationMatch[0].length)
      ))
  ) {
    return {
      value: declarationMatch[2],
      words: getIdentifierWords(declarationMatch[2]),
      kind: isLikelyDatabaseDeclarationType(declarationMatch[3])
        ? 'database-declaration'
        : 'declaration',
    }
  }

  return null
}

function fingerprintLine(value: string): ILineFingerprint {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const compact = normalized.replace(/\s/g, '')
  const commentStart = findCommentStart(value)
  const contentBeforeComment =
    commentStart !== undefined && value.slice(0, commentStart).trim().length > 0
      ? value.slice(0, commentStart)
      : value
  const comparisonValue = contentBeforeComment.trim().replace(/\s+/g, ' ')
  const similarityFingerprint =
    comparisonValue.length <= MaxSimilarityFingerprintLength
      ? comparisonValue
      : comparisonValue.slice(0, MaxSimilarityFingerprintLength / 2) +
        comparisonValue.slice(-MaxSimilarityFingerprintLength / 2)

  return {
    normalized,
    compact,
    bigrams: getBigrams(similarityFingerprint),
    structuralKey: getStructuralLineKey(comparisonValue),
  }
}

/**
 * Whether two lines are the same after indentation/alignment whitespace is
 * ignored. These pairs are stable anchors around inserted and deleted lines.
 */
export function areDiffLinesStronglyRelated(
  beforeLine: string,
  afterLine: string
): boolean {
  const before = fingerprintLine(beforeLine)
  const after = fingerprintLine(afterLine)

  return (
    before.normalized === after.normalized ||
    (before.compact.length > 0 && before.compact === after.compact)
  )
}

/**
 * Whether two lines expose related structural keys, such as FeeCharged and
 * TotalFeeCharged fields. These pairs are useful boundaries when an uneven
 * replacement block also contains inserted comments or declarations.
 */
export function areDiffLinesStructuralCounterparts(
  beforeLine: string,
  afterLine: string
): boolean {
  const before = fingerprintLine(beforeLine)
  const after = fingerprintLine(afterLine)

  return (
    getStructuralPairCost(before.structuralKey, after.structuralKey) !== null
  )
}

/** Whether a line declares a typed code field or database column. */
export function isDiffLineDeclaration(line: string): boolean {
  const kind = fingerprintLine(line).structuralKey?.kind
  return kind === 'declaration' || kind === 'database-declaration'
}

function bigramSimilarity(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>
): number {
  let beforeCount = 0
  let afterCount = 0
  let sharedCount = 0

  for (const count of before.values()) {
    beforeCount += count
  }

  for (const [bigram, count] of after) {
    afterCount += count
    sharedCount += Math.min(count, before.get(bigram) ?? 0)
  }

  const totalCount = beforeCount + afterCount
  return totalCount === 0 ? 0 : (2 * sharedCount) / totalCount
}

function structuralKeySimilarity(
  before: IStructuralLineKey,
  after: IStructuralLineKey
): number {
  if (before.kind !== after.kind) {
    return 0
  }

  if (before.value === after.value) {
    return 1
  }

  let sharedWordCount = 0
  const remainingAfterWords = [...after.words]

  for (const word of before.words) {
    const afterIndex = remainingAfterWords.indexOf(word)
    if (afterIndex === -1) {
      continue
    }

    sharedWordCount++
    remainingAfterWords.splice(afterIndex, 1)
  }

  const wordCount = before.words.length + after.words.length
  return wordCount === 0 ? 0 : (2 * sharedWordCount) / wordCount
}

function getStructuralPairCost(
  before: IStructuralLineKey | null,
  after: IStructuralLineKey | null
): number | null {
  if (before === null || after === null || before.kind !== after.kind) {
    return null
  }

  if (before.kind === 'database-declaration' && before.value !== after.value) {
    return null
  }

  const similarity = structuralKeySimilarity(before, after)
  if (similarity === 1) {
    return 0.3
  }

  if (similarity >= 0.4) {
    return 1.5 - similarity
  }

  return null
}

function getPairCost(
  before: ILineFingerprint,
  after: ILineFingerprint
): number | null {
  if (before.normalized === after.normalized) {
    return 0
  }

  if (before.compact.length > 0 && before.compact === after.compact) {
    return 0.15
  }

  const similarity = bigramSimilarity(before.bigrams, after.bigrams)
  const textPairCost =
    similarity < MinimumLineSimilarity ? null : 0.35 + (1 - similarity) * 1.5
  const structuralPairCost = getStructuralPairCost(
    before.structuralKey,
    after.structuralKey
  )
  const hasComparableStructuralKeys =
    before.structuralKey !== null &&
    after.structuralKey !== null &&
    before.structuralKey.kind === after.structuralKey.kind

  if (hasComparableStructuralKeys) {
    if (structuralPairCost !== null) {
      return structuralPairCost
    }

    // Shared declaration types, tags, and descriptions can make unrelated
    // names look deceptively similar. Keep positional fallback possible, but
    // make it weaker than any related structural-key match.
    return textPairCost === null ? null : Math.max(textPairCost, 1.6)
  }

  if (textPairCost === null) {
    return structuralPairCost
  }

  return structuralPairCost === null
    ? textPairCost
    : Math.min(textPairCost, structuralPairCost)
}

function alignByIndex(
  beforeLines: ReadonlyArray<string>,
  afterLines: ReadonlyArray<string>
): ReadonlyArray<IDiffLineAlignment> {
  const alignment = new Array<IDiffLineAlignment>()
  const pairedCount = Math.min(beforeLines.length, afterLines.length)

  for (let i = 0; i < pairedCount; i++) {
    alignment.push({ beforeIndex: i, afterIndex: i })
  }

  for (let i = pairedCount; i < beforeLines.length; i++) {
    alignment.push({ beforeIndex: i, afterIndex: null })
  }

  for (let i = pairedCount; i < afterLines.length; i++) {
    alignment.push({ beforeIndex: null, afterIndex: i })
  }

  return alignment
}

/**
 * Aligns deleted and added lines while preserving their relative order.
 *
 * Small and medium changed blocks use dynamic programming so unchanged or
 * lightly edited lines remain paired when fields are inserted around them.
 * Larger blocks retain the previous index-based behavior to keep diff
 * rendering work bounded.
 */
export function alignDiffLines(
  beforeLines: ReadonlyArray<string>,
  afterLines: ReadonlyArray<string>
): ReadonlyArray<IDiffLineAlignment> {
  if (beforeLines.length === 0) {
    return afterLines.map((_, afterIndex) => ({
      beforeIndex: null,
      afterIndex,
    }))
  }

  if (afterLines.length === 0) {
    return beforeLines.map((_, beforeIndex) => ({
      beforeIndex,
      afterIndex: null,
    }))
  }

  if (beforeLines.length * afterLines.length > MaxAlignmentCells) {
    return alignByIndex(beforeLines, afterLines)
  }

  const beforeFingerprints = beforeLines.map(fingerprintLine)
  const afterFingerprints = afterLines.map(fingerprintLine)
  const columnCount = afterLines.length + 1
  const costs = new Float64Array((beforeLines.length + 1) * columnCount)
  const directions = new Uint8Array(costs.length)

  for (let beforeIndex = 1; beforeIndex <= beforeLines.length; beforeIndex++) {
    const cell = beforeIndex * columnCount
    costs[cell] = beforeIndex * GapCost
    directions[cell] = AlignmentDirection.Delete
  }

  for (let afterIndex = 1; afterIndex <= afterLines.length; afterIndex++) {
    costs[afterIndex] = afterIndex * GapCost
    directions[afterIndex] = AlignmentDirection.Add
  }

  for (let beforeIndex = 1; beforeIndex <= beforeLines.length; beforeIndex++) {
    for (let afterIndex = 1; afterIndex <= afterLines.length; afterIndex++) {
      const cell = beforeIndex * columnCount + afterIndex
      const deleteCost = costs[cell - columnCount] + GapCost
      const addCost = costs[cell - 1] + GapCost
      const pairCost = getPairCost(
        beforeFingerprints[beforeIndex - 1],
        afterFingerprints[afterIndex - 1]
      )
      const alignedPairCost =
        pairCost === null
          ? Number.POSITIVE_INFINITY
          : costs[cell - columnCount - 1] +
            pairCost +
            (beforeIndex + afterIndex) * PairOrderBias

      if (alignedPairCost <= deleteCost && alignedPairCost <= addCost) {
        costs[cell] = alignedPairCost
        directions[cell] = AlignmentDirection.Pair
      } else if (deleteCost < addCost) {
        costs[cell] = deleteCost
        directions[cell] = AlignmentDirection.Delete
      } else {
        costs[cell] = addCost
        directions[cell] = AlignmentDirection.Add
      }
    }
  }

  const alignment = new Array<IDiffLineAlignment>()
  let beforeIndex = beforeLines.length
  let afterIndex = afterLines.length

  while (beforeIndex > 0 || afterIndex > 0) {
    const direction = directions[beforeIndex * columnCount + afterIndex]

    if (direction === AlignmentDirection.Pair) {
      beforeIndex--
      afterIndex--
      alignment.push({ beforeIndex, afterIndex })
    } else if (direction === AlignmentDirection.Delete) {
      beforeIndex--
      alignment.push({ beforeIndex, afterIndex: null })
    } else {
      afterIndex--
      alignment.push({ beforeIndex: null, afterIndex })
    }
  }

  alignment.reverse()
  return alignment
}
