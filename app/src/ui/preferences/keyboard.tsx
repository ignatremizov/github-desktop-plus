import * as React from 'react'

import {
  CommitDetailsShortcut,
  createCommitDetailsShortcut,
  findCommitDetailsShortcutConflict,
  getCommitDetailsToggleShortcutLabel,
} from '../../lib/commit-details'
import { IMenu } from '../../models/app-menu'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { setIgnoreMenuShortcuts } from '../main-process-proxy'

interface IKeyboardPreferencesProps {
  readonly appMenu: IMenu | undefined
  readonly commitDetailsShortcut: CommitDetailsShortcut
  readonly onIgnoreMenuShortcutsChanged?: (ignore: boolean) => void
  readonly onCommitDetailsShortcutChanged: (
    shortcut: CommitDetailsShortcut
  ) => void
}

interface IKeyboardPreferencesState {
  readonly isRecording: boolean
  readonly conflictMessage: string | null
}

export class Keyboard extends React.Component<
  IKeyboardPreferencesProps,
  IKeyboardPreferencesState
> {
  private readonly pressedCodes = new Set<string>()
  private readonly consumedCodes = new Set<string>()
  private isConsumingChord = false
  private areCaptureListenersAttached = false
  private isUnmounted = false

  public constructor(props: IKeyboardPreferencesProps) {
    super(props)
    this.state = { isRecording: false, conflictMessage: null }
  }

  public componentWillUnmount() {
    this.isUnmounted = true

    if (this.isConsumingChord) {
      return
    }

    if (this.pressedCodes.size === 0) {
      this.stopCapturing()
      return
    }

    this.consumePressedCodes()
  }

  private setIgnoreMenuShortcuts = (ignore: boolean) => {
    const setIgnore =
      this.props.onIgnoreMenuShortcutsChanged ?? setIgnoreMenuShortcuts
    setIgnore(ignore)
  }

  private onStartRecording = () => {
    if (this.isConsumingChord) {
      return
    }

    this.pressedCodes.clear()
    this.consumedCodes.clear()
    this.attachCaptureListeners()
    this.setIgnoreMenuShortcuts(true)
    this.setState({ isRecording: true, conflictMessage: null })
  }

  private attachCaptureListeners = () => {
    if (this.areCaptureListenersAttached) {
      return
    }

    window.addEventListener('keydown', this.onWindowKeyDown, true)
    window.addEventListener('keyup', this.onWindowKeyUp, true)
    window.addEventListener('blur', this.onWindowBlur)
    this.areCaptureListenersAttached = true
  }

  private detachCaptureListeners = () => {
    if (!this.areCaptureListenersAttached) {
      return
    }

    window.removeEventListener('keydown', this.onWindowKeyDown, true)
    window.removeEventListener('keyup', this.onWindowKeyUp, true)
    window.removeEventListener('blur', this.onWindowBlur)
    this.areCaptureListenersAttached = false
  }

  private stopCapturing = () => {
    this.pressedCodes.clear()
    this.consumedCodes.clear()
    this.isConsumingChord = false
    this.detachCaptureListeners()
    this.setIgnoreMenuShortcuts(false)
  }

  private cancelRecording = () => {
    if (this.pressedCodes.size > 0) {
      this.consumePressedCodes()
    } else {
      this.stopCapturing()
    }

    if (!this.isUnmounted) {
      this.setState({ isRecording: false })
    }
  }

  private onClearShortcut = () => {
    this.props.onCommitDetailsShortcutChanged('off')
    this.stopCapturing()
    this.setState({ isRecording: false, conflictMessage: null })
  }

  private getModifierToken = (key: string) => {
    switch (key) {
      case 'Alt':
      case 'AltGraph':
        return 'modifier:Alt'
      case 'Control':
        return 'modifier:Control'
      case 'Meta':
        return 'modifier:Meta'
      case 'Shift':
        return 'modifier:Shift'
      default:
        return null
    }
  }

  private addActiveModifierTokens = (event: KeyboardEvent) => {
    if (event.altKey) {
      this.consumedCodes.add('modifier:Alt')
    }
    if (event.ctrlKey) {
      this.consumedCodes.add('modifier:Control')
    }
    if (event.metaKey) {
      this.consumedCodes.add('modifier:Meta')
    }
    if (event.shiftKey) {
      this.consumedCodes.add('modifier:Shift')
    }
  }

  private consumePressedCodes = (event?: KeyboardEvent) => {
    this.consumedCodes.clear()
    for (const code of this.pressedCodes) {
      this.consumedCodes.add(code)
    }
    if (event !== undefined) {
      this.addActiveModifierTokens(event)
    }
    this.isConsumingChord = true
  }

  private finishRecording = (event: KeyboardEvent) => {
    this.consumePressedCodes(event)
    this.setState({ isRecording: false })
  }

  private consumeRecorderEvent = (event: KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  private getRecorderEventCode = (event: KeyboardEvent) =>
    event.code || event.key

  private onWindowKeyDown = (event: KeyboardEvent) => {
    const code = this.getRecorderEventCode(event)
    const modifierToken = this.getModifierToken(event.key)
    if (
      this.consumedCodes.has(code) ||
      (modifierToken !== null && this.consumedCodes.has(modifierToken))
    ) {
      this.consumeRecorderEvent(event)
      return
    }

    if (!this.state.isRecording) {
      return
    }

    this.consumeRecorderEvent(event)
    this.pressedCodes.add(code)

    if (event.repeat) {
      return
    }

    if (event.key === 'Escape') {
      this.finishRecording(event)
      return
    }

    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      this.props.onCommitDetailsShortcutChanged('off')
      this.setState({ conflictMessage: null })
      this.finishRecording(event)
      return
    }

    const shortcut = createCommitDetailsShortcut(event)
    if (shortcut === null) {
      return
    }

    const conflict = findCommitDetailsShortcutConflict(
      this.props.appMenu,
      shortcut
    )
    if (conflict !== null) {
      const label = conflict.label.replace(/&/g, '')
      const shortcutLabel = getCommitDetailsToggleShortcutLabel(shortcut)
      this.setState({
        conflictMessage: `${shortcutLabel} is already used by ${label}. Choose another shortcut.`,
      })
      this.finishRecording(event)
      return
    }

    this.props.onCommitDetailsShortcutChanged(shortcut)
    this.setState({ conflictMessage: null })
    this.finishRecording(event)
  }

  private onWindowKeyUp = (event: KeyboardEvent) => {
    const code = this.getRecorderEventCode(event)
    const modifierToken = this.getModifierToken(event.key)

    if (this.isConsumingChord) {
      const consumesCode = this.consumedCodes.has(code)
      const consumesModifier =
        modifierToken !== null && this.consumedCodes.has(modifierToken)
      if (!consumesCode && !consumesModifier) {
        return
      }

      this.consumeRecorderEvent(event)
      this.consumedCodes.delete(code)
      if (modifierToken !== null) {
        this.consumedCodes.delete(modifierToken)
      }
      this.pressedCodes.delete(code)
      if (this.consumedCodes.size === 0) {
        this.stopCapturing()
      }
      return
    }

    if (this.state.isRecording && this.pressedCodes.has(code)) {
      this.consumeRecorderEvent(event)
      this.pressedCodes.delete(code)
      return
    }
  }

  private onWindowBlur = () => {
    this.stopCapturing()
    if (!this.isUnmounted) {
      this.setState({ isRecording: false })
    }
  }

  private onRecorderBlur = () => {
    if (this.state.isRecording) {
      this.cancelRecording()
    }
  }

  public render() {
    const shortcutLabel =
      getCommitDetailsToggleShortcutLabel(this.props.commitDetailsShortcut) ??
      'Off'
    const recorderLabel = this.state.isRecording
      ? 'Press shortcut…'
      : shortcutLabel
    const accessibleStatus = this.state.isRecording
      ? 'Recording shortcut. Press a key combination.'
      : this.state.conflictMessage ?? `Current shortcut: ${shortcutLabel}.`

    return (
      <DialogContent>
        <div className="advanced-section keyboard-shortcuts-section">
          <h2>History</h2>

          <label
            id="commit-details-shortcut-label"
            htmlFor="commit-details-shortcut-recorder"
          >
            Toggle selected commit details
          </label>
          <div className="shortcut-recorder-controls">
            <Button
              id="commit-details-shortcut-recorder"
              className="shortcut-recorder"
              onClick={this.onStartRecording}
              onBlur={this.onRecorderBlur}
              ariaLabel={`Toggle selected commit details shortcut. ${accessibleStatus}`}
              ariaDescribedBy="commit-details-shortcut-description"
            >
              {recorderLabel}
            </Button>
            <Button
              onClick={this.onClearShortcut}
              disabled={this.props.commitDetailsShortcut === 'off'}
            >
              Clear
            </Button>
          </div>

          <div
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {accessibleStatus}
          </div>

          {this.state.conflictMessage !== null && (
            <p className="shortcut-recorder-error" role="alert">
              {this.state.conflictMessage}
            </p>
          )}

          <p
            id="commit-details-shortcut-description"
            className="settings-description"
          >
            Select the shortcut field, then press a key combination. Press
            Escape to cancel or Clear to disable it. The shortcut is available
            throughout History except while typing, when the focused control
            uses that key, or while a dialog or menu is open.
          </p>
        </div>
      </DialogContent>
    )
  }
}
