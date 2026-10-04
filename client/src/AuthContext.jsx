import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'
import { forgetPush } from './utils/native'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (credentials) => {
    await api.login(credentials)
    const { user } = await api.me()
    setUser(user)
  }

  // A free account from the app (/signup).
  const signup = async (details) => {
    await api.signup(details)
    const { user } = await api.me()
    setUser(user)
  }

  const register = async (details) => {
    await api.register(details)
    const { user } = await api.me()
    setUser(user)
  }

  const acceptInvite = async (token, password) => {
    await api.acceptInvite(token, password)
    const { user } = await api.me()
    setUser(user)
  }

  const logout = async () => {
    await forgetPush()
    await api.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, register, logout, acceptInvite, updateUser: (u) => setUser((prev) => ({ ...prev, ...u })), refreshUser: () => api.me().then(({ user }) => setUser(user)).catch(() => {}) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
