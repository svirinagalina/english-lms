import { createContext, useContext } from 'react'

// The course page tells its exercises whether to show the answers right
// away: on for teachers (with a button to hide them, e.g. while the screen is
// shared with a student), never for students — they get them on Check.
export const AnswerKeyContext = createContext(false)
export const useAnswerKey = () => useContext(AnswerKeyContext)
