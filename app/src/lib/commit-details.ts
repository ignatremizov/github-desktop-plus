import { IMenu } from '../models/app-menu'

export interface ICommitDetailsShortcut {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

export type CommitDetailsShortcut = ICommitDetailsShortcut | 'off'

export const defaultCommitDetailsShortcut: ICommitDetailsShortcut = {
  key: 'e',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
}

const modifierKeys = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'Shift'])
const reservedUnmodifiedKeys = new Set(['Backspace', 'Delete', 'Tab'])
const namedShortcutKeys = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'AudioVolumeDown',
  'AudioVolumeMute',
  'AudioVolumeUp',
  'Backspace',
  'BrowserBack',
  'BrowserFavorites',
  'BrowserForward',
  'BrowserHome',
  'BrowserRefresh',
  'BrowserSearch',
  'BrowserStop',
  'CapsLock',
  'ContextMenu',
  'Delete',
  'End',
  'Enter',
  'Home',
  'Insert',
  'LaunchApplication1',
  'LaunchApplication2',
  'LaunchMail',
  'LaunchMediaPlayer',
  'MediaPlayPause',
  'MediaStop',
  'MediaTrackNext',
  'MediaTrackPrevious',
  'NumLock',
  'PageDown',
  'PageUp',
  'Pause',
  'PrintScreen',
  'ScrollLock',
  'Tab',
])
const functionKeyPattern = /^F(?:[1-9]|1[0-9]|2[0-4])$/
const asciiLetterPattern = /^[A-Z]$/i
const shiftedPunctuationToBaseKey = new Map([
  ['~', '`'],
  ['!', '1'],
  ['@', '2'],
  ['#', '3'],
  ['$', '4'],
  ['%', '5'],
  ['^', '6'],
  ['&', '7'],
  ['*', '8'],
  ['(', '9'],
  [')', '0'],
  ['_', '-'],
  ['+', '='],
  ['{', '['],
  ['}', ']'],
  ['|', '\\'],
  [':', ';'],
  ['"', "'"],
  ['<', ','],
  ['>', '.'],
  ['?', '/'],
])
const electronAcceleratorKeyToDOMKey = new Map<string, string>([
  ['plus', '+'],
  ['space', ' '],
  ['tab', 'Tab'],
  ['capslock', 'CapsLock'],
  ['numlock', 'NumLock'],
  ['scrolllock', 'ScrollLock'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['insert', 'Insert'],
  ['return', 'Enter'],
  ['enter', 'Enter'],
  ['up', 'ArrowUp'],
  ['down', 'ArrowDown'],
  ['left', 'ArrowLeft'],
  ['right', 'ArrowRight'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['volumeup', 'AudioVolumeUp'],
  ['volumedown', 'AudioVolumeDown'],
  ['volumemute', 'AudioVolumeMute'],
  ['medianexttrack', 'MediaTrackNext'],
  ['mediaprevioustrack', 'MediaTrackPrevious'],
  ['mediastop', 'MediaStop'],
  ['mediaplaypause', 'MediaPlayPause'],
  ['printscreen', 'PrintScreen'],
  ['numdec', '.'],
  ['numadd', '+'],
  ['numsub', '-'],
  ['nummult', '*'],
  ['numdiv', '/'],
])

for (let key = 0; key <= 9; key++) {
  electronAcceleratorKeyToDOMKey.set(`num${key}`, `${key}`)
}

function normalizeShortcutKey(key: string) {
  return asciiLetterPattern.test(key) ? key.toLowerCase() : key
}

function normalizeShortcutKeyForComparison(key: string, shiftKey: boolean) {
  const normalizedKey = normalizeShortcutKey(key)
  return shiftKey
    ? shiftedPunctuationToBaseKey.get(normalizedKey) ?? normalizedKey
    : normalizedKey
}

function hasModifier(shortcut: ICommitDetailsShortcut) {
  return (
    shortcut.ctrlKey || shortcut.metaKey || shortcut.shiftKey || shortcut.altKey
  )
}

function isSinglePrintableShortcutKey(key: string) {
  return Array.from(key).length === 1 && !/[\u0000-\u001f\u007f]/.test(key)
}

function isRecordableShortcutKey(key: string) {
  if (modifierKeys.has(key) || key === 'Escape') {
    return false
  }

  if (key === ' ') {
    return true
  }

  if (isSinglePrintableShortcutKey(key)) {
    return true
  }

  return namedShortcutKeys.has(key) || functionKeyPattern.test(key)
}

function isRecordableShortcut(shortcut: ICommitDetailsShortcut) {
  return (
    isRecordableShortcutKey(shortcut.key) &&
    (hasModifier(shortcut) || !reservedUnmodifiedKeys.has(shortcut.key))
  )
}

function getReservedApplicationShortcut(
  shortcut: ICommitDetailsShortcut
): ICommitDetailsShortcutConflict | null {
  if (shortcut.key === 'Tab' && shortcut.ctrlKey) {
    return {
      accelerator: getCommitDetailsToggleShortcutLabel(shortcut, false) ?? '',
      label: 'Switch repository section',
    }
  }

  if (
    shortcut.key === 'F10' &&
    shortcut.shiftKey &&
    !shortcut.ctrlKey &&
    !shortcut.metaKey &&
    !shortcut.altKey
  ) {
    return {
      accelerator: 'Shift+F10',
      label: 'Open context menu',
    }
  }

  return null
}

function parseShortcut(value: unknown): ICommitDetailsShortcut | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const shortcut = value as Partial<ICommitDetailsShortcut>
  if (
    typeof shortcut.key === 'string' &&
    typeof shortcut.ctrlKey === 'boolean' &&
    typeof shortcut.metaKey === 'boolean' &&
    typeof shortcut.shiftKey === 'boolean' &&
    typeof shortcut.altKey === 'boolean'
  ) {
    const normalizedShortcut = {
      key: normalizeShortcutKeyForComparison(shortcut.key, shortcut.shiftKey),
      ctrlKey: shortcut.ctrlKey,
      metaKey: shortcut.metaKey,
      shiftKey: shortcut.shiftKey,
      altKey: shortcut.altKey,
    }

    return isRecordableShortcut(normalizedShortcut) &&
      getReservedApplicationShortcut(normalizedShortcut) === null
      ? normalizedShortcut
      : null
  }

  return null
}

export function parseCommitDetailsShortcut(
  value: string | null
): CommitDetailsShortcut {
  if (value === null) {
    return defaultCommitDetailsShortcut
  }

  if (value === 'off') {
    return 'off'
  }

  try {
    const parsedValue: unknown = JSON.parse(value)
    return parseShortcut(parsedValue) ?? defaultCommitDetailsShortcut
  } catch {
    return defaultCommitDetailsShortcut
  }
}

export function serializeCommitDetailsShortcut(
  shortcut: CommitDetailsShortcut
) {
  return shortcut === 'off' ? shortcut : JSON.stringify(shortcut)
}

export function createCommitDetailsShortcut(
  event: ICommitDetailsShortcut
): ICommitDetailsShortcut | null {
  if (modifierKeys.has(event.key)) {
    return null
  }

  const shortcut = {
    key: normalizeShortcutKeyForComparison(event.key, event.shiftKey),
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  }

  return isRecordableShortcut(shortcut) ? shortcut : null
}

export function commitDetailsShortcutsEqual(
  first: CommitDetailsShortcut,
  second: CommitDetailsShortcut
) {
  if (first === 'off' || second === 'off') {
    return first === second
  }

  return (
    normalizeShortcutKeyForComparison(first.key, first.shiftKey) ===
      normalizeShortcutKeyForComparison(second.key, second.shiftKey) &&
    first.ctrlKey === second.ctrlKey &&
    first.metaKey === second.metaKey &&
    first.shiftKey === second.shiftKey &&
    first.altKey === second.altKey
  )
}

export function isCommitDetailsToggleShortcut(
  event: ICommitDetailsShortcut,
  shortcut: CommitDetailsShortcut
): boolean {
  return (
    shortcut !== 'off' &&
    normalizeShortcutKeyForComparison(event.key, event.shiftKey) ===
      normalizeShortcutKeyForComparison(shortcut.key, shortcut.shiftKey) &&
    event.ctrlKey === shortcut.ctrlKey &&
    event.metaKey === shortcut.metaKey &&
    event.shiftKey === shortcut.shiftKey &&
    event.altKey === shortcut.altKey
  )
}

function parseAccelerator(
  accelerator: string,
  isDarwin: boolean
): ICommitDetailsShortcut | null {
  const tokens = accelerator.split('+')
  let keyToken = tokens.pop()
  if (keyToken === '' && tokens[tokens.length - 1] === '') {
    tokens.pop()
    keyToken = '+'
  }
  if (keyToken === undefined) {
    return null
  }

  let ctrlKey = false
  let metaKey = false
  let shiftKey = false
  let altKey = false

  for (const token of tokens) {
    switch (token.toLowerCase()) {
      case 'cmdorctrl':
      case 'commandorcontrol':
        ctrlKey = !isDarwin
        metaKey = isDarwin
        break
      case 'cmd':
      case 'command':
      case 'meta':
      case 'super':
        metaKey = true
        break
      case 'ctrl':
      case 'control':
        ctrlKey = true
        break
      case 'shift':
        shiftKey = true
        break
      case 'alt':
      case 'option':
        altKey = true
        break
      case 'altgr':
        ctrlKey = true
        altKey = true
        break
      default:
        return null
    }
  }

  const normalizedKeyToken = keyToken.toLowerCase()
  let key =
    electronAcceleratorKeyToDOMKey.get(normalizedKeyToken) ??
    (functionKeyPattern.test(keyToken.toUpperCase())
      ? keyToken.toUpperCase()
      : normalizeShortcutKey(keyToken))
  if (!normalizedKeyToken.startsWith('num')) {
    const baseKey = shiftedPunctuationToBaseKey.get(key)
    if (baseKey !== undefined) {
      key = baseKey
      shiftKey = true
    }
  }

  return {
    key,
    ctrlKey,
    metaKey,
    shiftKey,
    altKey,
  }
}

export interface ICommitDetailsShortcutConflict {
  readonly accelerator: string
  readonly label: string
}

export function findCommitDetailsShortcutConflict(
  menu: IMenu | undefined,
  shortcut: CommitDetailsShortcut,
  isDarwin = __DARWIN__,
  isRootMenu = true
): ICommitDetailsShortcutConflict | null {
  if (shortcut === 'off') {
    return null
  }

  const reservedShortcut = getReservedApplicationShortcut(shortcut)
  if (reservedShortcut !== null) {
    return reservedShortcut
  }

  if (menu === undefined) {
    return null
  }

  for (const item of menu.items) {
    if (item.type === 'submenuItem') {
      if (
        !isDarwin &&
        isRootMenu &&
        item.accessKey !== null &&
        shortcut.altKey &&
        !shortcut.ctrlKey &&
        !shortcut.metaKey &&
        !shortcut.shiftKey &&
        normalizeShortcutKey(shortcut.key) ===
          normalizeShortcutKey(item.accessKey)
      ) {
        return {
          accelerator: `Alt+${item.accessKey.toUpperCase()}`,
          label: item.label,
        }
      }

      const conflict = findCommitDetailsShortcutConflict(
        item.menu,
        shortcut,
        isDarwin,
        false
      )
      if (conflict !== null) {
        return conflict
      }
      continue
    }

    if (item.type !== 'separator' && item.accelerator !== null) {
      const acceleratorShortcut = parseAccelerator(item.accelerator, isDarwin)
      if (
        acceleratorShortcut !== null &&
        commitDetailsShortcutsEqual(acceleratorShortcut, shortcut)
      ) {
        return { accelerator: item.accelerator, label: item.label }
      }
    }
  }

  return null
}

export function isEditableCommitDetailsShortcutTarget(
  target: EventTarget | null
) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
      ) !== null)
  )
}

export function shouldIgnoreCommitDetailsShortcutTarget(
  event: ICommitDetailsShortcut,
  target: EventTarget | null
) {
  if (isEditableCommitDetailsShortcutTarget(target)) {
    return true
  }

  if (!(target instanceof HTMLElement)) {
    return false
  }

  const interactiveTarget = target.closest(
    'a[href], button, summary, [role="button"], [role="checkbox"], [role="combobox"], [role="link"], [role="listbox"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="radio"], [role="slider"], [role="spinbutton"], [role="switch"], [role="tab"], [role="treeitem"]'
  )

  if (interactiveTarget === null) {
    return false
  }

  return (
    hasModifier(event) ||
    !isSinglePrintableShortcutKey(event.key) ||
    event.key === ' '
  )
}

function getShortcutKeyLabel(key: string) {
  switch (key) {
    case ' ':
      return 'Space'
    case '+':
      return 'Plus'
    case 'Escape':
      return 'Esc'
    case 'ArrowUp':
      return '↑'
    case 'ArrowDown':
      return '↓'
    case 'ArrowLeft':
      return '←'
    case 'ArrowRight':
      return '→'
    default:
      return asciiLetterPattern.test(key) ? key.toUpperCase() : key
  }
}

export function getCommitDetailsToggleShortcutLabel(
  shortcut: CommitDetailsShortcut,
  isDarwin = __DARWIN__
) {
  if (shortcut === 'off') {
    return null
  }

  const modifiers = isDarwin
    ? [
        shortcut.ctrlKey ? '⌃' : null,
        shortcut.altKey ? '⌥' : null,
        shortcut.shiftKey ? '⇧' : null,
        shortcut.metaKey ? '⌘' : null,
      ]
    : [
        shortcut.ctrlKey ? 'Ctrl' : null,
        shortcut.altKey ? 'Alt' : null,
        shortcut.shiftKey ? 'Shift' : null,
        shortcut.metaKey ? 'Meta' : null,
      ]

  const separator = isDarwin ? '' : '+'
  return [
    ...modifiers.filter((value): value is string => value !== null),
    getShortcutKeyLabel(shortcut.key),
  ].join(separator)
}

export function getCommitDetailsAriaKeyShortcuts(
  shortcut: CommitDetailsShortcut
) {
  if (shortcut === 'off') {
    return undefined
  }

  const key =
    shortcut.key === ' '
      ? 'Space'
      : shortcut.key === '+'
      ? 'Plus'
      : asciiLetterPattern.test(shortcut.key)
      ? shortcut.key.toUpperCase()
      : shortcut.key

  return [
    shortcut.ctrlKey ? 'Control' : null,
    shortcut.altKey ? 'Alt' : null,
    shortcut.shiftKey ? 'Shift' : null,
    shortcut.metaKey ? 'Meta' : null,
    key,
  ]
    .filter((value): value is string => value !== null)
    .join('+')
}

export function shouldExpandCommitDetailsByDefault(
  selectedCommitCount: number,
  expandCommitDetailsByDefault: boolean
) {
  return selectedCommitCount === 1 && expandCommitDetailsByDefault
}

export interface ICommitDetailsPreferencesDraft {
  readonly expandCommitDetailsByDefault: boolean
  readonly expandCommitDetailsByDefaultDirty: boolean
  readonly commitDetailsShortcut: CommitDetailsShortcut
  readonly commitDetailsShortcutDirty: boolean
}

export function reconcileCommitDetailsPreferencesDraft(
  draft: ICommitDetailsPreferencesDraft,
  preferences: Pick<
    ICommitDetailsPreferencesDraft,
    'expandCommitDetailsByDefault' | 'commitDetailsShortcut'
  >
): Pick<
  ICommitDetailsPreferencesDraft,
  'expandCommitDetailsByDefault' | 'commitDetailsShortcut'
> | null {
  const expandCommitDetailsByDefault = draft.expandCommitDetailsByDefaultDirty
    ? draft.expandCommitDetailsByDefault
    : preferences.expandCommitDetailsByDefault
  const commitDetailsShortcut = draft.commitDetailsShortcutDirty
    ? draft.commitDetailsShortcut
    : preferences.commitDetailsShortcut

  return expandCommitDetailsByDefault === draft.expandCommitDetailsByDefault &&
    commitDetailsShortcutsEqual(
      commitDetailsShortcut,
      draft.commitDetailsShortcut
    )
    ? null
    : { expandCommitDetailsByDefault, commitDetailsShortcut }
}
