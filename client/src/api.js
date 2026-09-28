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
  // Something the free tier doesn't include: the page shows the trial-lesson
  // offer (TrialOffer, mounted once in App) on top of whatever it does.
  if (response.status === 403 && data.locked) window.dispatchEvent(new CustomEvent('trial-offer'))
  if (!response.ok) {
    const error = new Error(data.error ?? 'Request failed')
    error.locked = Boolean(data.locked)
    throw error
  }
  return data
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  forgotPassword: (email) => request('/auth/forgot', { method: 'POST', body: { email } }),
  resetInfo: (token) => request(`/auth/reset/${token}`),
  resetPassword: (token, password) => request(`/auth/reset/${token}`, { method: 'POST', body: { password } }),
  me: () => request('/auth/me'),
  version: () => request('/version'),
  registrationStatus: () => request('/auth/registration-status'),
  signupStatus: () => request('/auth/signup-status'),
  signup: (body) => request('/auth/signup', { method: 'POST', body }),
  requestTrial: (body) => request('/profile/trial-request', { method: 'POST', body }),
  deleteMyAccount: (password) => request('/profile', { method: 'DELETE', body: { password } }),
  registerPushDevice: (token) => request('/push/devices', { method: 'POST', body: { token, platform: 'ios' } }),
  unregisterPushDevice: (token) => request('/push/devices', { method: 'DELETE', body: { token } }),
  pushSettings: () => request('/push/settings'),
  savePushSettings: (body) => request('/push/settings', { method: 'PUT', body }),
  clearPushSettings: () => request('/push/settings', { method: 'DELETE' }),
  testPush: () => request('/push/test', { method: 'POST' }),

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
  billingStudents: () => request('/billing/students'),
  eurRate: () => request('/billing/rates'),
  checkout: (plan) => request('/billing/checkout', { method: 'POST', body: { plan } }),
  verifyCheckout: (sessionId) => request(`/billing/checkout/verify?session_id=${encodeURIComponent(sessionId)}`),
  saveStripeKey: (key) => request('/settings/stripe', { method: 'PUT', body: { key } }),
  reportPayment: (note) => request('/billing/me/paid', { method: 'POST', body: { note } }),
  paymentSeen: (id) => request(`/billing/students/${id}/seen`, { method: 'POST' }),
  updateStudentBilling: (id, body) => request(`/billing/students/${id}`, { method: 'PATCH', body }),
  schoolPaymentDetails: () => request('/billing/school'),
  updateSchoolPaymentDetails: (body) => request('/billing/school', { method: 'PATCH', body }),

  listUnits: () => request('/units'),
  getUnit: (id) => request(`/units/${id}`),
  submitAttempt: (exerciseId, answer) =>
    request(`/units/exercises/${exerciseId}/attempt`, { method: 'POST', body: { answer } }),
  unitProgress: (id) => request(`/units/${id}/progress`),

  listVocabSets: () => request('/vocab'),
  dueWords: () => request('/vocab/review/due'),
  createVocabSet: (body) => request('/vocab', { method: 'POST', body }),
  getVocabSet: (id) => request(`/vocab/${id}`),
  deleteVocabSet: (id) => request(`/vocab/${id}`, { method: 'DELETE' }),
  renameVocabSet: (id, title) => request(`/vocab/${id}`, { method: 'PATCH', body: { title } }),
  addCard: (setId, body) => request(`/vocab/${setId}/cards`, { method: 'POST', body }),
  addCardsBulk: (setId, text) =>
    request(`/vocab/${setId}/cards/bulk`, { method: 'POST', body: { text } }),
  deleteCard: (setId, cardId) =>
    request(`/vocab/${setId}/cards/${cardId}`, { method: 'DELETE' }),
  studyVocab: (setId, all) => request(`/vocab/${setId}/study${all ? '?all=1' : ''}`),
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
  addMyWord: (word) => request('/vocab/my/words', { method: 'POST', body: { word } }),
  addBoardWords: (words, classroomId) => request('/vocab/board-words', { method: 'POST', body: { words, classroomId } }),
  activeCall: () => request('/calls/active'),
  textbooks: () => request('/textbooks'),
  uploadTextbook: async (file, title, pages) => {
    const response = await fetch(`/api/textbooks?title=${encodeURIComponent(title)}&pages=${pages ?? ''}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/pdf' }, body: file })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'Upload failed')
    return data
  },
  renameTextbook: (id, title) => request(`/textbooks/${id}`, { method: 'PATCH', body: { title } }),
  deleteTextbook: (id) => request(`/textbooks/${id}`, { method: 'DELETE' }),
  textbookFileUrl: (id) => `/api/textbooks/${id}/file`,
  getProfile: () => request('/profile'),
  updateProfile: (body) => request('/profile', { method: 'PATCH', body }),
  uploadAvatar: (data) => request('/profile/avatar', { method: 'POST', body: { data } }),
  removeAvatar: () => request('/profile/avatar', { method: 'DELETE' }),
  diag: (event) => request('/diag', { method: 'POST', body: event }).catch(() => {}),
  dictionary: (word) => request(`/dictionary?word=${encodeURIComponent(word)}`),
  translate: (q) => request(`/dictionary/translate?q=${encodeURIComponent(q)}`),
  adventStatus: () => request('/advent/status'),
  trainerLink: () => request('/advent/trainer-link'),
  adventProgress: (classroomId) => request(`/advent/progress${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ''}`),
  adventSettings: () => request('/settings/advent'),
  saveAdventKey: (key) => request('/settings/advent', { method: 'PUT', body: { key } }),
  uploadWritingImage: (classroomId, data) =>
    request(`/classrooms/${classroomId}/writing/images`, { method: 'POST', body: { data } }),
  createCall: (body) => request('/calls', { method: 'POST', body }),
  createScratchBoard: (token) => request(`/calls/${token}/scratch-board`, { method: 'POST' }),
  listCalls: () => request('/calls'),
  endCall: (id) => request(`/calls/${id}/end`, { method: 'POST' }),

  listClassrooms: () => request('/classrooms'),
  studentHome: () => request('/classrooms/home'),
  listMistakes: (classroomId) => request(`/mistakes/classroom/${classroomId}`),
  addMistake: (classroomId, body) => request(`/mistakes/classroom/${classroomId}`, { method: 'POST', body }),
  updateMistake: (id, body) => request(`/mistakes/${id}`, { method: 'PATCH', body }),
  deleteMistake: (id) => request(`/mistakes/${id}`, { method: 'DELETE' }),
  deleteMistakeByElement: (elementId) => request(`/mistakes/element/${elementId}`, { method: 'DELETE' }),
  mistakePractice: () => request('/mistakes/practice'),
  submitMistakeAttempt: (id, answer) => request(`/mistakes/practice/${id}/attempt`, { method: 'POST', body: { answer } }),
  activityMe: () => request('/stats/activity/me'),
  aiSettings: () => request('/settings/ai'),
  offerLinks: () => request('/settings/offer'),
  saveOfferLinks: (body) => request('/settings/offer', { method: 'PUT', body }),
  saveAiSettings: (body) => request('/settings/ai', { method: 'PUT', body }),
  clearAiSettings: () => request('/settings/ai', { method: 'DELETE' }),
  testAiSettings: () => request('/settings/ai/test', { method: 'POST' }),
  startTrial: (classroomId) => request('/trials', { method: 'POST', body: { classroomId } }),
  trialReports: (classroomId) => request(`/trials/classroom/${classroomId}`),
  trialReport: (id) => request(`/trials/${id}`),
  updateTrial: (id, body) => request(`/trials/${id}`, { method: 'PATCH', body }),
  generateTrial: (id) => request(`/trials/${id}/generate`, { method: 'POST' }),
  publishTrial: (id, unpublish = false) => request(`/trials/${id}/publish`, { method: 'POST', body: { unpublish } }),
  deleteTrial: (id) => request(`/trials/${id}`, { method: 'DELETE' }),
  lessonSummaries: (classroomId) => request(`/lessons/classroom/${classroomId}/summaries`),
  rebuildSummary: (sessionId) => request(`/lessons/${sessionId}/summary`, { method: 'POST' }),
  activityStudent: (id) => request(`/stats/activity/${id}`),
  myBoards: () => request('/classrooms/mine'),
  getClassroom: (id) => request(`/classrooms/${id}`),
  allBoards: () => request('/classrooms/boards'),
  createBoard: (id, title) => request(`/classrooms/${id}/boards`, { method: 'POST', body: { title } }),
  renameBoard: (id, boardId, title) =>
    request(`/classrooms/${id}/boards/${boardId}`, { method: 'PATCH', body: { title } }),
  uploadBoardImage: (id, boardId, data) =>
    request(`/classrooms/${id}/boards/${boardId}/images`, { method: 'POST', body: { data } }),
  assignBoard: (id, boardId, targetClassroomId, attach) =>
    request(`/classrooms/${id}/boards/${boardId}/assign`, { method: 'POST', body: { targetClassroomId, attach } }),
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
  deleteApiToken: (id) => request(`/content/tokens/${id}`, { method: 'DELETE' }),

  // Personal (todos and calendar)
  listTodos: () => request('/personal/todos'),
  createTodo: (body) => request('/personal/todos', { method: 'POST', body }),
  updateTodo: (id, body) => request(`/personal/todos/${id}`, { method: 'PATCH', body }),
  deleteTodo: (id) => request(`/personal/todos/${id}`, { method: 'DELETE' }),

  listCalendarEvents: (start, end) => request(`/personal/calendar${start || end ? `?${new URLSearchParams({ ...(start && { start }), ...(end && { end }) }).toString()}` : ''}`),
  createCalendarEvent: (body) => request('/personal/calendar', { method: 'POST', body }),
  updateCalendarEvent: (id, body) => request(`/personal/calendar/${id}`, { method: 'PATCH', body }),
  deleteCalendarEvent: (id, deleteAll) => request(`/personal/calendar/${id}${deleteAll ? '?deleteAll=true' : ''}`, { method: 'DELETE' }),

  // Courses: self-paced skillsets (IELTS, etc), browsable on their own and
  // openable during a call.
  listSkillsets: () => request('/courses'),
  getCourse: (courseId) => request(`/courses/${courseId}/full`),
  checkCourseWriting: (blockId, answer) => request(`/courses/blocks/${blockId}/check`, { method: 'POST', body: { answer } }),

  // Audio tracks attached to a textbook (e.g. listening-test recordings).
  textbookAudio: (id) => request(`/textbooks/${id}/audio`),
  uploadTextbookAudio: async (id, file, title) => {
    const response = await fetch(`/api/textbooks/${id}/audio?title=${encodeURIComponent(title)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'audio/mpeg' }, body: file })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'Upload failed')
    return data
  },
  deleteTextbookAudio: (id, audioId) => request(`/textbooks/${id}/audio/${audioId}`, { method: 'DELETE' }),
  textbookAudioFileUrl: (id, audioId) => `/api/textbooks/${id}/audio/${audioId}/file`
}
