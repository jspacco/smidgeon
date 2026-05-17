import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CRSQuestion } from '@crs/types'
import type { QuestionChangedEvent } from '@crs/types'

interface UseCurrentQuestionResult {
  question: CRSQuestion | null
  isConnected: boolean
}

export function useCurrentQuestion(sessionId: string | null): UseCurrentQuestionResult {
  const [question, setQuestion] = useState<CRSQuestion | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setQuestion(null)
      setIsConnected(false)
      return
    }

    // Load most recent ACTIVE or CLOSED question on mount
    supabase
      .from('crs_questions')
      .select('*')
      .eq('session_id', sessionId)
      .in('status', ['ACTIVE', 'CLOSED'])
      .order('sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load current question:', error.message)
          return
        }
        setQuestion(data as CRSQuestion | null)
      })

    const channel = supabase
      .channel(`questions:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crs_questions',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const event = payload as unknown as QuestionChangedEvent

          if (event.eventType === 'INSERT' || event.eventType === 'UPDATE') {
            const updated = event.new
            if (updated && (updated.status === 'ACTIVE' || updated.status === 'CLOSED')) {
              setQuestion((prev) => {
                // Accept the new question if it has a higher or equal sequence number
                if (!prev || updated.sequence_number >= prev.sequence_number) {
                  return updated
                }
                // If updating an existing question (same id), always accept
                if (prev.id === updated.id) {
                  return updated
                }
                return prev
              })
            }
          }
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId])

  return { question, isConnected }
}
