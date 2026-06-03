import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CRSResponse } from '@crs/types'

interface UseLiveResponsesResult {
  respondentCount: number
  distribution: Record<string, number>
  freeResponses: string[]
  isConnected: boolean
}

export function useLiveResponses(questionId: string | null): UseLiveResponsesResult {
  const [respondentCount, setRespondentCount] = useState(0)
  const [distribution, setDistribution] = useState<Record<string, number>>({})
  const [freeResponses, setFreeResponses] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)

  // Use a ref so the Set persists across renders without triggering re-renders itself
  const respondentSet = useRef<Set<string>>(new Set())
  // Track distribution counts in a ref too, derive display state from it
  const distributionRef = useRef<Record<string, number>>({})
  // Track free responses in a ref
  const freeResponsesRef = useRef<string[]>([])
  // Track each user's current response so we can decrement on UPDATE
  const userResponseRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!questionId) {
      setRespondentCount(0)
      setDistribution({})
      setFreeResponses([])
      setIsConnected(false)
      return
    }

    // Reset state when questionId changes
    respondentSet.current = new Set()
    distributionRef.current = {}
    freeResponsesRef.current = []
    userResponseRef.current = new Map()
    setRespondentCount(0)
    setDistribution({})
    setFreeResponses([])

    // Load existing responses first
    supabase
      .from('crs_responses')
      .select('*')
      .eq('question_id', questionId)
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load existing responses:', error.message)
          return
        }
        if (!data) return

        const responses = data as CRSResponse[]
        const dist: Record<string, number> = {}
        const freeList: string[] = []

        for (const r of responses) {
          respondentSet.current.add(r.user_id)
          // Track distribution — count every response row per answer value
          dist[r.response] = (dist[r.response] ?? 0) + 1
          // Track each user's latest response for UPDATE handling
          userResponseRef.current.set(r.user_id, r.response)
          // Collect free responses
          freeList.push(r.response)
        }

        distributionRef.current = dist
        freeResponsesRef.current = freeList
        setRespondentCount(respondentSet.current.size)
        setDistribution({ ...dist })
        setFreeResponses([...freeList])
      })

    const channel = supabase
      .channel(`responses:${questionId}`)
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

          // Track unique respondents
          respondentSet.current.add(response.user_id)

          // Update distribution
          const dist = distributionRef.current
          dist[response.response] = (dist[response.response] ?? 0) + 1
          distributionRef.current = { ...dist }

          // Record this user's response
          userResponseRef.current.set(response.user_id, response.response)

          // Append free response
          freeResponsesRef.current = [...freeResponsesRef.current, response.response]

          setRespondentCount(respondentSet.current.size)
          setDistribution({ ...distributionRef.current })
          setFreeResponses([...freeResponsesRef.current])
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crs_responses',
          filter: `question_id=eq.${questionId}`,
        },
        (payload) => {
          const response = payload.new as CRSResponse
          const oldResponse = payload.old as Partial<CRSResponse>

          const dist = distributionRef.current

          // Decrement the old answer if we know what it was
          const oldAnswer = oldResponse.response ?? userResponseRef.current.get(response.user_id)
          if (oldAnswer !== undefined && oldAnswer !== response.response) {
            dist[oldAnswer] = Math.max(0, (dist[oldAnswer] ?? 1) - 1)
          }

          // Increment the new answer
          dist[response.response] = (dist[response.response] ?? 0) + 1
          distributionRef.current = { ...dist }

          // Update this user's tracked response
          userResponseRef.current.set(response.user_id, response.response)

          setDistribution({ ...distributionRef.current })
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [questionId])

  return { respondentCount, distribution, freeResponses, isConnected }
}
