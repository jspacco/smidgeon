import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { createCourse, enrollInstructor } from '../lib/session'
import { Button } from '@crs/ui'

export default function CreateCoursePage() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [defaultOptionCount, setDefaultOptionCount] = useState(5)
  const [defaultMultiAnswer, setDefaultMultiAnswer] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Course name is required.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const course = await createCourse(trimmed, defaultOptionCount, user.id, defaultMultiAnswer, false)
      await enrollInstructor(course.id, user.id)
      navigate(`/courses/${course.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create course. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/courses')}
          className="text-blue-600 font-medium text-sm"
          aria-label="Back to courses"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900">Create Course</h1>
      </header>

      <div className="px-4 py-6 max-w-lg mx-auto">
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-6">
            <label htmlFor="course-name" className="block text-sm font-medium text-gray-700 mb-1">
              Course name
            </label>
            <input
              id="course-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CSCI 241 Databases Winter 26"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={submitting}
            />
          </div>

          <fieldset className="mb-6">
            <legend className="block text-sm font-medium text-gray-700 mb-2">
              Default MCQ option count
            </legend>
            <div className="flex gap-3" role="radiogroup" aria-label="Default MCQ option count">
              {([2, 3, 4, 5] as const).map((n) => (
                <label
                  key={n}
                  className={[
                    'flex items-center justify-center w-12 h-12 rounded-lg border-2 cursor-pointer font-semibold text-lg transition-colors',
                    defaultOptionCount === n
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="option-count"
                    value={n}
                    checked={defaultOptionCount === n}
                    onChange={() => setDefaultOptionCount(n)}
                    className="sr-only"
                    disabled={submitting}
                  />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-8">
            <legend className="block text-sm font-medium text-gray-700 mb-2">
              Default free response mode
            </legend>
            <div className="flex gap-3" role="radiogroup" aria-label="Default free response mode">
              {([
                { value: false, label: 'Single', description: 'One answer, editable' },
                { value: true, label: 'Multiple', description: 'Submit as many as they want' },
              ] as const).map(({ value, label, description }) => (
                <label
                  key={String(value)}
                  className={[
                    'flex flex-col items-center justify-center flex-1 rounded-lg border-2 cursor-pointer px-3 py-3 text-center transition-colors',
                    defaultMultiAnswer === value
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="multi-answer"
                    checked={defaultMultiAnswer === value}
                    onChange={() => setDefaultMultiAnswer(value)}
                    className="sr-only"
                    disabled={submitting}
                  />
                  <span className="font-semibold text-base">{label}</span>
                  <span className="text-xs mt-0.5 text-gray-500">{description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              type="submit"
              size="lg"
              className="flex-1"
              disabled={submitting}
            >
              {submitting ? 'Creating…' : 'Create course'}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              disabled={submitting}
              onClick={() => navigate('/courses')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </main>
  )
}
