import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { CountUpTimer, QRCode, ReconnectingIndicator } from '@crs/ui'
import { IconChartBar, IconDoorExit, IconGripVertical } from '@tabler/icons-react'
import type { Course, CRSSession, CRSQuestion, QuestionType } from '@crs/types'

interface AppSettings {
  optionCount: number
  multiAnswer: boolean
  screenshotsOn: boolean
  selectedDisplayId: number | null
}

interface DisplayInfo {
  id: number
  x: number
  y: number
  width: number
  height: number
  scale_factor: number
  is_primary: boolean
}

export interface ControllerToolbarProps {
  session: CRSSession
  course: Course
  currentQuestion: CRSQuestion | null
  respondentCount: number
  isConnected: boolean
  selectedType: QuestionType
  onTypeChange: (t: QuestionType) => void
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
  onSaveToCourseDefaults: (optionCount: number, multiAnswer: boolean, screenshotsOn: boolean) => void
  onLaunch: () => void
  onStop: () => void
  onRevote: () => void
  onToggleResults: () => void
  onOpenQR: () => void
  onEndSession: () => void
  showRevoteButton: boolean
  resultsVisible: boolean
}

const TYPE_LABELS: Record<QuestionType, string> = {
  MCQ_SINGLE: 'MCQ Single',
  MCQ_MULTI: 'MCQ Multi',
  FREE_RESPONSE: 'Free Response',
}

const ALL_TYPES: QuestionType[] = ['MCQ_SINGLE', 'MCQ_MULTI', 'FREE_RESPONSE']

// Detect macOS at runtime — used to show/hide the permission check UI.
const IS_MACOS =
  typeof navigator !== 'undefined' &&
  (navigator.platform.includes('Mac') || navigator.userAgent.includes('Macintosh'))

// Base URL of the student PWA. Self-hosters set VITE_STUDENT_APP_URL in their
// deployment environment; Spacco's own deployment uses the default.
const STUDENT_APP_URL =
  (import.meta.env.VITE_STUDENT_APP_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://smidgeon.app'


export function ControllerToolbar({
  session,
  course,
  currentQuestion,
  respondentCount,
  isConnected,
  selectedType,
  onTypeChange,
  settings,
  onSettingsChange,
  onSaveToCourseDefaults,
  onLaunch,
  onStop,
  onRevote,
  onToggleResults,
  onOpenQR,
  onEndSession,
  showRevoteButton,
  resultsVisible,
}: ControllerToolbarProps) {
  const [showSettings, setShowSettings] = useState(false)

  // Scope toggle: 'session' = ephemeral only; 'course' = persist to course row on change
  const [saveScope, setSaveScope] = useState<'session' | 'course'>('session')

  // Display enumeration
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  // Permission check state (local to the settings panel)
  type PermStatus = 'idle' | 'checking' | 'granted' | 'denied'
  const [permStatus, setPermStatus] = useState<PermStatus>('idle')
  const [permMsg, setPermMsg] = useState<string | null>(null)

  // Whether the current OS version supports screenshots (macOS 14+ required).
  // Default true to avoid a flash of disabled state before the check resolves.
  const [screenshotSupported, setScreenshotSupported] = useState<boolean>(true)

  // Resize the Tauri window to reveal the settings panel when open.
  // 460px gives room for display picker + permission UI.
  useEffect(() => {
    const win = getCurrentWindow()
    if (showSettings) {
      void win.setSize(new LogicalSize(480, 460))
      void loadDisplays()
      void loadScreenshotSupport()
    } else {
      void win.setSize(new LogicalSize(480, 60))
      setPermStatus('idle')
      setPermMsg(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings])

  async function loadDisplays() {
    try {
      const list = await invoke<DisplayInfo[]>('list_displays')
      setDisplays(list)
      // null = auto mode — do NOT force a specific display on load.
      // Users can pick a specific display manually; auto is the default.
    } catch (err) {
      console.error('Failed to list displays:', err)
    }
  }

  async function loadScreenshotSupport() {
    try {
      const supported = await invoke<boolean>('supports_screenshot_capture')
      setScreenshotSupported(supported)
    } catch {
      // Conservatively disable if we can't determine support.
      setScreenshotSupported(false)
    }
  }

  // Message shown whenever screen recording permission is denied.
  // Unconditionally states that a restart is required after granting permission —
  // macOS permission grants never apply to the already-running process for
  // Screen Recording. This is true without exception (despite Apple's system
  // dialog hedging with "may require"). Both recovery buttons are always shown
  // together so a user who already granted permission in a previous attempt can
  // immediately choose "Quit and Reopen" without clicking "Open Privacy Settings" again.
  const PERMISSION_DENIED_MSG =
    'Screen recording permission is required for screenshots. Open System Settings ' +
    'to grant it if you haven\u2019t yet. After granting permission, you must quit and ' +
    'reopen Smidgeon \u2014 on macOS, permission grants never apply to the already-running ' +
    'process, even though System Settings may say this \u201cmay\u201d be required. For ' +
    'Screen Recording specifically, it always is.'

  /**
   * Check (and request) screen recording permission via the Rust command.
   * On macOS, check_screen_recording_permission calls scap::request_permission()
   * if not already granted, which triggers the OS dialog on the first call.
   */
  async function checkPermission() {
    setPermStatus('checking')
    setPermMsg(null)
    try {
      const result = await invoke<string>('check_screen_recording_permission')
      if (result === 'granted') {
        setPermStatus('granted')
        setPermMsg('Screen recording permission confirmed.')
      } else {
        setPermStatus('denied')
        setPermMsg(PERMISSION_DENIED_MSG)
      }
    } catch (err) {
      setPermStatus('denied')
      setPermMsg(PERMISSION_DENIED_MSG)
      console.error('Screen recording permission check failed:', err)
    }
  }

  // Screenshots always persists to the course row (no scope choice — there is no
  // per-question screenshots override in crs_questions).
  async function handleScreenshotsToggle(newValue: boolean) {
    if (newValue === true) {
      // Call check_screen_recording_permission, which internally calls
      // scap::request_permission() if not already granted — this triggers
      // the macOS OS dialog on first use. A capture attempt (the previous
      // approach) bypassed request_permission() entirely, so the dialog
      // was never shown and the toggle was a dead end.
      setPermStatus('checking')
      setPermMsg(null)
      try {
        const result = await invoke<string>('check_screen_recording_permission')
        if (result === 'granted') {
          setPermStatus('granted')
          setPermMsg('Screen recording permission confirmed.')
          const next = { ...settings, screenshotsOn: true }
          onSettingsChange(next)
          onSaveToCourseDefaults(next.optionCount, next.multiAnswer, true)
        } else {
          setPermStatus('denied')
          setPermMsg(PERMISSION_DENIED_MSG)
          // Do NOT flip screenshotsOn to true — leave it off until permission is confirmed.
        }
      } catch (err) {
        setPermStatus('denied')
        setPermMsg(PERMISSION_DENIED_MSG)
        console.error('Screen recording permission check failed:', err)
      }
    } else {
      const next = { ...settings, screenshotsOn: false }
      onSettingsChange(next)
      onSaveToCourseDefaults(next.optionCount, next.multiAnswer, false)
      setPermStatus('idle')
      setPermMsg(null)
    }
  }

  function handleOptionCountChange(n: number) {
    const next = { ...settings, optionCount: n }
    onSettingsChange(next)
    if (saveScope === 'course') {
      onSaveToCourseDefaults(n, next.multiAnswer, next.screenshotsOn)
    }
  }

  function handleMultiAnswerChange(value: boolean) {
    const next = { ...settings, multiAnswer: value }
    onSettingsChange(next)
    if (saveScope === 'course') {
      onSaveToCourseDefaults(next.optionCount, value, next.screenshotsOn)
    }
  }

  const isActive = currentQuestion?.status === 'ACTIVE'
  const hasQuestion = currentQuestion !== null

  return (
    <div className="relative">
      {/* Reconnecting indicator — thin stripe at top when disconnected */}
      {!isConnected && (
        <div className="absolute top-0 left-0 right-0 z-10">
          <ReconnectingIndicator isConnected={isConnected} />
        </div>
      )}

      {/* Main toolbar row — 60px tall */}
      <div
        data-tauri-drag-region
        className="flex items-center h-15 bg-gray-900 border-b border-gray-700 px-1 gap-1 cursor-move"
        style={{ height: 60 }}
        role="toolbar"
        aria-label="CRS Controller"
      >
        {/* Drag handle */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-center w-4 shrink-0 cursor-move select-none text-gray-600 hover:text-gray-400"
          style={{ height: 60 }}
          aria-hidden="true"
        >
          <IconGripVertical size={14} style={{ pointerEvents: 'none' }} />
        </div>

        {/* Mini QR — decorative, clicking opens full-size QR window */}
        <span title="Show QR code">
          <button
            onClick={onOpenQR}
            className="flex items-center justify-center w-11 h-11 rounded-lg shrink-0 overflow-hidden hover:ring-2 hover:ring-cyan-500 transition-all"
            aria-label="Toggle QR code window"
            data-tooltip="Show QR code"
          >
            <QRCode
              value={`${STUDENT_APP_URL}/join?token=${session.qr_token}`}
              size={40}
              colorDark="#06B6D4"
              colorLight="#0D1117"
              margin={1}
            />
          </button>
        </span>

        {/* Launch split button (idle) / Stop button (active) */}
        {isActive ? (
          <span title="Stop question">
            <button
              onClick={onStop}
              className="flex items-center justify-center w-14 h-10 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xl font-bold shrink-0 transition-colors"
              aria-label="Stop question"
              data-tooltip="Stop question"
            >
              ■
            </button>
          </span>
        ) : (
          <div className="flex shrink-0">
            <span title="Launch question">
              <button
                onClick={onLaunch}
                className="flex items-center justify-center w-10 h-10 rounded-l-lg rounded-r-none bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-xl font-bold transition-colors"
                aria-label={`Launch ${TYPE_LABELS[selectedType]} question`}
                data-tooltip="Launch question"
              >
                ▶
              </button>
            </span>
            {/* Native select — text hidden, custom ▾ via background-image */}
            <select
              value={selectedType}
              onChange={(e) => onTypeChange(e.target.value as QuestionType)}
              className="h-10 w-6 rounded-r-lg rounded-l-none bg-green-700 hover:bg-green-600 border-l border-green-500 appearance-none cursor-pointer focus:outline-none"
              style={{
                color: 'transparent',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='white'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundSize: '8px 5px',
              }}
              aria-label="Select question type"
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t} style={{ color: 'black', backgroundColor: 'white' }}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Revote button — conditional */}
        {showRevoteButton && currentQuestion && (
          <span title="Revote — peer instruction round 2">
            <button
              onClick={onRevote}
              className="flex items-center justify-center px-3 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium shrink-0 transition-colors"
              aria-label="Launch revote"
              data-tooltip="Revote — peer instruction round 2"
            >
              ↺
            </button>
          </span>
        )}

        {/* Info zone — timer only */}
        <div data-tauri-drag-region className="flex items-center px-2">
          <span data-tauri-drag-region className="text-sm font-mono tabular-nums text-gray-300 shrink-0">
            <CountUpTimer
              startedAt={currentQuestion?.launched_at ?? null}
              running={isActive}
            />
          </span>
        </div>

        {/* Vote count */}
        <div
          data-tauri-drag-region
          className="shrink-0 text-sm font-semibold text-gray-200 whitespace-nowrap px-2"
          aria-live="polite"
          aria-label={`${respondentCount} voted`}
        >
          {respondentCount} voted
        </div>

        {/* Results toggle */}
        <span title={resultsVisible ? 'Hide results from students' : 'Show results to students'}>
          <button
            onClick={onToggleResults}
            disabled={isActive || !hasQuestion}
            className={[
              'flex items-center justify-center px-3 h-10 rounded-lg text-sm font-medium shrink-0 transition-colors',
              isActive || !hasQuestion
                ? 'text-gray-500 cursor-not-allowed'
                : resultsVisible
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200',
            ].join(' ')}
            aria-label={resultsVisible ? 'Hide results from students' : 'Show results to students'}
            aria-pressed={resultsVisible}
            data-tooltip="Show results to students"
          >
            <IconChartBar size={18} stroke={2} aria-hidden="true" />
          </button>
        </span>

        {/* END — primary session end button, always visible when session active */}
        <span title="End session">
          <button
            onClick={onEndSession}
            disabled={isActive}
            className={[
              'flex items-center justify-center px-3 h-10 rounded-lg text-sm font-semibold shrink-0 transition-colors',
              isActive
                ? 'bg-red-900 text-red-700 cursor-not-allowed'
                : 'bg-red-700 hover:bg-red-600 active:bg-red-500 text-white',
            ].join(' ')}
            aria-label="End session"
            data-tooltip="End session"
          >
            <IconDoorExit size={18} stroke={2} aria-hidden="true" />
          </button>
        </span>

        {/* Gear / settings */}
        <span title="Settings">
          <button
            onClick={() => !isActive && setShowSettings((s) => !s)}
            disabled={isActive}
            className={[
              'flex items-center justify-center w-10 h-10 rounded-lg text-lg shrink-0 transition-colors',
              isActive
                ? 'text-gray-600 cursor-not-allowed'
                : showSettings
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white',
            ].join(' ')}
            aria-label="Settings"
            aria-expanded={showSettings}
            aria-haspopup="true"
            data-tooltip="Settings"
          >
            ⚙
          </button>
        </span>
      </div>

      {/* Settings panel — floats below the toolbar */}
      {showSettings && !isActive && (
        <div
          className="absolute right-0 top-full mt-1 w-72 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 space-y-4 z-50"
          role="region"
          aria-label="Session settings"
        >
          {/* Course + session info */}
          <div className="space-y-1">
            <p className="text-xs text-gray-400">
              Course: <span className="text-gray-100 font-medium">{course.name}</span>
            </p>
            <p className="text-xs text-gray-400">
              Join:{' '}
              <span className="text-gray-100 font-mono font-bold tracking-widest">
                {course.join_code}
              </span>
            </p>
            <p className="text-xs text-gray-400">
              Session code:{' '}
              <span className="text-gray-100 font-mono font-bold tracking-widest">
                {session.session_code}
              </span>
            </p>
          </div>

          <hr className="border-gray-600" />

          {/* Question settings */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Question settings
            </p>

            {/* Apply to scope toggle */}
            <div>
              <p className="text-xs text-gray-300 mb-2">Apply to</p>
              <div className="flex gap-2" role="radiogroup" aria-label="Settings scope">
                {([
                  { value: 'session', label: 'This session' },
                  { value: 'course', label: 'This course' },
                ] as const).map(({ value, label }) => (
                  <label
                    key={value}
                    className={[
                      'flex items-center justify-center px-3 h-8 rounded-lg border-2 cursor-pointer text-xs font-medium transition-colors',
                      saveScope === value
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-blue-400',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="settings-scope"
                      checked={saveScope === value}
                      onChange={() => setSaveScope(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* MCQ option count */}
            <div>
              <p className="text-xs text-gray-300 mb-2">MCQ options</p>
              <div
                className="flex gap-2"
                role="radiogroup"
                aria-label="MCQ option count"
              >
                {([2, 3, 4, 5] as const).map((n) => (
                  <label
                    key={n}
                    className={[
                      'flex items-center justify-center w-9 h-9 rounded-lg border-2 cursor-pointer font-semibold text-sm transition-colors',
                      settings.optionCount === n
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-blue-400',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="settings-option-count"
                      value={n}
                      checked={settings.optionCount === n}
                      onChange={() => handleOptionCountChange(n)}
                      className="sr-only"
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>

            {/* Free response multi-answer */}
            <div>
              <p className="text-xs text-gray-300 mb-2">Free response</p>
              <div className="flex gap-2" role="radiogroup" aria-label="Free response submission mode">
                {([
                  { value: false, label: 'Single' },
                  { value: true, label: 'Multi' },
                ] as const).map(({ value, label }) => (
                  <label
                    key={label}
                    className={[
                      'flex items-center justify-center px-3 h-8 rounded-lg border-2 cursor-pointer text-xs font-medium transition-colors',
                      settings.multiAnswer === value
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-blue-400',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="settings-multi-answer"
                      checked={settings.multiAnswer === value}
                      onChange={() => handleMultiAnswerChange(value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Screenshots on/off */}
            <div>
              <p className="text-xs text-gray-300 mb-2">Screenshots</p>
              {IS_MACOS && !screenshotSupported ? (
                <p className="text-xs text-amber-400">
                  Screenshots require macOS 14 or later.
                </p>
              ) : (
                <div className="flex gap-2" role="radiogroup" aria-label="Screenshot capture">
                  {([
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                  ] as const).map(({ value, label }) => (
                    <label
                      key={label}
                      className={[
                        'flex items-center justify-center px-3 h-8 rounded-lg border-2 cursor-pointer text-xs font-medium transition-colors',
                        settings.screenshotsOn === value
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-blue-400',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="settings-screenshots"
                        checked={settings.screenshotsOn === value}
                        onChange={() => void handleScreenshotsToggle(value)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Display picker — shown when screenshots is on */}
            {settings.screenshotsOn && displays.length > 0 && (
              <div>
                <label htmlFor="display-picker" className="text-xs text-gray-300 block mb-2">
                  Capture display
                </label>
                <select
                  id="display-picker"
                  value={settings.selectedDisplayId ?? 'auto'}
                  onChange={(e) => {
                    const val = e.target.value
                    onSettingsChange({
                      ...settings,
                      selectedDisplayId: val === 'auto' ? null : Number(val),
                    })
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="auto">Auto (follow toolbar)</option>
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.width}×{d.height}
                      {d.scale_factor !== 1 ? ` @${d.scale_factor}×` : ''}
                      {d.is_primary ? ' (primary)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* macOS permission check button */}
            {IS_MACOS && (
              <div className="space-y-2">
                <button
                  onClick={() => void checkPermission()}
                  disabled={permStatus === 'checking'}
                  className="w-full text-xs text-gray-300 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  {permStatus === 'checking'
                    ? 'Checking…'
                    : 'Check screen recording permission'}
                </button>

                {permMsg && (
                  <div
                    className={[
                      'text-xs rounded-lg px-3 py-2 space-y-2',
                      permStatus === 'granted'
                        ? 'bg-green-900 text-green-200'
                        : 'bg-amber-900 text-amber-200',
                    ].join(' ')}
                    role="status"
                  >
                    <p>{permMsg}</p>
                    {permStatus === 'denied' && (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => void invoke('open_screen_recording_settings')}
                          className="text-left underline text-amber-300 hover:text-white"
                        >
                          Open Privacy Settings
                        </button>
                        <button
                          type="button"
                          onClick={() => void invoke('relaunch_app')}
                          className="text-left underline text-amber-300 hover:text-white"
                        >
                          Quit and Reopen Smidgeon
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
