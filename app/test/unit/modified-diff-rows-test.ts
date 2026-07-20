import assert from 'node:assert'
import { describe, it } from 'node:test'

import { DiffLine, DiffLineType } from '../../src/models/diff'
import {
  DiffRowType,
  SimplifiedDiffRowData,
} from '../../src/ui/diff/diff-helpers'
import {
  getModifiedRows,
  IModifiedDiffLine,
} from '../../src/ui/diff/modified-diff-rows'

function createModifiedLines(
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>
): ReadonlyArray<IModifiedDiffLine> {
  const lines = new Array<IModifiedDiffLine>()

  for (const [index, content] of before.entries()) {
    lines.push({
      line: new DiffLine(
        `-${content}`,
        DiffLineType.Delete,
        index,
        index + 1,
        null
      ),
      diffLineNumber: index,
    })
  }

  for (const [index, content] of after.entries()) {
    lines.push({
      line: new DiffLine(
        `+${content}`,
        DiffLineType.Add,
        before.length + index,
        null,
        index + 1
      ),
      diffLineNumber: before.length + index,
    })
  }

  return lines
}

function hasHighlightAt(
  tokens: SimplifiedDiffRowData['tokens'],
  location: number
): boolean {
  return tokens.some(lineTokens =>
    Object.entries(lineTokens).some(
      ([start, token]) =>
        Number(start) <= location && location < Number(start) + token.length
    )
  )
}

describe('modified diff rows', () => {
  it('uses standard positional split rows when enhanced highlighting is off', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        ['alpha source', 'beta source'],
        ['inserted destination', 'alpha destination', 'beta destination']
      ),
      true,
      false,
      false,
      false,
      false,
      true,
      false
    )

    assert.equal(rows[0].type, DiffRowType.Modified)
    if (rows[0].type !== DiffRowType.Modified) {
      throw new Error('Expected the first positional standard row')
    }

    assert.equal(rows[0].beforeData.content, 'alpha source')
    assert.equal(rows[0].afterData.content, 'inserted destination')
    assert.equal(rows[1].type, DiffRowType.Modified)
    assert.equal(rows[2].type, DiffRowType.Added)
  })

  it('keeps unequal unified blocks unaccented when enhanced highlighting is off', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        ['first source', 'second source'],
        ['single destination']
      ),
      false,
      false,
      false,
      false,
      false,
      true,
      false
    )

    for (const row of rows) {
      if (row.type === DiffRowType.Added || row.type === DiffRowType.Deleted) {
        assert.deepEqual(row.data.tokens, [])
      }
    }
  })

  it('preserves standard equal-count intraline highlighting when enhanced highlighting is off', () => {
    const rows = getModifiedRows(
      createModifiedLines(['const mode = legacy'], ['const mode = current']),
      false,
      false,
      false,
      false,
      false,
      true,
      false
    )

    assert.equal(rows.length, 2)
    assert.ok(
      rows.every(
        row =>
          (row.type === DiffRowType.Added ||
            row.type === DiffRowType.Deleted) &&
          row.data.tokens.length > 0
      )
    )
  })

  it('aligns inserted fields and retains precise inner changes', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          'type Record struct {',
          '  Alpha string `json:"alpha"`',
          '  Stable bool  `json:"stable"`',
          '  Gamma bool   `json:"gamma"`',
          '}',
        ],
        [
          'type Record struct {',
          '  Alpha     string `json:"alpha,omitempty"`',
          '  Stable    bool   `json:"stable"`',
          '  Beta      int    `json:"beta"`',
          '  Gamma     bool   `json:"gamma"`',
          '}',
        ]
      ),
      true
    )

    assert.deepEqual(
      rows.map(row => {
        switch (row.type) {
          case DiffRowType.Modified:
            return [row.type, row.beforeData.content, row.afterData.content]
          case DiffRowType.Added:
          case DiffRowType.Deleted:
            return [row.type, row.data.content]
          default:
            return [row.type]
        }
      }),
      [
        [DiffRowType.Modified, 'type Record struct {', 'type Record struct {'],
        [
          DiffRowType.Modified,
          '  Alpha string `json:"alpha"`',
          '  Alpha     string `json:"alpha,omitempty"`',
        ],
        [
          DiffRowType.Modified,
          '  Stable bool  `json:"stable"`',
          '  Stable    bool   `json:"stable"`',
        ],
        [DiffRowType.Added, '  Beta      int    `json:"beta"`'],
        [
          DiffRowType.Modified,
          '  Gamma bool   `json:"gamma"`',
          '  Gamma     bool   `json:"gamma"`',
        ],
        [DiffRowType.Modified, '}', '}'],
      ]
    )

    const alphaRow = rows[1]
    assert.equal(alphaRow.type, DiffRowType.Modified)

    if (alphaRow.type !== DiffRowType.Modified) {
      throw new Error('Expected the Alpha fields to stay paired')
    }

    assert.deepEqual(alphaRow.beforeData.tokens, [])
    assert.deepEqual(alphaRow.afterData.tokens, [
      {
        8: { token: 'diff-add-inner', length: 4 },
        31: { token: 'diff-add-inner', length: 10 },
      },
    ])

    const insertedRow = rows[3]
    assert.equal(insertedRow.type, DiffRowType.Added)

    if (insertedRow.type !== DiffRowType.Added) {
      throw new Error('Expected the Beta field to remain one-sided')
    }

    assert.deepEqual(insertedRow.data.tokens, [
      {
        0: {
          token: 'diff-add-inner',
          length: '  Beta      int    `json:"beta"`'.length,
        },
      },
    ])
  })

  it('keeps structured replacement counterparts adjacent in selectable rows', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          '  DisplayMode: record.DisplayMode, // legacy calculation',
          '  LegacyValue: record.Value, // legacy calculation',
          '  ItemCount: record.ItemCount, // legacy calculation',
        ],
        [
          '  DisplayMode: displayMode,',
          '  PrimaryValue: valueParts.PrimaryValue,',
          '  SecondaryValue: valueParts.SecondaryValue,',
          '  FallbackValue: valueParts.FallbackValue,',
          '  TotalItemCount: record.TotalItemCount,',
        ]
      ),
      true
    )

    assert.deepEqual(
      rows.map(row => {
        if (row.type === DiffRowType.Modified) {
          return [row.beforeData.content, row.afterData.content]
        }

        if (row.type === DiffRowType.Added) {
          return [null, row.data.content]
        }

        if (row.type === DiffRowType.Deleted) {
          return [row.data.content, null]
        }

        throw new Error('Expected only changed rows')
      }),
      [
        [
          '  DisplayMode: record.DisplayMode, // legacy calculation',
          '  DisplayMode: displayMode,',
        ],
        [
          '  LegacyValue: record.Value, // legacy calculation',
          '  PrimaryValue: valueParts.PrimaryValue,',
        ],
        [null, '  SecondaryValue: valueParts.SecondaryValue,'],
        [null, '  FallbackValue: valueParts.FallbackValue,'],
        [
          '  ItemCount: record.ItemCount, // legacy calculation',
          '  TotalItemCount: record.TotalItemCount,',
        ],
      ]
    )
  })

  it('keeps structural counterparts adjacent inside grouped replacement blocks', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          '  LegacyValue int `json:"legacy_value"`',
          '  AlternateValue int `json:"alternate_value"`',
          '  ItemValueCount int `json:"item_value_count"`',
          '  RecordState string `json:"record_state"`',
        ],
        [
          '  // TotalItemValueCount is the sum of visible item values.',
          '  // Base values and overrides remain separate.',
          '  // Component values are immutable.',
          '  // Duplicate mutable state is avoided.',
          '  TotalItemValueCount int `json:"total_item_value_count"`',
          '  RecordState string `json:"record_state"`',
        ]
      ),
      true,
      true,
      true
    )

    const countRow = rows.find(
      row =>
        row.type === DiffRowType.Modified &&
        row.beforeData.content.startsWith('  ItemValueCount ') &&
        row.afterData.content.startsWith('  TotalItemValueCount ')
    )

    assert.equal(countRow?.type, DiffRowType.Modified)

    if (countRow?.type !== DiffRowType.Modified) {
      throw new Error('Expected the related count declarations to stay paired')
    }

    assert.equal(countRow.beforeBlockData, undefined)
    assert.equal(countRow.afterBlockData, undefined)
  })

  it('keeps infix-expanded declarations adjacent in uneven replacement blocks', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          '  LegacyValue int `json:"legacy_value"`',
          '  CompactValue *int `json:"compact_value,omitempty"`',
          '  ValueFormat string `json:"value_format,omitempty"`',
        ],
        [
          '  PrimaryValue *int `json:"primary_value,omitempty"`',
          '  SecondaryValue *int `json:"secondary_value,omitempty"`',
          '  CompactExpandedValue *int `json:"compact_expanded_value,omitempty"`',
          '  TotalItemCount int `json:"total_item_count"`',
          '  ValueFormat string `json:"value_format,omitempty"`',
        ]
      ),
      true,
      true,
      true
    )

    const expandedValueRow = rows.find(
      row =>
        row.type === DiffRowType.Modified &&
        row.beforeData.content.startsWith('  CompactValue ') &&
        row.afterData.content.startsWith('  CompactExpandedValue ')
    )

    assert.equal(expandedValueRow?.type, DiffRowType.Modified)

    if (expandedValueRow?.type !== DiffRowType.Modified) {
      throw new Error('Expected the expanded value declarations to stay paired')
    }

    assert.equal(expandedValueRow.beforeBlockData, undefined)
    assert.equal(expandedValueRow.afterBlockData, undefined)
  })

  it('keeps changed comments beside the declaration they document', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          '// RecordStatusInvalid - Record is invalid due to missing fields.',
          'RecordStatusInvalid RecordStatus = "INVALID"',
        ],
        [
          '// RecordStatusInvalid - Validation failed and awaits corrected input.',
          'RecordStatusInvalid RecordStatus = "INVALID"',
        ]
      ),
      true,
      true,
      true
    )

    assert.equal(rows[0].type, DiffRowType.Modified)

    if (rows[0].type !== DiffRowType.Modified) {
      throw new Error('Expected the related status comments to stay paired')
    }

    assert.ok(rows[0].beforeData.content.startsWith('// RecordStatusInvalid'))
    assert.ok(rows[0].afterData.content.startsWith('// RecordStatusInvalid'))
  })

  it('keeps changed Markdown bullets with the same subject adjacent', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        ['- Format **1.25** or newer is recommended.'],
        ['- Format **1.26.4** is required by the project.']
      ),
      true,
      true,
      true
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, DiffRowType.Modified)
  })

  it('joins punctuation within changed Markdown prose', () => {
    const before =
      '- Retry pending work after 3 minutes when evidence remains unavailable.'
    const after =
      '- Retry pending work after 1/2/4/8 minutes when evidence remains unavailable.'
    const numericChange = '1/2/4/8'
    const rows = getModifiedRows(
      createModifiedLines([before], [after]),
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      true
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, DiffRowType.Modified)

    if (rows[0].type !== DiffRowType.Modified) {
      throw new Error(
        'Expected the Markdown prose lines to remain counterparts'
      )
    }

    assert.deepEqual(rows[0].afterData.tokens, [
      {
        [after.indexOf(numericChange)]: {
          token: 'diff-add-inner',
          length: numericChange.length,
        },
      },
    ])
  })

  it('preserves JSX structure while highlighting changed props', () => {
    const before = '  <Button variant="primary" onClick={save}>Save</Button>'
    const after =
      '  <Button variant="primary compact" onClick={handleSave}>Save</Button>'
    const rows = getModifiedRows(createModifiedLines([before], [after]), true)

    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, DiffRowType.Modified)

    if (rows[0].type !== DiffRowType.Modified) {
      throw new Error('Expected the JSX elements to remain counterparts')
    }

    assert.equal(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('<Button')),
      false
    )
    assert.ok(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('compact'))
    )
    assert.ok(hasHighlightAt(rows[0].afterData.tokens, after.indexOf('handle')))
    assert.equal(
      hasHighlightAt(
        rows[0].afterData.tokens,
        after.lastIndexOf('Save</Button>')
      ),
      false
    )
  })

  it('preserves Vue component structure while highlighting changed bindings', () => {
    const before =
      '  <BaseButton :disabled="isSaving" @click="saveItem">Save</BaseButton>'
    const after =
      '  <BaseButton :disabled="isSaving || isLocked" :title="buttonTitle" @click="saveRecord">Save</BaseButton>'
    const rows = getModifiedRows(createModifiedLines([before], [after]), true)

    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, DiffRowType.Modified)

    if (rows[0].type !== DiffRowType.Modified) {
      throw new Error('Expected the Vue components to remain counterparts')
    }

    assert.equal(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('<BaseButton')),
      false
    )
    assert.ok(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('isLocked'))
    )
    assert.ok(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('buttonTitle'))
    )
    assert.ok(hasHighlightAt(rows[0].afterData.tokens, after.indexOf('Record')))
    assert.equal(
      hasHighlightAt(
        rows[0].afterData.tokens,
        after.lastIndexOf('Save</BaseButton>')
      ),
      false
    )
  })

  it('aligns Vue directives while preserving repeated interpolation text', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          '    <p',
          '      class="flex items-center gap-1 text-sm"',
          '      v-for="(item, index) in items"',
          '      :key="index"',
          '    >',
          '      <IconCheck /> {{ item.name }}',
          '    </p>',
        ],
        [
          '    <p',
          '      class="flex items-center gap-1 text-sm"',
          '      v-for="item in selectedItems"',
          '      :key="item.id"',
          '    >',
          '      <IconCheck /> {{ item.name }}',
          '    </p>',
        ]
      ),
      true
    )

    assert.equal(rows.length, 7)
    assert.ok(rows.every(row => row.type === DiffRowType.Modified))

    const loopRow = rows[2]
    const keyRow = rows[3]
    const interpolationRow = rows[5]

    if (
      loopRow.type !== DiffRowType.Modified ||
      keyRow.type !== DiffRowType.Modified ||
      interpolationRow.type !== DiffRowType.Modified
    ) {
      throw new Error('Expected Vue template lines to stay aligned')
    }

    assert.equal(loopRow.beforeData.content.includes('v-for='), true)
    assert.equal(loopRow.afterData.content.includes('v-for='), true)
    assert.equal(keyRow.beforeData.content.includes(':key='), true)
    assert.equal(keyRow.afterData.content.includes(':key='), true)
    assert.deepEqual(interpolationRow.beforeData.tokens, [])
    assert.deepEqual(interpolationRow.afterData.tokens, [])
  })

  it('preserves Vue script setup structure in computed expressions', () => {
    const before =
      'const visibleItems = computed(() => items.value.filter((item) => item.active))'
    const after =
      'const visibleItems = computed(() => selectedItems.value.filter((item) => item.isActive))'
    const rows = getModifiedRows(createModifiedLines([before], [after]), true)

    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, DiffRowType.Modified)

    if (rows[0].type !== DiffRowType.Modified) {
      throw new Error(
        'Expected the computed expressions to remain counterparts'
      )
    }

    assert.equal(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('visibleItems')),
      false
    )
    assert.equal(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('computed')),
      false
    )
    assert.equal(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('.filter')),
      false
    )
    assert.ok(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('selected'))
    )
    assert.ok(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('isActive'))
    )
  })

  it('shows reordered Vue utility classes as source changes', () => {
    const before =
      '  <span class="text-sm font-bold text-secondary">Label</span>'
    const after =
      '  <span class="text-secondary text-sm font-bold">Label</span>'
    const rows = getModifiedRows(createModifiedLines([before], [after]), true)

    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, DiffRowType.Modified)

    if (rows[0].type !== DiffRowType.Modified) {
      throw new Error('Expected the Vue elements to remain counterparts')
    }

    assert.ok(rows[0].beforeData.tokens.length > 0)
    assert.ok(rows[0].afterData.tokens.length > 0)
    assert.equal(
      hasHighlightAt(rows[0].beforeData.tokens, before.indexOf('<span')),
      false
    )
    assert.equal(
      hasHighlightAt(rows[0].afterData.tokens, after.indexOf('Label')),
      false
    )
  })

  it('aligns related SCSS properties around an inserted property', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        ['  color: var(--text-muted);', '  padding: var(--space-small);'],
        [
          '  color: var(--text-secondary);',
          '  gap: var(--space-small);',
          '  padding: var(--space-medium);',
        ]
      ),
      true
    )

    assert.equal(rows.length, 3)
    assert.equal(rows[0].type, DiffRowType.Modified)
    assert.equal(rows[1].type, DiffRowType.Added)
    assert.equal(rows[2].type, DiffRowType.Modified)

    if (
      rows[0].type !== DiffRowType.Modified ||
      rows[1].type !== DiffRowType.Added ||
      rows[2].type !== DiffRowType.Modified
    ) {
      throw new Error('Expected the SCSS properties to align by field name')
    }

    assert.equal(rows[0].beforeData.content.startsWith('  color:'), true)
    assert.equal(rows[0].afterData.content.startsWith('  color:'), true)
    assert.equal(rows[1].data.content.startsWith('  gap:'), true)
    assert.equal(rows[2].beforeData.content.startsWith('  padding:'), true)
    assert.equal(rows[2].afterData.content.startsWith('  padding:'), true)
  })

  it('top-aligns unmatched replacement blocks in selectable split mode', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          'legacy source statement one',
          'legacy source statement two',
          'legacy source statement three',
          'legacy source statement four',
        ],
        ['replacement destination alpha', 'replacement destination beta']
      ),
      true
    )

    assert.deepEqual(
      rows.map(row => {
        if (row.type === DiffRowType.Modified) {
          return [row.beforeData.content, row.afterData.content]
        }

        if (row.type === DiffRowType.Deleted) {
          return [row.data.content, null]
        }

        if (row.type === DiffRowType.Added) {
          return [null, row.data.content]
        }

        throw new Error('Expected only changed rows')
      }),
      [
        ['legacy source statement one', 'replacement destination alpha'],
        ['legacy source statement two', 'replacement destination beta'],
        ['legacy source statement three', null],
        ['legacy source statement four', null],
      ]
    )
  })

  it('preserves a related pair after an inserted blank line', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        ['  return sourceValue, nil'],
        ['', '  return &replacementValue, nil']
      ),
      true
    )

    assert.equal(rows[0].type, DiffRowType.Added)
    assert.equal(rows[1].type, DiffRowType.Modified)

    if (rows[1].type !== DiffRowType.Modified) {
      throw new Error('Expected the related return statements to stay paired')
    }

    assert.equal(rows[1].beforeData.content, '  return sourceValue, nil')
    assert.equal(rows[1].afterData.content, '  return &replacementValue, nil')
  })

  it('retains inner changes in unified hunks with inserted lines', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          '  Alpha string `json:"alpha"`',
          '  Stable bool `json:"stable"`',
          '  Gamma bool `json:"gamma"`',
        ],
        [
          '  Alpha     string `json:"alpha,omitempty"`',
          '  Stable    bool   `json:"stable"`',
          '  Beta      int    `json:"beta"`',
          '  Gamma     bool   `json:"gamma"`',
        ]
      ),
      false
    )

    assert.deepEqual(
      rows.map(row => row.type),
      [
        DiffRowType.Deleted,
        DiffRowType.Deleted,
        DiffRowType.Deleted,
        DiffRowType.Added,
        DiffRowType.Added,
        DiffRowType.Added,
        DiffRowType.Added,
      ]
    )

    const alphaAfter = rows[3]
    assert.equal(alphaAfter.type, DiffRowType.Added)

    if (alphaAfter.type !== DiffRowType.Added) {
      throw new Error('Expected the added Alpha field in unified mode')
    }

    assert.deepEqual(alphaAfter.data.tokens, [
      {
        8: { token: 'diff-add-inner', length: 4 },
        31: { token: 'diff-add-inner', length: 10 },
      },
    ])

    const betaAfter = rows[5]
    assert.equal(betaAfter.type, DiffRowType.Added)

    if (betaAfter.type !== DiffRowType.Added) {
      throw new Error('Expected the inserted field in unified mode')
    }

    assert.deepEqual(betaAfter.data.tokens, [
      {
        0: {
          token: 'diff-add-inner',
          length: '  Beta      int    `json:"beta"`'.length,
        },
      },
    ])
  })

  it('does not add full-line inner changes to entirely added or deleted hunks', () => {
    const addedRows = getModifiedRows(
      createModifiedLines([], ['first added line', 'second added line']),
      true
    )
    const deletedRows = getModifiedRows(
      createModifiedLines(['first deleted line', 'second deleted line'], []),
      true
    )

    assert.ok(addedRows.every(row => row.type === DiffRowType.Added))
    assert.ok(deletedRows.every(row => row.type === DiffRowType.Deleted))

    for (const row of [...addedRows, ...deletedRows]) {
      if (row.type !== DiffRowType.Added && row.type !== DiffRowType.Deleted) {
        throw new Error('Expected an entirely one-sided hunk')
      }

      assert.deepEqual(row.data.tokens, [])
    }
  })

  it('fully highlights unmatched SQL declarations in mixed replacements', () => {
    const before = [
      '  id UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),',
      '  record_group_id UUID NOT NULL,',
      '  record_id UUID NOT NULL REFERENCES record(id),',
      '  "legacy_metric" NUMERIC(24, 8) NOT NULL DEFAULT 0,',
      '  request_id UUID NOT NULL,',
    ]
    const after = [
      '  record_id UUID PRIMARY KEY NOT NULL REFERENCES record(id),',
      '  "retry_after" TIMESTAMPTZ,',
      '  request_id UUID NOT NULL,',
    ]
    const rows = getModifiedRows(createModifiedLines(before, after), true)

    for (const { content, side } of [
      { content: before[0], side: 'before' as const },
      { content: before[1], side: 'before' as const },
      { content: before[3], side: 'before' as const },
      { content: after[1], side: 'after' as const },
    ]) {
      const data = rows
        .flatMap(row => {
          if (side === 'before') {
            if (row.type === DiffRowType.Deleted) {
              return [row.data]
            }

            if (row.type === DiffRowType.Modified) {
              return [row.beforeData]
            }
          } else {
            if (row.type === DiffRowType.Added) {
              return [row.data]
            }

            if (row.type === DiffRowType.Modified) {
              return [row.afterData]
            }
          }

          return []
        })
        .find(candidate => candidate.content === content)

      assert.ok(data !== undefined)
      assert.deepEqual(data?.tokens, [
        {
          0: {
            token: side === 'after' ? 'diff-add-inner' : 'diff-delete-inner',
            length: content.length,
          },
        },
      ])
    }

    const recordIDRow = rows.find(
      row =>
        row.type === DiffRowType.Modified &&
        row.beforeData.content === before[2]
    )
    assert.equal(recordIDRow?.type, DiffRowType.Modified)
  })

  it('highlights unrelated replacement lines without character fragments', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          'shared start marker',
          'first source paragraph',
          'second source paragraph',
          'shared end marker',
        ],
        [
          'shared start marker',
          'replacement copy alpha',
          'replacement copy beta',
          'shared end marker',
        ]
      ),
      true
    )

    const replacementRows = rows.filter(
      row =>
        row.type === DiffRowType.Modified &&
        row.beforeData.content.includes('source paragraph')
    )
    assert.equal(replacementRows.length, 2)

    for (const row of replacementRows) {
      if (row.type !== DiffRowType.Modified) {
        throw new Error('Expected a top-aligned replacement row')
      }

      assert.deepEqual(row.beforeData.tokens, [
        {
          0: {
            token: 'diff-delete-inner',
            length: row.beforeData.content.length,
          },
        },
      ])
      assert.deepEqual(row.afterData.tokens, [
        {
          0: {
            token: 'diff-add-inner',
            length: row.afterData.content.length,
          },
        },
      ])
    }
  })

  it('preserves shared text while highlighting an uneven replacement region', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          'stable opening marker',
          'Description: preserve syntax colors in highlighted code',
          'Additional source details remain on a separate line.',
          'stable closing marker',
        ],
        [
          'stable opening marker',
          'Description: retain syntax colors in highlighted code',
          'stable closing marker',
        ]
      ),
      true
    )

    const modifiedRow = rows.find(
      row =>
        row.type === DiffRowType.Modified &&
        row.beforeData.content.startsWith('Description:')
    )
    assert.ok(modifiedRow !== undefined)

    if (modifiedRow?.type !== DiffRowType.Modified) {
      throw new Error('Expected the related description lines to stay paired')
    }

    assert.equal(modifiedRow.beforeData.tokens[0]?.[0], undefined)
    assert.equal(modifiedRow.afterData.tokens[0]?.[0], undefined)
    assert.ok(modifiedRow.beforeData.tokens.length > 0)
    assert.ok(modifiedRow.afterData.tokens.length > 0)

    const deletedRow = rows.find(row => row.type === DiffRowType.Deleted)
    assert.ok(deletedRow !== undefined)

    if (deletedRow?.type !== DiffRowType.Deleted) {
      throw new Error('Expected a one-sided row in the replacement region')
    }

    assert.deepEqual(deletedRow.data.tokens, [
      {
        0: {
          token: 'diff-delete-inner',
          length: deletedRow.data.content.length,
        },
      },
    ])
  })

  it('preserves line-local changes when multiline tokens match elsewhere', () => {
    const sharedSuffix = ' with stable supporting context'.repeat(40)
    const rows = getModifiedRows(
      createModifiedLines(
        [
          'stable opening marker',
          `Rule uses source_value for output.${sharedSuffix}`,
          'Legacy total detail.',
          'stable closing marker',
        ],
        [
          'stable opening marker',
          `Rule uses source_total_value for output.${sharedSuffix}`,
          'Replacement detail.',
          'Additional guidance.',
          'stable closing marker',
        ]
      ),
      true
    )

    assert.ok(`Rule uses source_value for output.${sharedSuffix}`.length > 1024)

    const ruleRow = rows.find(
      row =>
        row.type === DiffRowType.Modified &&
        row.afterData.content.startsWith('Rule uses')
    )
    assert.equal(ruleRow?.type, DiffRowType.Modified)

    if (ruleRow?.type !== DiffRowType.Modified) {
      throw new Error('Expected the related rule lines to stay paired')
    }

    const totalLocation = ruleRow.afterData.content.indexOf('total')
    assert.ok(hasHighlightAt(ruleRow.afterData.tokens, totalLocation))
  })

  it('preserves shared text when paragraphs are reflowed across fewer lines', () => {
    const sharedTail = [
      'Tempor incididunt. Duis aute irure dolor in reprehenderit.',
      'Lorem text DEFAULT ipsum dolor sit amet.',
    ]
    const rows = getModifiedRows(
      createModifiedLines(
        [
          'Lorem ipsum dolor sit amet.',
          'Consectetur adipiscing elit, sed do',
          'eiusmod tempor incididunt ut labore.',
          'Ut enim ad minim veniam, quis nostrud',
          'exercitation ullamco laboris nisi.',
          ...sharedTail,
        ],
        [
          'Lorem ipsum dolor sit amet. Consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
          `Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi. ${sharedTail.join(
            ' '
          )}`,
        ]
      ),
      false,
      false,
      false,
      false,
      false,
      false
    )

    const tailRows = rows.filter(
      row =>
        row.type === DiffRowType.Deleted &&
        sharedTail.includes(row.data.content)
    )
    assert.equal(tailRows.length, sharedTail.length)
    assert.ok(
      tailRows.every(
        row => row.type === DiffRowType.Deleted && row.data.tokens.length === 0
      )
    )
  })

  it('rechecks paired lines together with adjacent reflowed lines', () => {
    const before = [
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    ]
    const after = [`${before[0]} ${before[1]}`]
    const rows = getModifiedRows(
      createModifiedLines(before, after),
      false,
      false,
      false,
      false,
      false,
      false
    )

    for (const row of rows) {
      if (row.type === DiffRowType.Added || row.type === DiffRowType.Deleted) {
        assert.deepEqual(row.data.tokens, [])
      }
    }
  })

  it('does not match inserted comment text against code identifiers', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          'stable opening marker',
          '  LegacyValue Scalar',
          '  Status bool',
          'stable closing marker',
        ],
        [
          'stable opening marker',
          '  // TotalValue describes the value calculation.',
          '  // Value parts remain visible.',
          '  TotalValue Scalar',
          '  Status bool',
          'stable closing marker',
        ]
      ),
      true
    )

    const commentData = rows.flatMap(row => {
      if (
        row.type === DiffRowType.Added &&
        row.data.content.trimStart().startsWith('//')
      ) {
        return [row.data]
      }

      if (
        row.type === DiffRowType.Modified &&
        row.afterData.content.trimStart().startsWith('//')
      ) {
        return [row.afterData]
      }

      return []
    })
    assert.equal(commentData.length, 2)

    for (const data of commentData) {
      const valueLocation = data.content.indexOf('Value')
      assert.ok(valueLocation >= 0)
      assert.ok(hasHighlightAt(data.tokens, valueLocation))
    }
  })

  it('does not match inserted Vue comment text against bindings', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [
          'stable opening marker',
          '  <StatusBadge :label="legacyValue" />',
          'stable closing marker',
        ],
        [
          'stable opening marker',
          '  <!-- currentValue describes the selected label. -->',
          '  <StatusBadge :label="currentValue" />',
          'stable closing marker',
        ]
      ),
      true
    )

    const commentRow = rows.find(row => {
      if (row.type === DiffRowType.Added) {
        return row.data.content.trimStart().startsWith('<!--')
      }

      return (
        row.type === DiffRowType.Modified &&
        row.afterData.content.trimStart().startsWith('<!--')
      )
    })

    assert.ok(commentRow)

    const commentData =
      commentRow.type === DiffRowType.Added
        ? commentRow.data
        : commentRow.type === DiffRowType.Modified
        ? commentRow.afterData
        : undefined
    assert.ok(commentData)

    const valueLocation = commentData.content.indexOf('currentValue')
    assert.ok(valueLocation >= 0)
    assert.ok(hasHighlightAt(commentData.tokens, valueLocation))
  })

  it('highlights small one-sided hunks bounded by context', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        [],
        [
          '  FirstInserted string `json:"first_inserted"`',
          '  SecondInserted bool `json:"second_inserted"`',
        ]
      ),
      true,
      false,
      false,
      true,
      true
    )

    assert.equal(rows.length, 2)

    for (const row of rows) {
      if (row.type !== DiffRowType.Added) {
        throw new Error('Expected a context-bounded inserted row')
      }

      assert.deepEqual(row.data.tokens, [
        {
          0: {
            token: 'diff-add-inner',
            length: row.data.content.length,
          },
        },
      ])
    }
  })

  it('highlights trailing insertions bounded by following context', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        ['  Stable string `json:"stable"`'],
        [
          '  Stable string `json:"stable"`',
          '  TrailingMetadata *Metadata `json:"trailing_metadata,omitempty"`',
          '  SupplementalData *Details `json:"supplemental_data,omitempty"`',
        ]
      ),
      true,
      false,
      false,
      false,
      true
    )

    const addedRows = rows.filter(row => row.type === DiffRowType.Added)
    assert.equal(addedRows.length, 2)

    for (const row of addedRows) {
      if (row.type !== DiffRowType.Added) {
        throw new Error('Expected a trailing inserted row')
      }

      assert.deepEqual(row.data.tokens, [
        {
          0: {
            token: 'diff-add-inner',
            length: row.data.content.length,
          },
        },
      ])
    }
  })

  it('highlights large insertions between stable lines', () => {
    const insertedLines = Array.from(
      { length: 9 },
      (_, index) => `inserted configuration line ${index + 1}`
    )
    const rows = getModifiedRows(
      createModifiedLines(
        ['stable opening marker', 'stable closing marker'],
        ['stable opening marker', ...insertedLines, 'stable closing marker']
      ),
      true
    )

    const addedRows = rows.filter(row => row.type === DiffRowType.Added)
    assert.equal(addedRows.length, insertedLines.length)

    for (const row of addedRows) {
      if (row.type !== DiffRowType.Added) {
        throw new Error('Expected an inserted configuration row')
      }

      assert.deepEqual(row.data.tokens, [
        {
          0: {
            token: 'diff-add-inner',
            length: row.data.content.length,
          },
        },
      ])
    }
  })

  it('keeps multiline inner diff work bounded for large replacements', () => {
    const beforeLines = [
      Array.from({ length: 251 }, (_, index) => `source-a-${index}`).join(' '),
      Array.from({ length: 251 }, (_, index) => `source-b-${index}`).join(' '),
    ]
    const afterLines = [
      Array.from({ length: 501 }, (_, index) => `destination-${index}`).join(
        ' '
      ),
    ]
    const rows = getModifiedRows(
      createModifiedLines(
        ['stable opening marker', ...beforeLines, 'stable closing marker'],
        ['stable opening marker', ...afterLines, 'stable closing marker']
      ),
      true
    )

    for (const row of rows) {
      if (row.type === DiffRowType.Added || row.type === DiffRowType.Deleted) {
        assert.deepEqual(row.data.tokens, [])
      }
    }
  })

  it('groups uneven paragraph replacements in read-only split mode', () => {
    const sourceParagraph = [
      'This paragraph was wrapped across several lines so the review',
      'surface had to render each source line independently even though',
      'the prose represented one logical replacement with substantially',
      'more text on the destination side than on the source side.',
    ]
    const destinationParagraph =
      'This paragraph now occupies one source line while preserving enough shared language for the semantic matcher to recognize it as the same logical replacement with substantially more destination text.' +
      ' Additional destination context remains readable and intentionally extends the physical line without increasing comparison complexity.'.repeat(
        7
      )
    assert.ok(
      sourceParagraph.join('\n').length * destinationParagraph.length > 250_000
    )

    const rows = getModifiedRows(
      createModifiedLines(sourceParagraph, [destinationParagraph]),
      true,
      true,
      true
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, DiffRowType.Modified)

    const row = rows[0]
    if (row.type !== DiffRowType.Modified) {
      throw new Error('Expected one measured replacement block')
    }

    assert.equal(row.beforeBlockData?.length, 4)
    assert.equal(row.afterBlockData?.length, 1)
    assert.ok(row.beforeBlockData?.some(data => data.tokens.length > 0))
    assert.ok(row.afterBlockData?.some(data => data.tokens.length > 0))
  })

  it('keeps replacement rows independent when block grouping is disabled', () => {
    const rows = getModifiedRows(
      createModifiedLines(
        ['First source line', 'Second source line', 'Third source line'],
        ['One destination line']
      ),
      true,
      true,
      false
    )

    assert.ok(rows.length > 1)
    assert.ok(
      rows.every(
        row =>
          row.type !== DiffRowType.Modified ||
          (row.beforeBlockData === undefined &&
            row.afterBlockData === undefined)
      )
    )
  })
})
