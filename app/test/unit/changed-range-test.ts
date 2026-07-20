import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  relativeChangeRanges,
  relativeChanges,
  relativeTokenChangeRanges,
} from '../../src/ui/diff/changed-range'
import { getDiffTokens } from '../../src/ui/diff/diff-helpers'

describe('changed ranges', () => {
  it('preserves the original enclosing change range', () => {
    assert.deepEqual(
      relativeChanges('prefix-old-suffix', 'prefix-new-suffix'),
      {
        stringARange: { location: 7, length: 3 },
        stringBRange: { location: 7, length: 3 },
      }
    )
  })

  it('returns separate ranges for changed identifier subwords', () => {
    assert.deepEqual(relativeChangeRanges('abcXdefYghi', 'abcPdefQghi'), [
      {
        stringARange: { location: 3, length: 4 },
        stringBRange: { location: 3, length: 4 },
      },
      {
        stringARange: { location: 7, length: 4 },
        stringBRange: { location: 7, length: 4 },
      },
    ])
  })

  it('emits multiple semantic intraline highlight tokens', () => {
    assert.deepEqual(getDiffTokens('abcXdefYghi', 'abcPdefQghi'), {
      before: {
        3: { token: 'diff-delete-inner', length: 4 },
        7: { token: 'diff-delete-inner', length: 4 },
      },
      after: {
        3: { token: 'diff-add-inner', length: 4 },
        7: { token: 'diff-add-inner', length: 4 },
      },
    })
  })

  it('uses CamelCase subwords for long identifier changes', () => {
    const before = 'case TestLegacyWidgetShape_UsesOriginalInput'
    const after = 'case TestCurrentWidgetLayout_UsesUpdatedInput'

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf('Legacy')]: {
          token: 'diff-delete-inner',
          length: 'Legacy'.length,
        },
        [before.indexOf('Shape')]: {
          token: 'diff-delete-inner',
          length: 'Shape'.length,
        },
        [before.indexOf('Original')]: {
          token: 'diff-delete-inner',
          length: 'Original'.length,
        },
      },
      after: {
        [after.indexOf('Current')]: {
          token: 'diff-add-inner',
          length: 'Current'.length,
        },
        [after.indexOf('Layout')]: {
          token: 'diff-add-inner',
          length: 'Layout'.length,
        },
        [after.indexOf('Updated')]: {
          token: 'diff-add-inner',
          length: 'Updated'.length,
        },
      },
    })
  })

  it('preserves a shared quoted value across rewritten expressions', () => {
    const before = 'Payload: decode(`{"legacy":{"value":"2.5"}}`),'
    const after = 'Payload: build("2.5", "4", "0"),'

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf('decode')]: {
          token: 'diff-delete-inner',
          length: 'decode'.length,
        },
        [before.indexOf('"legacy"')]: {
          token: 'diff-delete-inner',
          length: '"legacy"'.length,
        },
        [before.indexOf('"value"')]: {
          token: 'diff-delete-inner',
          length: '"value"'.length,
        },
      },
      after: {
        [after.indexOf('build')]: {
          token: 'diff-add-inner',
          length: 'build'.length,
        },
        [after.indexOf('"4"')]: {
          token: 'diff-add-inner',
          length: '"4"'.length,
        },
        [after.indexOf('"0"')]: {
          token: 'diff-add-inner',
          length: '"0"'.length,
        },
      },
    })
  })

  it('highlights changed JSON keys and values as whole tokens', () => {
    const before = 'check(`{"legacy_mode":"draft","old_value":"1.00"}`)'
    const after = 'check(`{"current_mode":"active","total_value":"1"}`)'
    const { before: beforeTokens, after: afterTokens } = getDiffTokens(
      before,
      after
    )
    const expectedBefore = ['"legacy_mode"', '"draft"', '"old_value"', '"1.00"']
    const expectedAfter = ['"current_mode"', '"active"', '"total_value"', '"1"']

    assert.equal(Object.keys(beforeTokens).length, expectedBefore.length)
    assert.equal(Object.keys(afterTokens).length, expectedAfter.length)

    for (const value of expectedBefore) {
      assert.deepEqual(beforeTokens[before.indexOf(value)], {
        token: 'diff-delete-inner',
        length: value.length,
      })
    }

    for (const value of expectedAfter) {
      assert.deepEqual(afterTokens[after.indexOf(value)], {
        token: 'diff-add-inner',
        length: value.length,
      })
    }
  })

  it('separates distant edits inside a long quoted value', () => {
    const sharedPassage = Array.from(
      { length: 80 },
      (_, index) => `shared passage ${index}`
    ).join(' ')
    const firstBefore = 'Send updates on a fixed interval.'
    const firstAfter = 'Send updates when meaningful progress occurs.'
    const firstBeforeChange = 'on a fixed interval'
    const firstAfterChange = 'when meaningful progress occurs'
    const secondBefore = 'Avoid waits longer than one minute.'
    const secondAfter = 'Use interruptible waits with an appropriate timeout.'
    const secondBeforeChange = 'Avoid waits longer than one minute'
    const secondAfterChange =
      'Use interruptible waits with an appropriate timeout'
    const before = `  "message": "Introduction.\\n\\n${firstBefore}\\n\\n${sharedPassage}\\n\\n${secondBefore}\\n\\nConclusion."`
    const after = `  "message": "Introduction.\\n\\n${firstAfter}\\n\\n${sharedPassage}\\n\\n${secondAfter}\\n\\nConclusion."`

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf(firstBeforeChange)]: {
          token: 'diff-delete-inner',
          length: firstBeforeChange.length,
        },
        [before.indexOf(secondBeforeChange)]: {
          token: 'diff-delete-inner',
          length: secondBeforeChange.length,
        },
      },
      after: {
        [after.indexOf(firstAfterChange)]: {
          token: 'diff-add-inner',
          length: firstAfterChange.length,
        },
        [after.indexOf(secondAfterChange)]: {
          token: 'diff-add-inner',
          length: secondAfterChange.length,
        },
      },
    })
  })

  it('keeps long quoted comparison work bounded', () => {
    const before = `"${Array.from(
      { length: 300 },
      (_, index) => `source${index}`
    ).join(' ')}"`
    const after = `"${Array.from(
      { length: 300 },
      (_, index) => `destination${index}`
    ).join(' ')}"`

    assert.deepEqual(relativeChangeRanges(before, after), [
      relativeChanges(before, after),
    ])
  })

  it('does not match assignment names against replacement values', () => {
    const before = '  recordSubmissionStatePreCheck = "pre_check_claim"'
    const after =
      '  recordSubmissionStatePreCheck = sharedkind.RecordSubmissionStatePreCheckClaim'
    const beforeValue = '"pre_check_claim"'
    const afterValue = 'sharedkind.RecordSubmissionStatePreCheckClaim'

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf(beforeValue)]: {
          token: 'diff-delete-inner',
          length: beforeValue.length,
        },
      },
      after: {
        [after.indexOf(afterValue)]: {
          token: 'diff-add-inner',
          length: afterValue.length,
        },
      },
    })
  })

  it('refines repeated identifier replacements without letter fragments', () => {
    const before = '  LegacyField: input.LegacyField,'
    const after = '  CurrentField: input.CurrentField,'
    const beforeFirst = before.indexOf('Legacy')
    const beforeSecond = before.lastIndexOf('Legacy')
    const afterFirst = after.indexOf('Current')
    const afterSecond = after.lastIndexOf('Current')

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [beforeFirst]: {
          token: 'diff-delete-inner',
          length: 'Legacy'.length,
        },
        [beforeSecond]: {
          token: 'diff-delete-inner',
          length: 'Legacy'.length,
        },
      },
      after: {
        [afterFirst]: {
          token: 'diff-add-inner',
          length: 'Current'.length,
        },
        [afterSecond]: {
          token: 'diff-add-inner',
          length: 'Current'.length,
        },
      },
    })
  })

  it('joins whitespace between consecutive changed words', () => {
    const before = 'Please review this draft promptly.'
    const after = 'Please review this updated document promptly.'
    const replacement = 'updated document'

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf('draft')]: {
          token: 'diff-delete-inner',
          length: 'draft'.length,
        },
      },
      after: {
        [after.indexOf(replacement)]: {
          token: 'diff-add-inner',
          length: replacement.length,
        },
      },
    })
  })

  it('joins underscores and hyphens between consecutive changed words', () => {
    for (const separator of ['_', '-']) {
      const before = `prefix legacy${separator}item_value suffix`
      const after = `prefix current${separator}record_value suffix`
      const beforeReplacement = `legacy${separator}item`
      const afterReplacement = `current${separator}record`

      assert.deepEqual(getDiffTokens(before, after), {
        before: {
          [before.indexOf(beforeReplacement)]: {
            token: 'diff-delete-inner',
            length: beforeReplacement.length,
          },
        },
        after: {
          [after.indexOf(afterReplacement)]: {
            token: 'diff-add-inner',
            length: afterReplacement.length,
          },
        },
      })
    }
  })

  it('joins punctuation between changed tokens in prose', () => {
    const numericBefore =
      '- Retry pending work after 3 minutes when evidence remains unavailable.'
    const numericAfter =
      '- Retry pending work after 1/2/4/8 minutes when evidence remains unavailable.'
    const phraseBefore =
      '- The mode uses legacy flow while the background worker remains active.'
    const phraseAfter =
      "- The mode uses account's (OPERATING); route while the background worker remains active."
    const numericChange = '1/2/4/8'
    const phraseChange = "account's (OPERATING); route"

    assert.deepEqual(
      getDiffTokens(numericBefore, numericAfter, {
        preferProsePunctuation: true,
      }).after,
      {
        [numericAfter.indexOf(numericChange)]: {
          token: 'diff-add-inner',
          length: numericChange.length,
        },
      }
    )
    assert.deepEqual(
      getDiffTokens(phraseBefore, phraseAfter, {
        preferProsePunctuation: true,
      }).after,
      {
        [phraseAfter.indexOf(phraseChange)]: {
          token: 'diff-add-inner',
          length: phraseChange.length,
        },
      }
    )
  })

  it('keeps punctuation gaps separate under the code policy', () => {
    const before = 'retryPendingWorkAfter(3, evidenceUnavailable)'
    const after = 'retryPendingWorkAfter(1/2/4/8, evidenceUnavailable)'
    const numericChange = '1/2/4/8'
    const { after: afterTokens } = getDiffTokens(before, after, {
      preferProsePunctuation: true,
    })

    assert.equal(afterTokens[after.indexOf(numericChange)]?.length, 1)
    assert.equal(Object.keys(afterTokens).length, 4)
  })

  it('includes selector and empty-call punctuation in removed expressions', () => {
    const before =
      'createRecord(context, idFactory.create(), recordID, "example-record")'
    const after = 'createRecord(context, recordID, "example-record")'
    const removedExpression = 'idFactory.create()'

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf(removedExpression)]: {
          token: 'diff-delete-inner',
          length: removedExpression.length,
        },
      },
      after: {},
    })
  })

  it('includes double-colon separators in removed qualified paths', () => {
    const before =
      'let result = runtime::worker::block_in_place(|| receiver.receive());'
    const after = 'let result = receiver.receive();'
    const { before: beforeTokens } = getDiffTokens(before, after)
    const separatorLocations = [
      before.indexOf('::'),
      before.indexOf('::', before.indexOf('::') + 2),
    ]

    for (const location of separatorLocations) {
      assert.ok(
        Object.entries(beforeTokens).some(
          ([start, token]) =>
            Number(start) <= location &&
            location + 2 <= Number(start) + token.length
        )
      )
    }
  })

  it('includes a leading double colon with a removed path suffix', () => {
    const before = 'let runtime = executor::blocking;'
    const after = 'let runtime = executor;'
    const { before: beforeTokens } = getDiffTokens(before, after)
    const removedSuffix = '::blocking'

    assert.deepEqual(beforeTokens[before.indexOf(removedSuffix)], {
      token: 'diff-delete-inner',
      length: removedSuffix.length,
    })
  })

  it('includes selector and empty-call punctuation in inserted expressions', () => {
    const before = 'values = ["DEFAULT"]'
    const after = 'values = [catalog.sharedValues()]'
    const insertedExpression = 'catalog.sharedValues()'

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf('"DEFAULT"')]: {
          token: 'diff-delete-inner',
          length: '"DEFAULT"'.length,
        },
      },
      after: {
        [after.indexOf(insertedExpression)]: {
          token: 'diff-add-inner',
          length: insertedExpression.length,
        },
      },
    })
  })

  it('preserves shared call punctuation for renamed functions', () => {
    const before = 'result := legacyCall()'
    const after = 'result := currentCall()'

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf('legacy')]: {
          token: 'diff-delete-inner',
          length: 'legacy'.length,
        },
      },
      after: {
        [after.indexOf('current')]: {
          token: 'diff-add-inner',
          length: 'current'.length,
        },
      },
    })
  })

  it('includes opening parentheses around preserved nested expressions', () => {
    const before = 'allowed = values[normalize(text.trim(record.code))]'
    const after = 'allowed = values[record.code]'
    const removedWrapper = 'normalize(text.trim('
    const removedClosers = '))'

    assert.deepEqual(getDiffTokens(before, after), {
      before: {
        [before.indexOf(removedWrapper)]: {
          token: 'diff-delete-inner',
          length: removedWrapper.length,
        },
        [before.indexOf(removedClosers)]: {
          token: 'diff-delete-inner',
          length: removedClosers.length,
        },
      },
      after: {},
    })
  })

  it('does not match inline comment words against code identifiers', () => {
    const before =
      '  LegacyValue: record.Value, // Value is temporarily calculated'
    const after = '  CurrentValue: values.CurrentValue,'
    const { before: beforeTokens } = getDiffTokens(before, after)
    const changedComment = 'Value is temporarily calculated'
    const commentValueLocation = before.indexOf(changedComment)

    assert.deepEqual(beforeTokens[commentValueLocation], {
      token: 'diff-delete-inner',
      length: changedComment.length,
    })
  })

  it('highlights inserted alignment and tag content independently', () => {
    const before = '  Alpha string `json:"alpha"`'
    const after = '  Alpha     string `json:"alpha,omitempty"`'
    const { before: beforeTokens, after: afterTokens } = getDiffTokens(
      before,
      after
    )

    assert.deepEqual(beforeTokens, {})
    assert.deepEqual(afterTokens, {
      8: { token: 'diff-add-inner', length: 4 },
      31: { token: 'diff-add-inner', length: 10 },
    })
  })

  it('uses whole tokens for multiline replacement changes', () => {
    assert.deepEqual(
      relativeTokenChangeRanges(
        'prefix alpha beta suffix',
        'prefix gamma delta suffix'
      ),
      [
        {
          stringARange: { location: 7, length: 10 },
          stringBRange: { location: 7, length: 11 },
        },
      ]
    )
  })

  it('ignores line wrapping changes between shared tokens', () => {
    assert.deepEqual(
      relativeTokenChangeRanges(
        'shared phrase wraps\nacross lines',
        'shared phrase wraps across\nlines'
      ),
      []
    )
  })

  it('keeps token comparison work bounded', () => {
    const before = Array.from(
      { length: 501 },
      (_, index) => `source-${index}`
    ).join(' ')
    const after = Array.from(
      { length: 501 },
      (_, index) => `destination-${index}`
    ).join(' ')

    assert.equal(relativeTokenChangeRanges(before, after), undefined)
  })
})
