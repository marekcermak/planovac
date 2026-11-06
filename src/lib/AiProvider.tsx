import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { invokeFunction } from './functions'

export type AiStatus = {
  configured: boolean
  enabled: boolean
  model: string
  limit_czk: number
  spent_czk: number
  by_feature: Record<string, { calls: number; czk: number }>
}

type AiState = {
  status: AiStatus | null
  /** AI tlačítka zobrazit jen když je zapnuto, klíč je na serveru a limit není vyčerpaný. */
  available: boolean
  refresh: () => Promise<void>
}

const AiContext = createContext<AiState>({ status: null, available: false, refresh: async () => {} })

export function AiProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AiStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await invokeFunction<AiStatus>('ai', { feature: 'status' }))
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const available = !!status && status.configured && status.enabled && status.spent_czk < status.limit_czk
  return <AiContext.Provider value={{ status, available, refresh }}>{children}</AiContext.Provider>
}

export function useAi() {
  return useContext(AiContext)
}

/** Volání AI funkce; po něm obnoví útratu. */
export async function callAi<T>(feature: string, body: Record<string, unknown>, refresh?: () => Promise<void>): Promise<T> {
  try {
    return await invokeFunction<T>('ai', { feature, ...body })
  } finally {
    void refresh?.()
  }
}
