import { useState } from 'react'
import { CountUpTimer, ReconnectingIndicator } from '@crs/ui'
import type { Course, CRSSession, CRSQuestion, QuestionType } from '@crs/types'

interface AppSettings {
  optionCount: number
  multiAnswer: boolean
  screenshotsOn: boolean
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

  const isActive = currentQuestion?.status === 'ACTIVE'
  const hasQuestion = currentQuestion !== null

  // Effective type label — show current question's type when active, else selected type
  const typeLabel = currentQuestion
    ? TYPE_LABELS[currentQuestion.type]
    : TYPE_LABELS[selectedType]

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
        {/* QR zone */}
        <button
          onClick={onOpenQR}
          className="flex items-center justify-center w-12 h-10 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors text-xs font-semibold shrink-0"
          aria-label="Open QR code window"
          title="Show QR code for student attendance"
        >
          QR
        </button>

        {/* Play/Stop zone */}
        {isActive ? (
          <button
            onClick={onStop}
            className="flex items-center justify-center w-12 h-10 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xl font-bold shrink-0 transition-colors"
            aria-label="Stop question"
            title="Stop current question"
          >
            ■
          </button>
        ) : (
          <button
            onClick={onLaunch}
            className="flex items-center justify-center w-12 h-10 rounded-lg bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-xl font-bold shrink-0 transition-colors"
            aria-label="Launch question"
            title="Launch new question"
          >
            ▶
          </button>
        )}

        {/* Revote button — conditional */}
        {showRevoteButton && currentQuestion && (
          <button
            onClick={onRevote}
            className="flex items-center justify-center px-3 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium shrink-0 transition-colors"
            aria-label="Launch revote"
            title="Relaunch same question for peer discussion revote"
          >
            ↺
          </button>
        )}

        {/* Info zone — type label + type dropdown + timer */}
        <div className="flex items-center gap-2 flex-1 min-w-0 px-2">
          {/* Type label or dropdown */}
          {isActive || hasQuestion ? (
            <span className="text-sm font-medium text-gray-200 truncate">{typeLabel}</span>
          ) : (
            <label className="sr-only" htmlFor="type-select">
              Question type
            </label>
          )}
          {!isActive && (
            <select
              id="type-select"
              value={selectedType}
              onChange={(e) => onTypeChange(e.target.value as QuestionType)}
              disabled={isActive}
              className="text-xs bg-gray-800 text-gray-200 border border-gray-600 rounded px-1 py-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              aria-label="Question type"
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          )}

          {/* Count-up timer */}
          <span className="text-sm font-mono tabular-nums text-gray-300 shrink-0">
            <CountUpTimer
              startedAt={currentQuestion?.launched_at ?? null}
              running={isActive}
            />
          </span>
        </div>

        {/* Vote count */}
        <div
          className="shrink-0 text-sm font-semibold text-gray-200 whitespace-nowrap px-2"
          aria-live="polite"
          aria-label={`${respondentCount} voted`}
        >
          {respondentCount} voted
        </div>

        {/* Results toggle */}
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
        >
          {resultsVisible ? 'Hide' : 'Results'}
        </button>

        {/* END — primary session end button, always visible when session active */}
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
          title="End session"
        >
          END
        </button>

        {/* Gear / settings */}
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
        >
          ⚙
        </button>
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
                      onChange={() => onSettingsChange({ ...settings, optionCount: n })}
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
                      onChange={() => onSettingsChange({ ...settings, multiAnswer: value })}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Screenshots */}
            <div>
              <p className="text-xs text-gray-300 mb-2">Screenshots</p>
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
                      onChange={() => onSettingsChange({ ...settings, screenshotsOn: value })}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
