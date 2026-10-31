import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { ChatMessage as ApiChatMessage, ChatResponse, Citation } from '@/api/types'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  insufficient_evidence?: boolean | null
  isPending?: boolean
  isError?: boolean
  errorMessage?: string
  originalQuestion?: string
}

export function useChat(analysisId: string) {
  const [messages, setMessages] = React.useState<ChatTurn[]>([])

  const chatMutation = useMutation<ChatResponse, Error, { question: string; history: ApiChatMessage[] }>({
    mutationFn: ({ question, history }) => api.chat(analysisId, { question, history }),
  })

  const sendMessage = React.useCallback(
    async (questionText: string) => {
      const q = questionText.trim()
      if (!q || chatMutation.isPending) return

      const userTurnId = `user-${Date.now()}`
      const asstTurnId = `asst-${Date.now()}`

      const userTurn: ChatTurn = {
        id: userTurnId,
        role: 'user',
        content: q,
      }

      const pendingAsstTurn: ChatTurn = {
        id: asstTurnId,
        role: 'assistant',
        content: '',
        isPending: true,
        originalQuestion: q,
      }

      // History consists of the last 10 non-error, non-pending turns
      const history: ApiChatMessage[] = messages
        .filter((m) => !m.isPending && !m.isError && m.content)
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }))

      setMessages((prev) => [...prev, userTurn, pendingAsstTurn])

      try {
        const res = await chatMutation.mutateAsync({ question: q, history })
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === asstTurnId
              ? {
                  ...msg,
                  content: res.answer,
                  citations: res.citations,
                  insufficient_evidence: res.insufficient_evidence,
                  isPending: false,
                }
              : msg,
          ),
        )
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to query model'
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === asstTurnId
              ? {
                  ...msg,
                  isPending: false,
                  isError: true,
                  errorMessage: errorMsg,
                }
              : msg,
          ),
        )
      }
    },
    [chatMutation, messages],
  )

  const retryTurn = React.useCallback(
    (turnId: string) => {
      const turn = messages.find((m) => m.id === turnId)
      const q = turn?.originalQuestion
      if (!q) return

      // Remove the errored assistant turn and re-send
      setMessages((prev) => prev.filter((m) => m.id !== turnId))
      void sendMessage(q)
    },
    [messages, sendMessage],
  )

  const clearMessages = React.useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    sendMessage,
    retryTurn,
    clearMessages,
    isPending: chatMutation.isPending,
  }
}
