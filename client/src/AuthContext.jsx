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
  // Returns { verify, email } when the address has to be confirmed first.
  const signup = async (details) => {
    const result = await api.signup(details)
    if (result.verify) return result
    const { user } = await api.me()
    setUser(user)
    return result
  }
  // The link from the confirmation letter signs the person in.
  const verifyEmail = async (token) => {
    await api.verifyEmail(token)
    const { user } = await api.me()
    setUser(user)
  }

  const register = async (details) => {
    await api.register(details)
    const { user } = await api.me()
    setUser(user)
  }

  const acceptInvite = async (token, password, login) => {
    await api.acceptInvite(token, password, login)
    const { user } = await api.me()
    setUser(user)
  }

  const logout = async () => {
    await forgetPush()
    await api.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, verifyEmail, register, logout, acceptInvite, updateUser: (u) => setUser((prev) => ({ ...prev, ...u })), refreshUser: () => api.me().then(({ user }) => setUser(user)).catch(() => {}) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
