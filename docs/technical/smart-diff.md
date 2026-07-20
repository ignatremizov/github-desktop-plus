<!-- markdownlint-disable MD013 -->

# Smart diff

Status: design record for the current default semantic diff renderer and future scope for an optional smart-diff mode.

## Motivation

Git produces line-oriented hunks. That representation is predictable, fast, and appropriate for staging, but it cannot describe higher-level relationships such as:

- a statement moving within a changed block;
- one line splitting into several lines;
- several lines joining into one line;
- a declaration being renamed while a nearby declaration is inserted;
- comments moving independently from the code they describe; or
- repeated code shapes whose intended counterparts are not positional.

The default diff renderer may use bounded text heuristics to improve line alignment and intraline highlighting, but it should not imply certainty about author intent. When a changed block is ambiguous, preserving Git's ordering and showing understandable text-level changes is preferable to an elaborate but incorrect pairing.

Smart diff would be an optional, slower mode for reviewers who want additional structural analysis.

## Current default semantic renderer

The default renderer improves Git's line-oriented output without changing the patch model. It operates only on consecutive added and deleted lines already present in a Git hunk. Original line numbers, diff-line identities, selection state, hunk ordering, and staging behavior remain authoritative.

The current implementation is intentionally text based. It does not parse Go, SQL, Markdown, or other languages into syntax trees. References to declarations, fields, comments, and database columns below describe bounded lexical and structural heuristics, not language parsers.

Enhanced diff highlighting is exposed as a persisted option and defaults off. With the option disabled, the application uses the standard renderer: unified changed blocks remain plain deleted-then-added rows, split blocks pair lines positionally, and the original bounded intraline comparison runs only when a block has equal numbers of additions and deletions. Enabling the option activates the semantic alignment, multiline refinement, and accent decisions documented below.

The implementation is divided across:

- `diff-line-alignment.ts`, which pairs likely counterpart lines;
- `changed-range.ts`, which calculates lexical and character-level intraline ranges;
- `modified-diff-rows.ts`, which combines alignment, multiline refinement, semantic insertion accents, and row construction; and
- `side-by-side-diff.tsx`, which supplies file context and preserves renderer interaction behavior.

### Line alignment

Each source and destination line receives a fingerprint containing:

- whitespace-normalized text;
- a compact form with all whitespace removed;
- character bigrams for approximate similarity; and
- an optional structural key.

Exact normalized matches are strongest. Compact matches allow indentation and alignment whitespace to change without making the line look replaced. Remaining candidates require a minimum bigram similarity and receive a small order bias so equally plausible matches prefer earlier counterparts.

Alignment uses bounded dynamic programming with explicit pair, delete, and add costs. Regions exceeding 40,000 alignment cells fall back to positional pairing rather than performing unbounded work. Similarity fingerprints are capped at 1,024 characters by retaining their beginning and end.

### Structural keys

Structural keys make repeated code shapes less dependent on positional similarity. The recognizer currently identifies:

- object or configuration fields written as `name:`;
- assignments written with `:=` or a non-comparison `=`;
- Markdown-style list-item subjects;
- typed declarations using primitive, pointer, slice, map, or qualified type shapes;
- database columns using a curated set of common SQL types; and
- leading subjects in line comments.

Identifier keys are split into lowercase CamelCase, acronym, and numeric words. Related names such as `FeeCharged` and `TotalFeeCharged` may therefore remain counterparts, while unrelated declarations that merely share a type are penalized.

Database declarations are deliberately stricter. Different column names are not paired solely because they share types or constraints, and text following a recognized SQL type must look like the end of a declaration or a known SQL constraint. This avoids treating ordinary prose such as a sentence containing `UUID text` as a database column.

Comment text is excluded from the executable portion of a line fingerprint when an inline comment marker can be identified. Comment subjects compare with comment subjects rather than executable identifiers.

These recognizers are deliberately small and language-agnostic. Expanding them to infer statement intent, scopes, moves, or arbitrary grammar belongs in optional smart diff rather than the default path.

### Intraline token comparison

Paired lines are compared as lexical tokens before falling back to character refinement. The tokenizer recognizes:

- quoted string literals;
- integer and decimal numbers; and
- identifiers split into CamelCase, acronym, and numeric subwords.

Tokens retain whether they came from comment or executable content, preventing a word in a comment from being matched against the same word in code. Exact token matches form stable islands. One-to-one literal replacements receive character refinement, while rewritten identifiers remain token shaped so coincidental shared letters do not create confetti.

Tokens before and after a detected assignment operator remain in separate comparison regions. This prevents repeated words in an unchanged declaration name from being matched against a newly qualified right-hand value and making the stable left-hand side appear partially replaced.

Long paired string literals receive an additional bounded word comparison before character refinement. Substantial unchanged runs separate distant edits, but common short words inside a rewritten sentence do not become independent anchors. This keeps two sparse edits in a generated JSON string from accenting all unchanged prose between them without reintroducing word-level confetti.

Quoted attribute values remain ordered source text. The renderer does not treat HTML or Vue `class` values as unordered sets because it cannot safely assume a particular CSS framework or that reordering is semantically irrelevant; class reordering therefore remains visible as a literal change.

Token and character comparison use bounded longest-common-subsequence tables. Comparisons exceeding 250,000 cells use a coarser prefix-and-suffix fallback instead of allocating unbounded memory. Long-literal word comparison uses a bounded Myers edit distance and returns to the same coarse fallback when that budget is exceeded.

Whitespace, underscores, and hyphens between consecutive changed words may be joined into a contiguous accent. Selector punctuation such as `.` and `::`, along with call parentheses, may also be included when they belong to a removed or inserted expression. The default token-boundary policy below records the visual tradeoff.

Markdown lines that look like prose use a broader separator policy: punctuation, symbols, possessive or contraction suffixes, and surrounding whitespace may join consecutive changed tokens into one readable phrase. Code-shaped and indented Markdown lines retain the code-oriented policy so syntax punctuation remains independently reviewable. This is a line heuristic rather than full Markdown fence parsing.

### Multiline replacements and reflow

Uneven replacement blocks are compared both line by line and as joined multiline regions. A one-sided alignment gap is rechecked together with its immediate paired boundaries. This allows text retained across Markdown paragraph reflow, expression wrapping, or several-to-one line changes to remain unaccented even when the physical Git lines were deleted and added.

Joined comparison ignores line-break-only changes between shared tokens. Its result may replace premature line-local tokens inside the affected region. This behavior improves reflow substantially but can distribute shared tokens across several plausible destination lines. The assertion example below records why the default renderer accepts that ambiguity instead of inferring author intent.

### Full-line semantic accents

The pale row background always communicates Git addition or deletion. A stronger inner accent is reserved for content the renderer can usefully identify as a semantic insertion, deletion, or changed span.

Pure one-sided regions bounded by stable counterpart lines may receive full-line inner accents. Mixed regions containing both additions and deletions remain replacements and do not receive full-line stripes merely because their line counts differ. Unmatched typed declarations and database columns may receive full-line accents in code-like files so newly inserted or deleted fields remain visible inside reformatted structures.

Entirely added or deleted files keep the ordinary pale row background rather than painting every line with a stronger text-height accent. Markdown files disable declaration-based full-line accents because ordinary prose can resemble Go or SQL declarations; fenced Markdown code is not treated specially today.

### Unified and split presentation

Selectable unified diffs preserve Git's deleted-then-added ordering. Semantic analysis changes accents, not line identity or staging order. Split diffs use the alignment to place counterparts beside each other and may insert empty opposite-side slots for unmatched lines.

Read-only split diffs may group an uneven replacement into one measured visual block so several source lines and one long destination line remain top-aligned. Search, minimap markings, line selection, and diff expansion continue to operate on the original row data.

### Styling decisions

Inner diff accents change background only and preserve syntax-highlight foreground colors. Strong accents are intentionally lower contrast than the original implementation so they remain useful without overpowering the pale row background.

Accents follow rendered text across wrapped visual lines. Classification must therefore avoid full-line accents on broad prose replacements, where text-height backgrounds would create distracting stripes.

## Example ambiguity

Consider this source line:

```text
assert.Equal(t, modeLegacyActive, item.CurrentRoute.ExecutionMode)
```

and these destination lines:

```text
assert.Equal(t, modeLive, item.PreviousRoute.ExecutionMode)
assert.Equal(t, modeActive, item.CurrentRoute.ExecutionMode)
```

A human will often interpret the first destination line as inserted and the second as the source line with `Legacy` removed. A text-only matcher can also reasonably distribute shared tokens across both destination lines because both retain the same call prefix.

The default renderer should present this ambiguity consistently rather than guessing at intent. Smart diff could prefer the second line only after assigning high confidence to the shared argument position and `CurrentRoute.ExecutionMode` structure.

## Default token-boundary policy

The default renderer intentionally favors contiguous, readable accents over character-perfect exclusion of every unchanged separator. When adjacent lexical tokens both change, shared punctuation and whitespace between them may remain inside the accent. For example, if a quoted value and the expression following it are both replaced, the unchanged closing quote, comma, and space between those changes may also be accented.

This is a deliberate tradeoff rather than evidence that those separator characters changed. Leaving tiny pale gaps between neighboring accents creates distracting visual “confetti” and makes the meaningful replacement harder to scan. The default renderer should preserve an unchanged separator when it forms a useful structural boundary, but it need not fragment an otherwise contiguous replacement solely for character-level precision.

Smart diff may preserve separators more selectively when syntax analysis can identify them confidently and the result remains visually coherent.

## Future smart-diff mode

### Product behavior

Smart diff should be exposed as a persisted diff option and remain disabled by default until its behavior and performance are well understood.

When disabled:

- Git hunks remain the source of truth for ordering and staging.
- Existing bounded line and token comparison remains available.
- No syntax-tree result changes selectable line identity.

When enabled:

- Structural analysis may improve presentation within each Git changed block.
- Low-confidence regions fall back independently to the default renderer.
- Staging and discarding continue to use original Git diff line identities.
- The UI should not delay initial rendering while optional analysis runs.

The setting should apply consistently to unified and split views. If analysis is asynchronous, switching files or diff modes must cancel or ignore stale results.

### Proposed analysis pipeline

#### 1. Preserve the Git model

Parse the patch normally and retain every original line number, hunk position, selection state, and no-newline marker. Smart diff produces presentation metadata; it does not rewrite the patch.

#### 2. Establish strong text anchors

Use exact and whitespace-normalized matches to divide a changed block into smaller regions. Existing bounded line alignment can remain the fallback for languages without structural support.

#### 3. Parse supported languages

Where practical, parse before and after regions into lightweight syntax trees. The parser must tolerate incomplete hunk fragments and syntax errors. Useful node categories include:

- declarations and assignments;
- calls and argument lists;
- object fields and database columns;
- comments and documentation blocks;
- control-flow statements; and
- function or type boundaries.

Parser support should be incremental by language. Unsupported files must use the text fallback without changing behavior.

#### 4. Generate counterpart candidates

Candidate pairs can be scored using:

- syntax-node kind;
- stable identifiers and qualified selectors;
- parent structure;
- unchanged argument positions;
- exact prefixes and suffixes;
- neighboring strong anchors;
- relative order and movement distance; and
- comment-to-declaration association.

One-to-many and many-to-one candidates should be represented explicitly instead of forcing every relationship into a single line pair.

#### 5. Select only high-confidence relationships

Accept a structural pairing only when it is clearly better than competing candidates. Confidence should include both an absolute threshold and a margin over the next-best interpretation.

Conflicting, cyclic, or weak relationships fall back to the default alignment for that region. Smart diff should prefer an obvious Git-style result over a confident-looking mistake.

#### 6. Refine intraline changes

Once structural counterparts are selected, calculate intraline changes within those counterparts. Tokens from an inserted statement should not be matched against a nearby modified statement merely because both share common syntax.

Comments should normally compare with comments, not identifiers in executable code. Pure formatting and line-wrap changes should retain their content as unchanged.

### Performance constraints

Large diffs must remain responsive. Smart analysis should have explicit budgets for:

- changed lines per region;
- syntax nodes per region;
- candidate-pair count;
- total analysis time per file; and
- memory retained for cached results.

Analysis should run off the critical rendering path and yield between regions. Results should be cached by file identity, patch text, and relevant diff options. Scrolling must never trigger structural recomputation.

If any budget is exceeded, the affected region should immediately use the default renderer.

### Rendering and interaction constraints

- Preserve syntax-highlight foreground colors inside diff accents.
- Preserve original diff-line identity for partial selection.
- Keep unified and split interpretations equivalent.
- Represent unmatched lines clearly without manufacturing counterparts.
- Avoid layout shifts when an asynchronous smart result replaces a fallback.
- Search results, minimap markings, and accessibility text must follow the displayed interpretation.

### Testing strategy

Fixtures must be generic and contain no project-specific or personal data. Coverage should include:

- inserted statement beside a renamed statement;
- moved function plus a deleted neighboring function;
- one-to-many and many-to-one formatting changes;
- repeated object or assertion shapes;
- JSX prop changes with repeated visible text;
- Vue SFC directives, bindings, interpolations, and `<script setup>` expressions;
- reordered utility-class attributes without framework-specific normalization;
- stylesheet property changes around inserted declarations;
- comments whose words also occur in code;
- Markdown paragraph reflow;
- SQL declarations with repeated types and constraints;
- entire added and deleted files;
- malformed or incomplete syntax fragments; and
- oversized regions that exercise deterministic fallback.

Each structural fixture should assert both the accepted relationship and its confidence/fallback behavior. Cross-language golden tests should verify that an unsupported parser never degrades the default rendering.

### Open questions

- Which parser technology provides tolerant, distributable parsers within the desktop application's size and licensing constraints?
- Which languages should receive structural support first?
- Should smart results appear incrementally or only after a complete file pass?
- How should moved regions be indicated without adding visual noise?
- Should users be able to inspect why a pairing was selected?
- What telemetry, if any, can measure latency and fallback rates without collecting source content?
