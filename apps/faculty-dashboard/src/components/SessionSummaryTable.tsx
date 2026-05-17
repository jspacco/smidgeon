import type { CRSQuestion } from '@crs/types'

interface SessionSummaryTableProps {
  questions: CRSQuestion[]
  /** questionId → count of distinct respondents */
  responseCounts: Record<string, number>
}

function questionTypeLabel(type: CRSQuestion['type']): string {
  switch (type) {
    case 'MCQ_SINGLE': return 'MCQ Single'
    case 'MCQ_MULTI': return 'MCQ Multi'
    case 'FREE_RESPONSE': return 'Free Response'
  }
}

export function SessionSummaryTable({ questions, responseCounts }: SessionSummaryTableProps) {
  if (questions.length === 0) {
    return <p className="text-sm text-gray-400">No questions in this session.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Question summary">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">#</th>
            <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
            <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">Options</th>
            <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">Duration (s)</th>
            <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">Responded</th>
            <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">Flags</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-3 font-semibold text-gray-900">{q.sequence_number}</td>
              <td className="px-4 py-3 text-gray-700">{questionTypeLabel(q.type)}</td>
              <td className="px-4 py-3">
                <span
                  className={[
                    'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                    q.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800'
                      : q.status === 'CLOSED'
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-yellow-100 text-yellow-800',
                  ].join(' ')}
                >
                  {q.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {q.option_count ?? '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {q.duration_seconds ?? '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-900 font-medium">
                {responseCounts[q.id] ?? 0}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {q.is_revote && (
                    <span className="inline-block rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
                      Revote
                    </span>
                  )}
                  {q.multi_answer && (
                    <span className="inline-block rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs font-medium">
                      Multi
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
