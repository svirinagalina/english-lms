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

  listLessons: () => request('/lessons'),
  createLesson: (body) => request('/lessons', { method: 'POST', body }),
  getLesson: (id) => request(`/lessons/${id}`),
  addStudent: (lessonId, studentId) =>
    request(`/lessons/${lessonId}/students`, { method: 'POST', body: { studentId } }),
  removeStudent: (lessonId, studentId) =>
    request(`/lessons/${lessonId}/students/${studentId}`, { method: 'DELETE' })
}
