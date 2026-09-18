async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const data = await response.json().catch(() => ({}))
  // The sign-in expired while the page was open: go to the login page and
  // come back here afterwards, instead of failing every request.
  if (response.status === 401 && !path.startsWith('/auth/') && !window.location.pathname.startsWith('/login')) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    return new Promise(() => {})
  }
  if (!response.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  version: () => request('/version'),
  registrationStatus: () => request('/auth/registration-status'),

  listPeople: () => request('/users'),
  listTeachers: () => request('/users/teachers'),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  setUserRole: (id, role) => request(`/users/${id}/role`, { method: 'PATCH', body: { role } }),
  updateUser: (id, body) => request(`/users/${id}`, { method: 'PATCH', body }),
  linkStudent: (teacherId, studentId) =>
    request('/users/links', { method: 'POST', body: { teacherId, studentId } }),
  unlinkStudent: (teacherId, studentId) =>
    request(`/users/links/${teacherId}/${studentId}`, { method: 'DELETE' }),

  listInvites: () => request('/invites'),
  createInvite: (body) => request('/invites', { method: 'POST', body }),
  deleteInvite: (id) => request(`/invites/${id}`, { method: 'DELETE' }),
  resendInvite: (id) => request(`/invites/${id}/resend`, { method: 'POST' }),
  mailStatus: () => request('/invites/mail-status'),
  getInvite: (token) => request(`/invites/token/${token}`),
  acceptInvite: (token, password) =>
    request(`/invites/token/${token}/accept`, { method: 'POST', body: { password } }),

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

  statsStudents: () => request('/stats/students'),
  statsStudent: (id) => request(`/stats/students/${id}`),
  statsMe: () => request('/stats/me'),

  assistStatus: () => request('/assist/status'),
  assist: (mode, words) => request('/assist', { method: 'POST', body: { mode, words } }),

  getCall: (token) => request(`/calls/token/${token}`),
  iceServers: () => request('/calls/ice'),
  dictionary: (word) => request(`/dictionary?word=${encodeURIComponent(word)}`),
  uploadWritingImage: (classroomId, data) =>
    request(`/classrooms/${classroomId}/writing/images`, { method: 'POST', body: { data } }),
  createCall: (body) => request('/calls', { method: 'POST', body }),
  listCalls: () => request('/calls'),
  endCall: (id) => request(`/calls/${id}/end`, { method: 'POST' }),

  listClassrooms: () => request('/classrooms'),
  myBoards: () => request('/classrooms/mine'),
  getClassroom: (id) => request(`/classrooms/${id}`),
  allBoards: () => request('/classrooms/boards'),
  createBoard: (id, title) => request(`/classrooms/${id}/boards`, { method: 'POST', body: { title } }),
  renameBoard: (id, boardId, title) =>
    request(`/classrooms/${id}/boards/${boardId}`, { method: 'PATCH', body: { title } }),
  uploadBoardImage: (id, boardId, data) =>
    request(`/classrooms/${id}/boards/${boardId}/images`, { method: 'POST', body: { data } }),
  assignBoard: (id, boardId, targetClassroomId, mode) =>
    request(`/classrooms/${id}/boards/${boardId}/assign`, { method: 'POST', body: { targetClassroomId, mode } }),
  deleteBoard: (id, boardId) =>
    request(`/classrooms/${id}/boards/${boardId}`, { method: 'DELETE' }),
  updateSession: (id, sessionId, body) =>
    request(`/classrooms/${id}/sessions/${sessionId}`, { method: 'PATCH', body }),
  deleteSession: (id, sessionId) =>
    request(`/classrooms/${id}/sessions/${sessionId}`, { method: 'DELETE' }),
  updatePackage: (id, body) => request(`/classrooms/${id}/package`, { method: 'PATCH', body }),

  // Content pipeline (owner and partner)
  listContent: (stage) => request(`/content/items${stage ? `?stage=${stage}` : ''}`),
  createContent: (body) => request('/content/items', { method: 'POST', body }),
  updateContent: (id, body) => request(`/content/items/${id}`, { method: 'PATCH', body }),
  deleteContent: (id) => request(`/content/items/${id}`, { method: 'DELETE' }),
  deleteContentFile: (id, fileId) => request(`/content/items/${id}/files/${fileId}`, { method: 'DELETE' }),
  uploadContentFile: async (id, file) => {
    const response = await fetch(`/api/content/items/${id}/files`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name)
      },
      body: file
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'Upload failed')
    return data
  },
  listApiTokens: () => request('/content/tokens'),
  createApiToken: (name) => request('/content/tokens', { method: 'POST', body: { name } }),
  deleteApiToken: (id) => request(`/content/tokens/${id}`, { method: 'DELETE' })
}
