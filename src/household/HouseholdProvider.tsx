import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import type { Tables } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'

export type Household = Tables<'households'>
export type Member = Tables<'household_members'>

type HouseholdState = {
  loading: boolean
  error: string | null
  household: Household | null
  members: Member[]
  me: Member | null
  isAdmin: boolean
  refresh: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdState | null>(null)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  const refresh = useCallback(async () => {
    if (!userId) {
      setHousehold(null)
      setMembers([])
      setLoading(false)
      return
    }
    setError(null)
    try {
      const { data: mine, error: e1 } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (e1) throw e1
      if (!mine) {
        setHousehold(null)
        setMembers([])
        return
      }
      const [hh, mm] = await Promise.all([
        supabase.from('households').select('*').eq('id', mine.household_id).single(),
        supabase.from('household_members').select('*').eq('household_id', mine.household_id).order('joined_at'),
      ])
      if (hh.error) throw hh.error
      if (mm.error) throw mm.error
      setHousehold(hh.data)
      setMembers(mm.data)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Provider žije uvnitř RequireAuth, takže se při změně uživatele vytvoří znovu
  // (loading začíná na true).
  useEffect(() => {
    void refresh()
  }, [refresh])

  const me = members.find((m) => m.user_id === userId) ?? null

  return (
    <HouseholdContext.Provider
      value={{ loading, error, household, members, me, isAdmin: me?.role === 'admin', refresh }}
    >
      {children}
    </HouseholdContext.Provider>
  )
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold mimo HouseholdProvider')
  return ctx
}
