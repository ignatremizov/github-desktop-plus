import * as React from 'react'

import { ILineTokens } from '../../lib/highlighter/types'
import classNames from 'classnames'
import { IRange, relativeChangeRanges } from './changed-range'
import { mapKeysEqual } from '../../lib/equality'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import { DiffHunk, DiffHunkExpansionType } from '../../models/diff/raw-diff'
import { DiffLineType, ILargeTextDiff, ITextDiff } from '../../models/diff'

/**
 * DiffRowType defines the different types of
 * rows that a diff visualization can have.
 *
 * It contains similar values than DiffLineType
 * with the addition of `Modified`, which
 * corresponds to a line that has both deleted and
 * added content.
 */
export enum DiffRowType {
  Context = 'Context',
  Hunk = 'Hunk',
  Added = 'Added',
  Deleted = 'Deleted',
  Modified = 'Modified',
}

export enum DiffColumn {
  Before = 'before',
  After = 'after',
}

export type SimplifiedDiffRowData = Omit<IDiffRowData, 'isSelected'>

export interface IDiffRowData {
  /**
   * The actual contents of the diff line.
   */
  readonly content: string

  /**
   * The line number on the source file.
   */
  readonly lineNumber: number

  /**
   * The line number on the original diff (without expansion).
   * This is used for discarding lines and for partial committing lines.
   */
  readonly diffLineNumber: number | null

  /**
   * Flag to display that this diff line lacks a new line.
   * This is used to display when a newline is
   * added or removed to the last line of a file.
   */
  readonly noNewLineIndicator: boolean

  /**
   * Whether the diff line has been selected for partial committing.
   */
  readonly isSelected: boolean

  /**
   * Array of tokens to do syntax highlighting on the diff line.
   */
  readonly tokens: ReadonlyArray<ILineTokens>
}

/**
 * IDiffRowAdded represents a row that displays an added line.
 */
interface IDiffRowAdded<T = IDiffRowData> {
  readonly type: DiffRowType.Added

  /**
   * The data object contains information about that added line in the diff.
   */
  readonly data: T

  /**
   * The start line of the hunk where this line belongs in the diff.
   *
   * In this context, a hunk is not exactly equivalent to a diff hunk, but
   * instead marks a group of consecutive added/deleted lines (see hoveredHunk
   * comment in the `<SideBySide />` component).
   */
  readonly hunkStartLine: number
}

/**
 * IDiffRowDeleted represents a row that displays a deleted line.
 */
interface IDiffRowDeleted<T = IDiffRowData> {
  readonly type: DiffRowType.Deleted

  /**
   * The data object contains information about that deleted line in the diff.
   */
  readonly data: T

  /**
   * The start line of the hunk where this line belongs in the diff.
   *
   * In this context, a hunk is not exactly equivalent to a diff hunk, but
   * instead marks a group of consecutive added/deleted lines (see hoveredHunk
   * comment in the `<SideBySide />` component).
   */
  readonly hunkStartLine: number
}

/**
 * IDiffRowModified represents a row that displays both a deleted line inline
 * with an added line.
 */
interface IDiffRowModified<T = IDiffRowData> {
  readonly type: DiffRowType.Modified

  /**
   * The beforeData object contains information about the deleted line in the diff.
   */
  readonly beforeData: T

  /**
   * The beforeData object contains information about the added line in the diff.
   */
  readonly afterData: T

  /**
   * A multi-line replacement block shown as one measured row in read-only
   * side-by-side diffs. The first entry is also exposed through beforeData.
   */
  readonly beforeBlockData?: ReadonlyArray<T>

  /**
   * A multi-line replacement block shown as one measured row in read-only
   * side-by-side diffs. The first entry is also exposed through afterData.
   */
  readonly afterBlockData?: ReadonlyArray<T>

  /**
   * The start line of the hunk where this line belongs in the diff.
   *
   * In this context, a hunk is not exactly equivalent to a diff hunk, but
   * instead marks a group of consecutive added/deleted lines (see hoveredHunk
   * comment in the `<SideBySide />` component).
   */
  readonly hunkStartLine: number
}

/**
 * IDiffRowContext represents a row that contains non-modified
 * contextual lines around additions/deletions in a diff.
 */
interface IDiffRowContext {
  readonly type: DiffRowType.Context

  /**
   * The actual contents of the contextual line.
   */
  readonly content: string

  /**
   * The line number of this row in the previous state source file.
   */
  readonly beforeLineNumber: number

  /**
   * The line number of this row in the next state source file.
   */
  readonly afterLineNumber: number

  /**
   * Tokens to use to syntax highlight the contents of the before version of the line.
   */
  readonly beforeTokens: ReadonlyArray<ILineTokens>

  /**
   * Tokens to use to syntax highlight the contents of the after version of the line.
   */
  readonly afterTokens: ReadonlyArray<ILineTokens>
}

/**
 * IDiffRowContext represents a row that contains the header
 * of a diff hunk.
 */
interface IDiffRowHunk {
  readonly type: DiffRowType.Hunk
  /**
   * The actual contents of the line.
   */
  readonly content: string

  /** How the hunk can be expanded. */
  readonly expansionType: DiffHunkExpansionType

  /** Index of the hunk in the diff. */
  readonly hunkIndex: number
}

export type DiffRow =
  | IDiffRowAdded
  | IDiffRowDeleted
  | IDiffRowModified
  | IDiffRowContext
  | IDiffRowHunk

export type SimplifiedDiffRow =
  | IDiffRowAdded<SimplifiedDiffRowData>
  | IDiffRowDeleted<SimplifiedDiffRowData>
  | IDiffRowModified<SimplifiedDiffRowData>
  | IDiffRowContext
  | IDiffRowHunk

export type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

/**
 * Whether the row is a type that represent a change (added, deleted, modified)
 * in the diff. This is useful for checking to see if a row type would have
 * something like 'hunkStartLine` on it.
 */
export function isRowChanged(
  row: DiffRow | SimplifiedDiffRow
): row is IDiffRowAdded | IDiffRowDeleted | IDiffRowModified {
  return (
    row.type === DiffRowType.Added ||
    row.type === DiffRowType.Deleted ||
    row.type === DiffRowType.Modified
  )
}

/**
 * Returns an object with two ILineTokens objects that can be used to highlight
 * the added and removed characters between two lines.
 *
 * The `before` object contains the tokens to be used against the `lineBefore` string
 * while the `after` object contains the tokens to use with the `lineAfter` string.
 *
 * This method can be used in conjunction with the `syntaxHighlightLine()` method to
 * get the difference between two lines highlighted:
 *
 * syntaxHighlightLine(
 *   lineBefore,
 *   getDiffTokens(lineBefore, lineAfter).before
 * )
 *
 * @param lineBefore    The first version of the line to compare.
 * @param lineAfter     The second version of the line to compare.
 */
export function getDiffTokens(
  lineBefore: string,
  lineAfter: string,
  options: {
    readonly preferProsePunctuation?: boolean
  } = {}
): { before: ILineTokens; after: ILineTokens } {
  const changeRanges = relativeChangeRanges(lineBefore, lineAfter)
  const joinProsePunctuation =
    options.preferProsePunctuation === true &&
    (isLikelyProseLine(lineBefore) || isLikelyProseLine(lineAfter))

  return {
    before: getDiffTokensForRanges(
      lineBefore,
      changeRanges.map(change => ({
        ...change.stringARange,
        counterpartLength: change.stringBRange.length,
      })),
      'diff-delete-inner',
      joinProsePunctuation
    ),
    after: getDiffTokensForRanges(
      lineAfter,
      changeRanges.map(change => ({
        ...change.stringBRange,
        counterpartLength: change.stringARange.length,
      })),
      'diff-add-inner',
      joinProsePunctuation
    ),
  }
}

interface IDiffTokenRange extends IRange {
  readonly counterpartLength: number
}

function getDiffTokensForRanges(
  line: string,
  ranges: ReadonlyArray<IDiffTokenRange>,
  token: 'diff-add-inner' | 'diff-delete-inner',
  joinProsePunctuation: boolean
): ILineTokens {
  const positiveRanges = ranges
    .filter(range => range.length > 0)
    .sort((a, b) => a.location - b.location)
  const mergedRanges = new Array<{
    location: number
    length: number
    counterpartLength: number
    hasOneSidedToken: boolean
  }>()

  for (const range of positiveRanges) {
    const previous = mergedRanges[mergedRanges.length - 1]

    if (previous !== undefined) {
      const previousEnd = previous.location + previous.length
      const gap = line.slice(previousEnd, range.location)
      const isOrdinaryChangedTokenSeparator =
        gap.length > 0 && /^[\s_-]+$/.test(gap)
      const isProseChangedTokenSeparator =
        joinProsePunctuation && isProseTokenSeparator(gap)
      const isOneSidedSelectorSeparator =
        (previous.hasOneSidedToken || range.counterpartLength === 0) &&
        /^(?:\.|::|\(|\(\))*$/.test(gap)

      if (
        isOrdinaryChangedTokenSeparator ||
        isProseChangedTokenSeparator ||
        isOneSidedSelectorSeparator
      ) {
        previous.length = range.location + range.length - previous.location
        previous.counterpartLength += range.counterpartLength
        previous.hasOneSidedToken ||= range.counterpartLength === 0
        continue
      }
    }

    mergedRanges.push({
      ...range,
      hasOneSidedToken: range.counterpartLength === 0,
    })
  }

  const tokens: ILineTokens = {}
  for (const range of mergedRanges) {
    let location = range.location
    let end = range.location + range.length

    if (range.hasOneSidedToken) {
      if (location >= 2 && line.slice(location - 2, location) === '::') {
        location -= 2
      } else if (location > 0 && line[location - 1] === '.') {
        location--
      }

      while (true) {
        if (line.startsWith('()', end)) {
          end += 2
        } else if (line[end] === '(') {
          end++
        } else {
          break
        }
      }
    }

    tokens[location] = { token, length: end - location }
  }

  return tokens
}

function isLikelyProseLine(line: string): boolean {
  if (/^(?: {4}|\t)/.test(line)) {
    return false
  }

  const trimmed = line.trim()
  if (/^(?:```|~~~)/.test(trimmed)) {
    return false
  }

  const markdownPrefix = /^(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+)/.exec(trimmed)
  const content =
    markdownPrefix === null ? trimmed : trimmed.slice(markdownPrefix[0].length)

  if (
    /^(?:const|let|var|func|function|type|class|interface|package|import|export|if|for|switch|return|def)\b/.test(
      content
    ) ||
    /^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(content) ||
    content.includes(':=')
  ) {
    return false
  }

  const wordCount = content.match(/\p{L}[\p{L}\p{N}'’-]*/gu)?.length ?? 0
  const whitespaceCount = content.match(/\s+/g)?.length ?? 0
  const minimumWordCount = markdownPrefix === null ? 8 : 4

  return wordCount >= minimumWordCount && whitespaceCount >= 3
}

function isProseTokenSeparator(value: string): boolean {
  if (value.length === 0) {
    return false
  }

  const withoutClitics = value.replace(
    /['’](?:d|ll|m|re|s|t|ve)(?=\s|\p{P}|\p{S}|$)/giu,
    ''
  )

  return /^[\s\p{P}\p{S}]+$/u.test(withoutClitics)
}

/**
 * Returns an JSX element with syntax highlighting of the passed line using both
 * the syntaxTokens and diffTokens.
 *
 * @param line          The line to syntax highlight.
 * @param tokensArray   An array of ILineTokens objects that is used for syntax highlighting.
 */
export function syntaxHighlightLine(
  line: string,
  tokensArray: ReadonlyArray<ILineTokens>
): JSX.Element {
  const elements = []
  let currentElement = {
    content: '',
    tokens: new Map<string, number>(),
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const newTokens = new Map<string, number>()

    for (const [token, endPosition] of currentElement.tokens) {
      if (endPosition > i) {
        newTokens.set(token, endPosition)
      }
    }

    for (const tokens of tokensArray) {
      if (tokens[i] !== undefined && tokens[i].length > 0) {
        // ILineTokens can contain multiple tokens separated by spaces.
        // We split them to avoid creating unneeded HTML elements when
        // these tokens do not maintain the same order.
        const tokenNames = tokens[i].token.split(' ')
        const position = i + tokens[i].length

        for (const name of tokenNames) {
          const existingTokenPosition = newTokens.get(name)

          // While it's rare, it's theoretically possible that the same
          // token exists for the same start position with different end
          // positions. If this happens, we choose the longest one.
          if (
            existingTokenPosition === undefined ||
            position > existingTokenPosition
          ) {
            newTokens.set(name, position)
          }
        }
      }
    }

    // If the calculated tokens for the character
    // are the same as the ones for the current element,
    // we can just append the character on that element contents.
    // Otherwise, we need to create a new element with the tokens
    // and "archive" the current element.
    if (mapKeysEqual(currentElement.tokens, newTokens)) {
      currentElement.content += char
      currentElement.tokens = newTokens
    } else {
      elements.push({
        tokens: currentElement.tokens,
        content: currentElement.content,
      })

      currentElement = {
        content: char,
        tokens: newTokens,
      }
    }
  }

  // Add the remaining current element to the list of elements.
  elements.push({
    tokens: currentElement.tokens,
    content: currentElement.content,
  })

  return (
    <>
      {elements.map((element, i) => {
        if (element.tokens.size === 0) {
          // If the element does not contain any token
          // we can skip creating a span.
          return element.content
        }
        return (
          <span
            key={i}
            className={classNames(
              [...element.tokens.keys()].map(name => `cm-${name}`)
            )}
          >
            {element.content}
          </span>
        )
      })}
    </>
  )
}

/** Utility function for checking whether a file supports selection */
export function canSelect(
  file: ChangedFile
): file is WorkingDirectoryFileChange {
  return file instanceof WorkingDirectoryFileChange
}

/** Gets the width expression of a single diff line number gutter based on the number of digits in the number */
export function getLineWidthFromDigitCount(digitAmount: number): string {
  const digits = Math.max(digitAmount, 3)

  // Use `ch` so the gutter tracks the active diff font size/family instead of
  // assuming a fixed pixel width per digit.
  return `${digits}ch + var(--spacing) + 5px`
}

/** Utility function for getting the digit count of the largest line number in an array of diff hunks */
export function getLargestLineNumber(hunks: DiffHunk[]): number {
  if (hunks.length === 0) {
    return 0
  }

  for (let i = hunks.length - 1; i >= 0; i--) {
    const hunk = hunks[i]

    for (let j = hunk.lines.length - 1; j >= 0; j--) {
      const line = hunk.lines[j]

      if (line.type === DiffLineType.Hunk) {
        continue
      }

      const newLineNumber = line.newLineNumber ?? 0
      const oldLineNumber = line.oldLineNumber ?? 0
      return newLineNumber > oldLineNumber ? newLineNumber : oldLineNumber
    }
  }

  return 0
}

export function getNumberOfDigits(val: number): number {
  return (Math.log(val) * Math.LOG10E + 1) | 0
}

/**
 * Used to obtain classes applied to style the row as first or last of a group
 * of added or deleted rows in the side-by-side diff.
 **/
export function getFirstAndLastClassesSideBySide(
  row: SimplifiedDiffRow,
  previousRow: SimplifiedDiffRow | undefined,
  nextRow: SimplifiedDiffRow | undefined,
  addedOrDeleted: DiffRowType.Added | DiffRowType.Deleted
): ReadonlyArray<string> {
  const classes = new Array<string>()
  const typesToCheck = [addedOrDeleted, DiffRowType.Modified]

  // Is the row of the type we are checking? No. Then can't be first or last.
  if (!typesToCheck.includes(row.type)) {
    return []
  }

  // Is the previous row exist or is of the type we are checking?
  // No. Then this row must be the first of this type.
  if (previousRow === undefined || !typesToCheck.includes(previousRow.type)) {
    classes.push('is-first')
  }

  // Is the next row exist or is of the type we are checking?
  // No. Then this row must be last of this type.
  if (nextRow === undefined || !typesToCheck.includes(nextRow.type)) {
    classes.push('is-last')
  }

  return classes
}

/**
 * Compares two text diffs for structural equality.
 *
 * Components needing to know whether a re-render is necessary after receiving
 * a diff is the intended use case.
 */
export function textDiffEquals(
  x: ITextDiff | ILargeTextDiff,
  y: ITextDiff | ILargeTextDiff
) {
  if (x === y) {
    return true
  }

  if (
    x.text === y.text &&
    x.kind === y.kind &&
    x.hasHiddenBidiChars === y.hasHiddenBidiChars &&
    x.lineEndingsChange === y.lineEndingsChange &&
    x.hunks.length === y.hunks.length
  ) {
    // This is a performance optimization which lets us avoid iterating over all
    // lines (deep equality on all hunks). We're already comparing the diff text
    // above so the only thing that can change with the diff text staying the
    // same is whether or not the last line is followed by a trailing newline.
    // That information is encodeded in the noTrailingNewLine property which
    // exists on all lines but is only ever set on lines in the last hunk
    return (
      x.hunks.length === 0 ||
      x.hunks[x.hunks.length - 1].equals(y.hunks[y.hunks.length - 1])
    )
  }

  return false
}
