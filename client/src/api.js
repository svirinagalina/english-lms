async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  registrationStatus: () => request('/auth/registration-status'),

  listUsers: () => request('/users'),
  createUser: (body) => request('/users', { method: 'POST', body }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  myBilling: () => request('/billing/me'),
  updateStudentBilling: (id, body) => request(`/billing/students/${id}`, { method: 'PATCH', body }),
  schoolPaymentDetails: () => request('/billing/school'),
  updateSchoolPaymentDetails: (body) => request('/billing/school', { method: 'PATCH', body }),

  listUnits: () => request('/units'),
  getUnit: (id) => request(`/units/${id}`),
  submitAttempt: (exerciseId, answer) =>
    request(`/units/exercises/${exerciseId}/attempt`, { method: 'POST', body: { answer } }),
  unitProgress: (id) => request(`/units/${id}/progress`),

  listVocabSets: () => request('/vocab'),
  createVocabSet: (body) => request('/vocab', { method: 'POST', body }),
  getVocabSet: (id) => request(`/vocab/${id}`),
  deleteVocabSet: (id) => request(`/vocab/${id}`, { method: 'DELETE' }),
  addCard: (setId, body) => request(`/vocab/${setId}/cards`, { method: 'POST', body }),
  addCardsBulk: (setId, text) =>
    request(`/vocab/${setId}/cards/bulk`, { method: 'POST', body: { text } }),
  deleteCard: (setId, cardId) =>
    request(`/vocab/${setId}/cards/${cardId}`, { method: 'DELETE' }),
  studyVocab: (setId) => request(`/vocab/${setId}/study`),
  reviewCard: (cardId, correct) =>
    request(`/vocab/cards/${cardId}/review`, { method: 'POST', body: { correct } }),
  checkCard: (cardId, answer) =>
    request(`/vocab/cards/${cardId}/check`, { method: 'POST', body: { answer } }),

  listLessons: () => request('/lessons'),
  createLesson: (body) => request('/lessons', { method: 'POST', body }),
  getLesson: (id) => request(`/lessons/${id}`),
  addStudent: (lessonId, studentId) =>
    request(`/lessons/${lessonId}/students`, { method: 'POST', body: { studentId } }),
  removeStudent: (lessonId, studentId) =>
    request(`/lessons/${lessonId}/students/${studentId}`, { method: 'DELETE' })
}
