import { useEffect, useRef, useState } from 'react'
import type { CRSQuestion } from '@crs/types'
import { supabase } from '../lib/supabase'

interface UseActiveQuestionResult {
  question: CRSQuestion | null
  isConnected: boolean
}

export function useActiveQuestion(sessionId: string): UseActiveQuestionResult {
  const [question, setQuestion] = useState<CRSQuestion | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  // Keep a ref to the latest question so the channel callback always has fresh state
  const questionRef = useRef<CRSQuestion | null>(null)

  useEffect(() => {
    if (!sessionId) return

    // Fetch the current active question immediately on mount
    supabase
      .from('crs_questions')
      .select('*')
      .eq('session_id', sessionId)
      .in('status', ['ACTIVE', 'PENDING', 'CLOSED'])
      .order('sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const q = data as CRSQuestion
          questionRef.current = q
          setQuestion(q)
        }
      })

    const channel = supabase
      .channel(`questions:session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crs_questions',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const incoming = payload.new as CRSQuestion | null
          if (!incoming || !incoming.id) return

          // Always replace: the latest event reflects the current DB state
          questionRef.current = incoming
          setQuestion(incoming)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId])

  return { question, isConnected }
}
