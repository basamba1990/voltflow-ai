import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: any | null
  loading: boolean
  signIn: (provider?: 'github' | 'google') => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error)
        return
      }

      setProfile(data)
    } catch (error) {
      console.error('Error in fetchUserProfile:', error)
    }
  }

  const ensureUserProfile = async (user: User) => {
    try {
      const { data: existingProfile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existingProfile) {
        const { error } = await supabase.from('users').insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
          avatar_url: user.user_metadata?.avatar_url,
          role: 'user',
          subscription_plan: 'starter',
          simulations_used: 0,
          simulations_limit: 10,
        })

        if (error) console.error('Error creating user profile:', error)
      }

      await fetchUserProfile(user.id)
    } catch (error) {
      console.error('Error in ensureUserProfile:', error)
    }
  }

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true)
      
      const { data: { session: initialSession } } = await supabase.auth.getSession()
      setSession(initialSession)
      setUser(initialSession?.user ?? null)

      if (initialSession?.user) {
        await ensureUserProfile(initialSession.user)
      }

      setLoading(false)

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, newSession) => {
          console.log('Auth state changed:', event)
          
          setSession(newSession)
          setUser(newSession?.user ?? null)

          if (newSession?.user) {
            await ensureUserProfile(newSession.user)
          } else {
            setProfile(null)
          }

          setLoading(false)
        }
      )

      return () => subscription.unsubscribe()
    }

    initializeAuth()
  }, [])

  const signIn = async (provider: 'github' | 'google' = 'github') => {
    setLoading(true)
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })

    if (error) {
      console.error('Sign in error:', error)
      setLoading(false)
      throw error
    }
  }

  const signOut = async () => {
    setLoading(true)
    
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('Sign out error:', error)
      setLoading(false)
      throw error
    }

    setUser(null)
    setSession(null)
    setProfile(null)
    setLoading(false)
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.id)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
