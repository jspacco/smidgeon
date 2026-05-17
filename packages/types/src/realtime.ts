import type { CRSQuestion, CRSResponse } from './database'

export interface QuestionChangedEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: CRSQuestion | null
  old: CRSQuestion | null
}

export interface ResponseInsertedEvent {
  eventType: 'INSERT'
  new: CRSResponse
}
