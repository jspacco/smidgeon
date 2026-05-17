import type { QuestionType } from '@crs/types'

interface QuestionTypeSelectorProps {
  value: QuestionType
  onChange: (type: QuestionType) => void
  disabled: boolean
}

const OPTIONS: { type: QuestionType; label: string }[] = [
  { type: 'MCQ_SINGLE', label: 'MCQ Single' },
  { type: 'MCQ_MULTI', label: 'MCQ Multi' },
  { type: 'FREE_RESPONSE', label: 'Free Response' },
]

export function QuestionTypeSelector({ value, onChange, disabled }: QuestionTypeSelectorProps) {
  return (
    <fieldset>
      <legend className="sr-only">Question type</legend>
      <div className="flex rounded-lg border border-gray-300 overflow-hidden" role="radiogroup" aria-label="Question type">
        {OPTIONS.map(({ type, label }, i) => (
          <label
            key={type}
            className={[
              'flex-1 text-center text-sm py-2 px-1 cursor-pointer transition-colors font-medium',
              i > 0 ? 'border-l border-gray-300' : '',
              value === type
                ? 'bg-blue-600 text-white'
                : disabled
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            <input
              type="radio"
              name="question-type"
              value={type}
              checked={value === type}
              onChange={() => !disabled && onChange(type)}
              disabled={disabled}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
