import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lengthCap, rawToBand, scoreRepeat } from '../src/toeflScoring.js'

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

test('a very short email or discussion post cannot score in the middle of the scale', () => {
  assert.equal(lengthCap('email', words(12)), 1)
  assert.equal(lengthCap('discussion', words(29)), 1)
  assert.equal(lengthCap('email', words(30)), 2.5)
  assert.equal(lengthCap('discussion', words(59)), 2.5)
  assert.equal(lengthCap('email', words(60)), 5)
  assert.equal(lengthCap('email', ''), 1)
})

test('spoken answers are transcripts and are never capped by length', () => {
  assert.equal(lengthCap('interview', words(5)), 5)
})

test('raw 0–5 maps onto the 1–6 band', () => {
  assert.equal(rawToBand(0), 1)
  assert.equal(rawToBand(2.5), 3.5)
  assert.equal(rawToBand(5), 6)
})

test('listen and repeat: the whole sentence is 5, half of it is 2', () => {
  assert.equal(scoreRepeat('Welcome to orientation day.', 'welcome to orientation day').score, 5)
  assert.equal(scoreRepeat('Please pick up your name tag here.', 'please pick up').score, 2)
})
