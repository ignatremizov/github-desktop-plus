/**
 * Error subclass for parse and validation failures from Copilot responses.
 * Used to distinguish retryable errors (bad LLM output) from transport
 * errors (timeouts, auth, session creation) which should fail fast.
 */
export class CopilotValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CopilotValidationError'
  }
}

/** Resolution suggestion for a single conflicted file. */
export interface IFileResolution {
  /** Repository-relative file path that was resolved. */
  readonly path: string
  /** The fully resolved file content (all conflict markers removed). */
  readonly resolvedContent: string
  /** Human-readable explanation of how and why conflicts were resolved this way. */
  readonly reasoning: string
}

/** Complete response from Copilot conflict resolution. */
export interface ICopilotConflictResolutionResponse {
  /** Resolution suggestions, one per conflicted file. */
  readonly resolutions: ReadonlyArray<IFileResolution>
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse the raw string response from the Copilot SDK into a structured
 * conflict resolution response.
 *
 * Handles markdown code-block wrapping (` ```json ... ``` `) and validates
 * all required fields.
 */
export function parseCopilotConflictResolution(
  content: string
): ICopilotConflictResolutionResponse {
  // Build a list of JSON candidates from the response, trying different
  // extraction strategies. Non-greedy handles the common single-block and
  // multi-block cases. Greedy handles triple backticks embedded inside JSON
  // content. Raw content handles responses with no fences at all.
  const nonGreedy =
    content.match(/```json\s*([\s\S]*?)```/) ||
    content.match(/```\s*([\s\S]*?)```/)
  const greedy =
    content.match(/```json\s*([\s\S]*)```/) ||
    content.match(/```\s*([\s\S]*)```/)

  const candidates: Array<string> = []
  if (nonGreedy) {
    candidates.push(nonGreedy[1].trim())
  }
  if (greedy && greedy[1].trim() !== nonGreedy?.[1]?.trim()) {
    candidates.push(greedy[1].trim())
  }
  candidates.push(content.trim())

  let parsed: unknown
  let parseError: Error | undefined
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate)
      parseError = undefined
      break
    } catch {
      parseError = new CopilotValidationError(
        'Copilot returned invalid JSON for conflict resolution generation'
      )
    }
  }
  if (parseError) {
    throw parseError
  }

  if (!isRecord(parsed)) {
    throw new CopilotValidationError(
      'Copilot returned an invalid conflict resolution payload: expected an object'
    )
  }

  const { resolutions } = parsed

  if (!Array.isArray(resolutions)) {
    throw new CopilotValidationError(
      'Copilot returned an invalid conflict resolution payload: "resolutions" must be an array'
    )
  }

  if (resolutions.length === 0) {
    throw new CopilotValidationError(
      'Copilot returned an invalid conflict resolution payload: "resolutions" must not be empty'
    )
  }

  const validated: Array<IFileResolution> = []

  for (let i = 0; i < resolutions.length; i++) {
    const entry: unknown = resolutions[i]

    if (!isRecord(entry)) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: resolution at index ${i} must be an object`
      )
    }

    const { path, resolvedContent, reasoning } = entry

    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: "path" at index ${i} must be a non-empty string`
      )
    }

    if (typeof resolvedContent !== 'string') {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: "resolvedContent" at index ${i} must be a string`
      )
    }

    if (/^<{7}\s/m.test(resolvedContent) && /^={7}$/m.test(resolvedContent)) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: "resolvedContent" at index ${i} still contains conflict markers`
      )
    }

    if (typeof reasoning !== 'string' || reasoning.trim().length === 0) {
      throw new CopilotValidationError(
        `Copilot returned an invalid conflict resolution payload: "reasoning" at index ${i} must be a non-empty string`
      )
    }

    validated.push({ path: path.trim(), resolvedContent, reasoning })
  }

  return { resolutions: validated }
}
