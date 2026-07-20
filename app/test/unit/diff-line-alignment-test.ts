import assert from 'node:assert'
import { describe, it } from 'node:test'

import { alignDiffLines } from '../../src/ui/diff/diff-line-alignment'

describe('diff line alignment', () => {
  it('keeps reformatted fields paired around inserted fields', () => {
    const before = [
      'type Record struct {',
      '  Alpha string `json:"alpha"`',
      '  Gamma bool   `json:"gamma"`',
      '}',
    ]
    const after = [
      'type Record struct {',
      '  Alpha     string `json:"alpha"`',
      '  Beta      int    `json:"beta"`',
      '  Gamma     bool   `json:"gamma"`',
      '}',
    ]

    assert.deepEqual(alignDiffLines(before, after), [
      { beforeIndex: 0, afterIndex: 0 },
      { beforeIndex: 1, afterIndex: 1 },
      { beforeIndex: null, afterIndex: 2 },
      { beforeIndex: 2, afterIndex: 3 },
      { beforeIndex: 3, afterIndex: 4 },
    ])
  })

  it('pairs a lightly edited line without pairing unrelated neighbors', () => {
    const before = ['const alpha = prepare()', 'return alpha']
    const after = ['function unrelated() {', 'return beta', '}']

    assert.deepEqual(alignDiffLines(before, after), [
      { beforeIndex: 0, afterIndex: null },
      { beforeIndex: null, afterIndex: 0 },
      { beforeIndex: 1, afterIndex: 1 },
      { beforeIndex: null, afterIndex: 2 },
    ])
  })

  it('pairs structured fields when values and trailing comments change', () => {
    const before = [
      '  DisplayMode: record.DisplayMode, // legacy calculation',
      '  LegacyValue: record.Value, // legacy calculation',
      '  ItemCount: record.ItemCount, // legacy calculation',
    ]
    const after = [
      '  DisplayMode: displayMode,',
      '  PrimaryValue: valueParts.PrimaryValue,',
      '  SecondaryValue: valueParts.SecondaryValue,',
      '  FallbackValue: valueParts.FallbackValue,',
      '  TotalItemCount: record.TotalItemCount,',
    ]

    assert.deepEqual(alignDiffLines(before, after), [
      { beforeIndex: 0, afterIndex: 0 },
      { beforeIndex: 1, afterIndex: 1 },
      { beforeIndex: null, afterIndex: 2 },
      { beforeIndex: null, afterIndex: 3 },
      { beforeIndex: 2, afterIndex: 4 },
    ])
  })

  it('pairs related structured keys around inserted schema details', () => {
    assert.deepEqual(
      alignDiffLines(
        ['  compact_value:'],
        ['  compact_display_value:', '    description: displayed value']
      ),
      [
        { beforeIndex: 0, afterIndex: 0 },
        { beforeIndex: null, afterIndex: 1 },
      ]
    )

    assert.deepEqual(
      alignDiffLines(
        ['  item_count:'],
        [
          '  total_item_count:',
          '    type: string',
          '    description: aggregate count',
        ]
      ),
      [
        { beforeIndex: 0, afterIndex: 0 },
        { beforeIndex: null, afterIndex: 1 },
        { beforeIndex: null, afterIndex: 2 },
      ]
    )
  })

  it('pairs typed declarations around newly inserted declarations', () => {
    const before = [
      '  LegacyValue int `json:"legacy_value"`',
      '  CompactValue *int `json:"compact_value,omitempty"`',
    ]
    const after = [
      '  PrimaryValue *int `json:"primary_value,omitempty"`',
      '  SecondaryValue *int `json:"secondary_value,omitempty"`',
      '  CompactExpandedValue *int `json:"compact_expanded_value,omitempty"`',
      '  TotalItemCount int `json:"total_item_count"`',
    ]

    assert.deepEqual(alignDiffLines(before, after), [
      { beforeIndex: 0, afterIndex: 0 },
      { beforeIndex: null, afterIndex: 1 },
      { beforeIndex: 1, afterIndex: 2 },
      { beforeIndex: null, afterIndex: 3 },
    ])
  })

  it('prioritizes declaration names over shared types and descriptions', () => {
    const before = [
      '  LegacyValue int `json:"legacy_value" description:"legacy value"`',
      '  SecondaryLegacyValue int `json:"secondary_legacy_value" description:"legacy secondary value"`',
      '  ItemCount int `json:"item_count" description:"legacy item count"`',
    ]
    const after = [
      '  PrimaryValue *int `json:"primary_value,omitempty" description:"primary value"`',
      '  SecondaryCurrentValue *int `json:"secondary_current_value,omitempty" description:"current secondary value"`',
      '  FallbackValue *int `json:"fallback_value,omitempty" description:"fallback value"`',
      '  TotalItemCount int `json:"total_item_count" description:"aggregate count"`',
    ]

    assert.deepEqual(alignDiffLines(before, after), [
      { beforeIndex: 0, afterIndex: 0 },
      { beforeIndex: 1, afterIndex: 1 },
      { beforeIndex: null, afterIndex: 2 },
      { beforeIndex: 2, afterIndex: 3 },
    ])
  })

  it('pairs SQL declarations by column name before shared constraints', () => {
    const before = [
      '  id UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),',
      '  record_group_id UUID NOT NULL,',
      '  record_id UUID NOT NULL REFERENCES record(id),',
      '  request_id UUID NOT NULL,',
    ]
    const after = [
      '  record_id UUID PRIMARY KEY NOT NULL REFERENCES record(id),',
      '  request_id UUID NOT NULL,',
    ]

    assert.deepEqual(alignDiffLines(before, after), [
      { beforeIndex: 0, afterIndex: null },
      { beforeIndex: 1, afterIndex: null },
      { beforeIndex: 2, afterIndex: 0 },
      { beforeIndex: 3, afterIndex: 1 },
    ])
  })

  it('does not pair unrelated SQL columns by shared types or name fragments', () => {
    const alignment = alignDiffLines(
      ['  "legacy_metric" NUMERIC(24, 8) NOT NULL DEFAULT 0,'],
      ['  "retry_after" TIMESTAMPTZ,']
    )

    assert.ok(
      alignment.every(
        pair => pair.beforeIndex === null || pair.afterIndex === null
      )
    )
  })

  it('pairs the earliest equally related quoted list item', () => {
    assert.deepEqual(
      alignDiffLines(
        ['- `legacy_value`', '- `alternate_value`'],
        ['- `total_value_count`']
      ),
      [
        { beforeIndex: 0, afterIndex: 0 },
        { beforeIndex: 1, afterIndex: null },
      ]
    )
  })

  it('pairs changed Markdown bullets with the same stable subject', () => {
    assert.deepEqual(
      alignDiffLines(
        ['- Format **1.25** or newer is recommended.'],
        ['- Format **1.26.4** is required by the project.']
      ),
      [{ beforeIndex: 0, afterIndex: 0 }]
    )
  })

  it('pairs comments that document the same structural subject', () => {
    assert.deepEqual(
      alignDiffLines(
        ['// RecordStatusInvalid - Record is invalid due to missing fields.'],
        [
          '// RecordStatusInvalid - Validation failed and awaits corrected input.',
        ]
      ),
      [{ beforeIndex: 0, afterIndex: 0 }]
    )
  })

  it('keeps alignment work bounded for large changed blocks', () => {
    const before = Array.from({ length: 201 }, (_, i) => `before-${i}`)
    const after = Array.from({ length: 200 }, (_, i) => `after-${i}`)
    const alignment = alignDiffLines(before, after)

    assert.equal(alignment.length, 201)
    assert.deepEqual(alignment[0], { beforeIndex: 0, afterIndex: 0 })
    assert.deepEqual(alignment[200], {
      beforeIndex: 200,
      afterIndex: null,
    })
  })
})
