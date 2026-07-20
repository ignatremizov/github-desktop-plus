import { DiffLine, DiffLineType } from '../../models/diff'
import { ILineTokens } from '../../lib/highlighter/types'
import { forceUnwrap } from '../../lib/fatal-error'
import {
  DiffRowType,
  getDiffTokens,
  SimplifiedDiffRow,
  SimplifiedDiffRowData,
} from './diff-helpers'
import {
  alignDiffLines,
  areDiffLinesStronglyRelated,
  areDiffLinesStructuralCounterparts,
  IDiffLineAlignment,
  isDiffLineDeclaration,
} from './diff-line-alignment'
import { IRelativeChange, relativeTokenChangeRanges } from './changed-range'

export interface IModifiedDiffLine {
  readonly line: DiffLine
  readonly diffLineNumber: number
}

const MaxStandardIntralineDiffStringLength = 1_024

export function getModifiedRows(
  addedOrDeletedLines: ReadonlyArray<IModifiedDiffLine>,
  showSideBySideDiff: boolean,
  useSemanticReadOnlyOrder = false,
  groupSplitReplacementBlocks = false,
  hasContextBefore = false,
  hasContextAfter = false,
  highlightOneSidedDeclarations = true,
  enhancedDiffHighlighting = true,
  preferProsePunctuation = false
): ReadonlyArray<SimplifiedDiffRow> {
  if (addedOrDeletedLines.length === 0) {
    return []
  }

  if (!enhancedDiffHighlighting) {
    return getStandardModifiedRows(addedOrDeletedLines, showSideBySideDiff)
  }

  const hunkStartLine = addedOrDeletedLines[0].diffLineNumber
  const addedLines = new Array<IModifiedDiffLine>()
  const deletedLines = new Array<IModifiedDiffLine>()

  for (const line of addedOrDeletedLines) {
    if (line.line.type === DiffLineType.Add) {
      addedLines.push(line)
    } else if (line.line.type === DiffLineType.Delete) {
      deletedLines.push(line)
    }
  }

  const output = new Array<SimplifiedDiffRow>()
  const diffTokensBefore = new Array<ILineTokens | undefined>()
  const diffTokensAfter = new Array<ILineTokens | undefined>()
  const alignment = alignDiffLines(
    deletedLines.map(line => line.line.content),
    addedLines.map(line => line.line.content)
  )

  for (const pair of alignment) {
    if (pair.beforeIndex === null || pair.afterIndex === null) {
      continue
    }

    const beforeIndex = pair.beforeIndex
    const afterIndex = pair.afterIndex
    const deletedLine = deletedLines[beforeIndex]
    const addedLine = addedLines[afterIndex]

    const { before, after } = getDiffTokens(
      deletedLine.line.content,
      addedLine.line.content,
      { preferProsePunctuation }
    )
    diffTokensBefore[beforeIndex] = before
    diffTokensAfter[afterIndex] = after
  }

  applyMultilineDiffTokensToReplacementRegions(
    alignment,
    deletedLines,
    addedLines,
    diffTokensBefore,
    diffTokensAfter
  )

  applyFullLineDiffTokensToOneSidedGaps(
    alignment,
    deletedLines,
    addedLines,
    diffTokensBefore,
    diffTokensAfter,
    hasContextBefore,
    hasContextAfter,
    highlightOneSidedDeclarations
  )

  if (!showSideBySideDiff) {
    if (useSemanticReadOnlyOrder) {
      for (const pair of alignment) {
        appendAlignmentRow(
          output,
          pair,
          deletedLines,
          addedLines,
          diffTokensBefore,
          diffTokensAfter,
          hunkStartLine
        )
      }

      return output
    }

    for (let i = 0; i < deletedLines.length; i++) {
      output.push({
        type: DiffRowType.Deleted,
        data: getDataFromLine(
          deletedLines[i],
          'oldLineNumber',
          diffTokensBefore[i]
        ),
        hunkStartLine,
      })
    }

    for (let i = 0; i < addedLines.length; i++) {
      output.push({
        type: DiffRowType.Added,
        data: getDataFromLine(
          addedLines[i],
          'newLineNumber',
          diffTokensAfter[i]
        ),
        hunkStartLine,
      })
    }

    return output
  }

  if (groupSplitReplacementBlocks) {
    appendGroupedSplitRows(
      output,
      alignment,
      deletedLines,
      addedLines,
      diffTokensBefore,
      diffTokensAfter,
      hunkStartLine
    )
    return output
  }

  for (const pair of compactSplitReplacementRegions(alignment)) {
    appendAlignmentRow(
      output,
      pair,
      deletedLines,
      addedLines,
      diffTokensBefore,
      diffTokensAfter,
      hunkStartLine
    )
  }

  return output
}

function getStandardModifiedRows(
  addedOrDeletedLines: ReadonlyArray<IModifiedDiffLine>,
  showSideBySideDiff: boolean
): ReadonlyArray<SimplifiedDiffRow> {
  const hunkStartLine = addedOrDeletedLines[0].diffLineNumber
  const addedLines = new Array<IModifiedDiffLine>()
  const deletedLines = new Array<IModifiedDiffLine>()

  for (const line of addedOrDeletedLines) {
    if (line.line.type === DiffLineType.Add) {
      addedLines.push(line)
    } else if (line.line.type === DiffLineType.Delete) {
      deletedLines.push(line)
    }
  }

  const diffTokensBefore = new Array<ILineTokens | undefined>()
  const diffTokensAfter = new Array<ILineTokens | undefined>()

  // Preserve the original renderer behavior: intraline ranges are calculated
  // only when the hunk has the same number of additions and deletions.
  if (addedLines.length === deletedLines.length) {
    for (let index = 0; index < deletedLines.length; index++) {
      const addedLine = addedLines[index]
      const deletedLine = deletedLines[index]

      if (
        addedLine.line.content.length < MaxStandardIntralineDiffStringLength &&
        deletedLine.line.content.length < MaxStandardIntralineDiffStringLength
      ) {
        const { before, after } = getDiffTokens(
          deletedLine.line.content,
          addedLine.line.content
        )
        diffTokensBefore[index] = before
        diffTokensAfter[index] = after
      }
    }
  }

  const output = new Array<SimplifiedDiffRow>()
  let pairedIndex = 0

  while (
    showSideBySideDiff &&
    pairedIndex < addedLines.length &&
    pairedIndex < deletedLines.length
  ) {
    output.push({
      type: DiffRowType.Modified,
      beforeData: getDataFromLine(
        deletedLines[pairedIndex],
        'oldLineNumber',
        diffTokensBefore[pairedIndex]
      ),
      afterData: getDataFromLine(
        addedLines[pairedIndex],
        'newLineNumber',
        diffTokensAfter[pairedIndex]
      ),
      hunkStartLine,
    })
    pairedIndex++
  }

  for (let index = pairedIndex; index < deletedLines.length; index++) {
    output.push({
      type: DiffRowType.Deleted,
      data: getDataFromLine(
        deletedLines[index],
        'oldLineNumber',
        diffTokensBefore[index]
      ),
      hunkStartLine,
    })
  }

  for (let index = pairedIndex; index < addedLines.length; index++) {
    output.push({
      type: DiffRowType.Added,
      data: getDataFromLine(
        addedLines[index],
        'newLineNumber',
        diffTokensAfter[index]
      ),
      hunkStartLine,
    })
  }

  return output
}

function compactSplitReplacementRegions(
  alignment: ReadonlyArray<IDiffLineAlignment>
): ReadonlyArray<IDiffLineAlignment> {
  const compacted = new Array<IDiffLineAlignment>()
  let replacementRegion = new Array<IDiffLineAlignment>()

  const flushReplacementRegion = () => {
    if (replacementRegion.length === 0) {
      return
    }

    const beforeIndexes = replacementRegion.flatMap(pair =>
      pair.beforeIndex === null ? [] : [pair.beforeIndex]
    )
    const afterIndexes = replacementRegion.flatMap(pair =>
      pair.afterIndex === null ? [] : [pair.afterIndex]
    )
    const rowCount = Math.max(beforeIndexes.length, afterIndexes.length)

    for (let index = 0; index < rowCount; index++) {
      compacted.push({
        beforeIndex: beforeIndexes[index] ?? null,
        afterIndex: afterIndexes[index] ?? null,
      })
    }

    replacementRegion = []
  }

  for (const pair of alignment) {
    if (pair.beforeIndex === null || pair.afterIndex === null) {
      replacementRegion.push(pair)
      continue
    }

    flushReplacementRegion()
    compacted.push(pair)
  }

  flushReplacementRegion()
  return compacted
}

function applyFullLineDiffTokensToOneSidedGaps(
  alignment: ReadonlyArray<IDiffLineAlignment>,
  deletedLines: ReadonlyArray<IModifiedDiffLine>,
  addedLines: ReadonlyArray<IModifiedDiffLine>,
  diffTokensBefore: Array<ILineTokens | undefined>,
  diffTokensAfter: Array<ILineTokens | undefined>,
  hasContextBefore: boolean,
  hasContextAfter: boolean,
  highlightOneSidedDeclarations: boolean
) {
  if (deletedLines.length === 0 || addedLines.length === 0) {
    if (!hasContextBefore && !hasContextAfter) {
      return
    }

    for (const [index, line] of deletedLines.entries()) {
      diffTokensBefore[index] = getFullLineDiffTokens(
        line.line.content,
        'diff-delete-inner'
      )
    }

    for (const [index, line] of addedLines.entries()) {
      diffTokensAfter[index] = getFullLineDiffTokens(
        line.line.content,
        'diff-add-inner'
      )
    }

    return
  }

  let previousAnchorIndex: number | null = null

  for (const [alignmentIndex, pair] of alignment.entries()) {
    if (
      pair.beforeIndex === null ||
      pair.afterIndex === null ||
      !isStrongAlignmentPair(pair, deletedLines, addedLines)
    ) {
      continue
    }

    if (previousAnchorIndex === null && hasContextBefore) {
      applyFullLineDiffTokensToSemanticRegion(
        alignment.slice(0, alignmentIndex),
        deletedLines,
        addedLines,
        diffTokensBefore,
        diffTokensAfter
      )
    }

    if (previousAnchorIndex !== null) {
      applyFullLineDiffTokensToSemanticRegion(
        alignment.slice(previousAnchorIndex + 1, alignmentIndex),
        deletedLines,
        addedLines,
        diffTokensBefore,
        diffTokensAfter
      )
    }

    previousAnchorIndex = alignmentIndex
  }

  if (previousAnchorIndex !== null && hasContextAfter) {
    applyFullLineDiffTokensToSemanticRegion(
      alignment.slice(previousAnchorIndex + 1),
      deletedLines,
      addedLines,
      diffTokensBefore,
      diffTokensAfter
    )
  }

  if (highlightOneSidedDeclarations) {
    applyFullLineDiffTokensToOneSidedDeclarations(
      alignment,
      deletedLines,
      addedLines,
      diffTokensBefore,
      diffTokensAfter
    )
  }
}

interface IJoinedDiffLine {
  readonly lineIndex: number
  readonly start: number
  readonly length: number
}

interface IJoinedDiffLines {
  readonly content: string
  readonly lines: ReadonlyArray<IJoinedDiffLine>
}

function applyMultilineDiffTokensToReplacementRegions(
  alignment: ReadonlyArray<IDiffLineAlignment>,
  deletedLines: ReadonlyArray<IModifiedDiffLine>,
  addedLines: ReadonlyArray<IModifiedDiffLine>,
  diffTokensBefore: Array<ILineTokens | undefined>,
  diffTokensAfter: Array<ILineTokens | undefined>
) {
  const regionRanges = new Array<{ start: number; end: number }>()
  let gapStart: number | undefined

  const appendGapRegion = (gapEnd: number) => {
    if (gapStart === undefined) {
      return
    }

    const start = Math.max(0, gapStart - 1)
    const end = Math.min(alignment.length, gapEnd + 1)
    const previous = regionRanges[regionRanges.length - 1]

    if (previous !== undefined && start <= previous.end) {
      previous.end = Math.max(previous.end, end)
    } else {
      regionRanges.push({ start, end })
    }

    gapStart = undefined
  }

  for (const [index, pair] of alignment.entries()) {
    if (pair.beforeIndex === null || pair.afterIndex === null) {
      gapStart ??= index
    } else {
      appendGapRegion(index)
    }
  }
  appendGapRegion(alignment.length)

  for (const { start, end } of regionRanges) {
    const region = alignment.slice(start, end)
    const hasOneSidedLine = region.some(
      pair => pair.beforeIndex === null || pair.afterIndex === null
    )
    const beforeIndexes = region.flatMap(pair =>
      pair.beforeIndex === null ? [] : [pair.beforeIndex]
    )
    const afterIndexes = region.flatMap(pair =>
      pair.afterIndex === null ? [] : [pair.afterIndex]
    )

    if (
      !hasOneSidedLine ||
      beforeIndexes.length === 0 ||
      afterIndexes.length === 0
    ) {
      continue
    }

    const before = joinDiffLines(beforeIndexes, deletedLines)
    const after = joinDiffLines(afterIndexes, addedLines)

    const changes = relativeTokenChangeRanges(before.content, after.content)
    if (changes !== undefined) {
      applyJoinedDiffTokens(
        before,
        changes,
        'stringARange',
        'diff-delete-inner',
        diffTokensBefore,
        true
      )
      applyJoinedDiffTokens(
        after,
        changes,
        'stringBRange',
        'diff-add-inner',
        diffTokensAfter,
        true
      )
    }
  }
}

function joinDiffLines(
  lineIndexes: ReadonlyArray<number>,
  lines: ReadonlyArray<IModifiedDiffLine>
): IJoinedDiffLines {
  let content = ''
  const joinedLines = new Array<IJoinedDiffLine>()

  for (const lineIndex of lineIndexes) {
    if (joinedLines.length > 0) {
      content += '\n'
    }

    const lineContent = lines[lineIndex].line.content
    joinedLines.push({
      lineIndex,
      start: content.length,
      length: lineContent.length,
    })
    content += lineContent
  }

  return { content, lines: joinedLines }
}

function applyJoinedDiffTokens(
  joined: IJoinedDiffLines,
  changes: ReadonlyArray<IRelativeChange>,
  rangeKey: 'stringARange' | 'stringBRange',
  token: 'diff-add-inner' | 'diff-delete-inner',
  target: Array<ILineTokens | undefined>,
  replaceExisting = false
) {
  const lineTokens = new Map<number, ILineTokens>()

  for (const change of changes) {
    const range = change[rangeKey]
    const rangeEnd = range.location + range.length

    for (const line of joined.lines) {
      const intersectionStart = Math.max(range.location, line.start)
      const intersectionEnd = Math.min(rangeEnd, line.start + line.length)

      if (intersectionStart >= intersectionEnd) {
        continue
      }

      const tokens = lineTokens.get(line.lineIndex) ?? {}
      tokens[intersectionStart - line.start] = {
        token,
        length: intersectionEnd - intersectionStart,
      }
      lineTokens.set(line.lineIndex, tokens)
    }
  }

  for (const line of joined.lines) {
    if (replaceExisting || target[line.lineIndex] === undefined) {
      target[line.lineIndex] = lineTokens.get(line.lineIndex)
    }
  }
}

function isStrongAlignmentPair(
  pair: IDiffLineAlignment,
  deletedLines: ReadonlyArray<IModifiedDiffLine>,
  addedLines: ReadonlyArray<IModifiedDiffLine>
): boolean {
  return (
    pair.beforeIndex !== null &&
    pair.afterIndex !== null &&
    areDiffLinesStronglyRelated(
      deletedLines[pair.beforeIndex].line.content,
      addedLines[pair.afterIndex].line.content
    )
  )
}

function applyFullLineDiffTokensToSemanticRegion(
  region: ReadonlyArray<IDiffLineAlignment>,
  deletedLines: ReadonlyArray<IModifiedDiffLine>,
  addedLines: ReadonlyArray<IModifiedDiffLine>,
  diffTokensBefore: Array<ILineTokens | undefined>,
  diffTokensAfter: Array<ILineTokens | undefined>
) {
  if (region.length === 0) {
    return
  }

  const hasDeletedLines = region.some(pair => pair.beforeIndex !== null)
  const hasAddedLines = region.some(pair => pair.afterIndex !== null)

  // A semantic insertion or deletion is a pure one-sided region bounded by
  // stable pairs. Weak pairs and mixed add/delete regions are replacements,
  // where full-line inner tokens create distracting stripes.
  if (hasDeletedLines === hasAddedLines) {
    return
  }

  for (const pair of region) {
    if (pair.beforeIndex !== null) {
      const deletedLine = deletedLines[pair.beforeIndex]
      diffTokensBefore[pair.beforeIndex] = getFullLineDiffTokens(
        deletedLine.line.content,
        'diff-delete-inner'
      )
    } else if (pair.afterIndex !== null) {
      const addedLine = addedLines[pair.afterIndex]
      diffTokensAfter[pair.afterIndex] = getFullLineDiffTokens(
        addedLine.line.content,
        'diff-add-inner'
      )
    }
  }
}

function applyFullLineDiffTokensToOneSidedDeclarations(
  alignment: ReadonlyArray<IDiffLineAlignment>,
  deletedLines: ReadonlyArray<IModifiedDiffLine>,
  addedLines: ReadonlyArray<IModifiedDiffLine>,
  diffTokensBefore: Array<ILineTokens | undefined>,
  diffTokensAfter: Array<ILineTokens | undefined>
) {
  for (const pair of alignment) {
    if (pair.beforeIndex !== null && pair.afterIndex === null) {
      const deletedLine = deletedLines[pair.beforeIndex]
      if (isDiffLineDeclaration(deletedLine.line.content)) {
        diffTokensBefore[pair.beforeIndex] = getFullLineDiffTokens(
          deletedLine.line.content,
          'diff-delete-inner'
        )
      }
    } else if (pair.beforeIndex === null && pair.afterIndex !== null) {
      const addedLine = addedLines[pair.afterIndex]
      if (isDiffLineDeclaration(addedLine.line.content)) {
        diffTokensAfter[pair.afterIndex] = getFullLineDiffTokens(
          addedLine.line.content,
          'diff-add-inner'
        )
      }
    }
  }
}

function getFullLineDiffTokens(
  content: string,
  token: 'diff-add-inner' | 'diff-delete-inner'
): ILineTokens | undefined {
  return content.length === 0
    ? undefined
    : {
        0: {
          token,
          length: content.length,
        },
      }
}

function appendAlignmentRow(
  output: Array<SimplifiedDiffRow>,
  pair: IDiffLineAlignment,
  deletedLines: ReadonlyArray<IModifiedDiffLine>,
  addedLines: ReadonlyArray<IModifiedDiffLine>,
  diffTokensBefore: ReadonlyArray<ILineTokens | undefined>,
  diffTokensAfter: ReadonlyArray<ILineTokens | undefined>,
  hunkStartLine: number
) {
  if (pair.beforeIndex !== null && pair.afterIndex !== null) {
    output.push({
      type: DiffRowType.Modified,
      beforeData: getDataFromLine(
        deletedLines[pair.beforeIndex],
        'oldLineNumber',
        diffTokensBefore[pair.beforeIndex]
      ),
      afterData: getDataFromLine(
        addedLines[pair.afterIndex],
        'newLineNumber',
        diffTokensAfter[pair.afterIndex]
      ),
      hunkStartLine,
    })
  } else if (pair.beforeIndex !== null) {
    output.push({
      type: DiffRowType.Deleted,
      data: getDataFromLine(
        deletedLines[pair.beforeIndex],
        'oldLineNumber',
        diffTokensBefore[pair.beforeIndex]
      ),
      hunkStartLine,
    })
  } else if (pair.afterIndex !== null) {
    output.push({
      type: DiffRowType.Added,
      data: getDataFromLine(
        addedLines[pair.afterIndex],
        'newLineNumber',
        diffTokensAfter[pair.afterIndex]
      ),
      hunkStartLine,
    })
  }
}

function appendGroupedSplitRows(
  output: Array<SimplifiedDiffRow>,
  alignment: ReadonlyArray<IDiffLineAlignment>,
  deletedLines: ReadonlyArray<IModifiedDiffLine>,
  addedLines: ReadonlyArray<IModifiedDiffLine>,
  diffTokensBefore: ReadonlyArray<ILineTokens | undefined>,
  diffTokensAfter: ReadonlyArray<ILineTokens | undefined>,
  hunkStartLine: number
) {
  let replacementBlock = new Array<IDiffLineAlignment>()

  const flushReplacementBlock = () => {
    if (replacementBlock.length === 0) {
      return
    }

    const beforeIndexes = replacementBlock.flatMap(pair =>
      pair.beforeIndex === null ? [] : [pair.beforeIndex]
    )
    const afterIndexes = replacementBlock.flatMap(pair =>
      pair.afterIndex === null ? [] : [pair.afterIndex]
    )
    const shouldGroup =
      beforeIndexes.length > 0 &&
      afterIndexes.length > 0 &&
      Math.abs(beforeIndexes.length - afterIndexes.length) >= 2

    if (shouldGroup) {
      const beforeBlockData = beforeIndexes.map(index =>
        getDataFromLine(
          deletedLines[index],
          'oldLineNumber',
          diffTokensBefore[index]
        )
      )
      const afterBlockData = afterIndexes.map(index =>
        getDataFromLine(
          addedLines[index],
          'newLineNumber',
          diffTokensAfter[index]
        )
      )

      output.push({
        type: DiffRowType.Modified,
        beforeData: beforeBlockData[0],
        afterData: afterBlockData[0],
        beforeBlockData,
        afterBlockData,
        hunkStartLine,
      })
    } else {
      for (const pair of replacementBlock) {
        appendAlignmentRow(
          output,
          pair,
          deletedLines,
          addedLines,
          diffTokensBefore,
          diffTokensAfter,
          hunkStartLine
        )
      }
    }

    replacementBlock = []
  }

  for (const pair of alignment) {
    if (!isSplitReplacementBoundaryPair(pair, deletedLines, addedLines)) {
      replacementBlock.push(pair)
      continue
    }

    flushReplacementBlock()
    appendAlignmentRow(
      output,
      pair,
      deletedLines,
      addedLines,
      diffTokensBefore,
      diffTokensAfter,
      hunkStartLine
    )
  }

  flushReplacementBlock()
}

function isSplitReplacementBoundaryPair(
  pair: IDiffLineAlignment,
  deletedLines: ReadonlyArray<IModifiedDiffLine>,
  addedLines: ReadonlyArray<IModifiedDiffLine>
): boolean {
  if (pair.beforeIndex === null || pair.afterIndex === null) {
    return false
  }

  return (
    isStrongAlignmentPair(pair, deletedLines, addedLines) ||
    areDiffLinesStructuralCounterparts(
      deletedLines[pair.beforeIndex].line.content,
      addedLines[pair.afterIndex].line.content
    )
  )
}

function getDataFromLine(
  { line, diffLineNumber }: IModifiedDiffLine,
  lineToUse: 'oldLineNumber' | 'newLineNumber',
  diffTokens: ILineTokens | undefined
): SimplifiedDiffRowData {
  const lineNumber = forceUnwrap(
    `Expecting ${lineToUse} value for ${line}`,
    line[lineToUse]
  )

  const tokens = new Array<ILineTokens>()

  if (diffTokens !== undefined && Object.keys(diffTokens).length > 0) {
    tokens.push(diffTokens)
  }

  return {
    content: line.content,
    lineNumber,
    diffLineNumber: line.originalLineNumber,
    noNewLineIndicator: line.noTrailingNewLine,
    tokens,
  }
}
