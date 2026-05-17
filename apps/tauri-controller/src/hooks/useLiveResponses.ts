import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CRSResponse } from '@crs/types'

interface UseLiveResponsesResult {
  respondentCount: number
  isConnected: boolean
}

// Toolbar only needs count — not distribution (no distribution visible in toolbar per design)
export function useLiveResponses(questionId: string | null): UseLiveResponsesResult {
  const [respondentCount, setRespondentCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)

  const respondentSet = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!questionId) {
      setRespondentCount(0)
      setIsConnected(false)
      return
    }

    // Reset on question change
    respondentSet.current = new Set()
    setRespondentCount(0)

    // Load existing responses to get accurate initial count
    supabase
      .from('crs_responses')
      .select('user_id')
      .eq('question_id', questionId)
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load existing responses:', error.message)
          return
        }
        if (!data) return

        const responses = data as Pick<CRSResponse, 'user_id'>[]
        for (const r of responses) {
          respondentSet.current.add(r.user_id)
        }
        setRespondentCount(respondentSet.current.size)
      })

    const channel = supabase
      .channel(`toolbar-responses:${questionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crs_responses',
          filter: `question_id=eq.${questionId}`,
        },
        (payload) => {
          const response = payload.new as CRSResponse
          respondentSet.current.add(response.user_id)
          setRespondentCount(respondentSet.current.size)
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [questionId])

  return { respondentCount, isConnected }
}
