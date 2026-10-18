// Who gets what, without a server: plans, the free tier, trial accounts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entitlements, planActive, aiChecksLeft, useAiCheck, FREE_AI_CHECKS_PER_DAY } from '../src/plans.js'
import { freeCount } from '../src/freeTier.js'
import { mustSignUp, trialOver } from '../src/auth.js'

const day = 24 * 60 * 60 * 1000
const future = () => new Date(Date.now() + day)
const past = () => new Date(Date.now() - day)

test('staff and students with a teacher have everything', () => {
  for (const role of ['OWNER', 'TEACHER', 'PARTNER', 'STUDENT']) {
    assert.deepEqual(entitlements({ role, free: false }), { practice: true, calls: true })
  }
})

test('a free account without a plan has neither practice nor calls', () => {
  assert.deepEqual(entitlements({ role: 'STUDENT', free: true }), { practice: false, calls: false })
  assert.deepEqual(entitlements(null), { practice: false, calls: false })
})

test('a free account gets exactly what its active plan includes', () => {
  const free = (plan, planUntil) => ({ role: 'STUDENT', free: true, plan, planUntil })
  assert.deepEqual(entitlements(free('practice', future())), { practice: true, calls: false })
  assert.deepEqual(entitlements(free('calls', future())), { practice: false, calls: true })
  assert.deepEqual(entitlements(free('all', future())), { practice: true, calls: true })
})

test('an expired or unknown plan gives nothing', () => {
  assert.equal(planActive({ plan: 'all', planUntil: past() }), false)
  assert.equal(planActive({ plan: 'gold', planUntil: future() }), false)
  assert.equal(planActive({ plan: 'all', planUntil: null }), false)
  assert.deepEqual(entitlements({ free: true, plan: 'all', planUntil: past() }), { practice: false, calls: false })
})

test('free AI checks run out after the daily limit; Practice is unlimited', () => {
  const user = { id: 'ai-limit-test', free: true }
  assert.equal(aiChecksLeft(user), FREE_AI_CHECKS_PER_DAY)
  for (let i = 0; i < FREE_AI_CHECKS_PER_DAY; i++) useAiCheck(user)
  assert.equal(aiChecksLeft(user), 0)
  useAiCheck(user)
  assert.equal(aiChecksLeft(user), 0)

  const paid = { id: 'ai-paid-test', free: true, plan: 'practice', planUntil: future() }
  assert.equal(aiChecksLeft(paid), Infinity)
})

test('the free tier opens about 30%, and always at least one', () => {
  assert.equal(freeCount(34), 10)
  assert.equal(freeCount(2), 1)
  assert.equal(freeCount(1), 1)
  assert.equal(freeCount(0), 1)
})

test('a trial-link account must sign up once it has paid', () => {
  assert.equal(mustSignUp({ viaLink: true, lessonsPaid: 0 }), false)
  assert.equal(mustSignUp({ viaLink: true, lessonsPaid: 4 }), true)
  assert.equal(mustSignUp({ viaLink: true, plan: 'all', planUntil: future() }), true)
  assert.equal(mustSignUp({ viaLink: false, lessonsPaid: 4 }), false)
})

test('trial access ends after its date unless lessons are paid', () => {
  assert.equal(trialOver({ role: 'STUDENT', trialAccessUntil: future() }), false)
  assert.equal(trialOver({ role: 'STUDENT', trialAccessUntil: past() }), true)
  assert.equal(trialOver({ role: 'STUDENT', trialAccessUntil: past(), lessonsPaid: 8 }), false)
  assert.equal(trialOver({ role: 'TEACHER', trialAccessUntil: past() }), false)
  assert.equal(trialOver({ role: 'STUDENT' }), false)
})
