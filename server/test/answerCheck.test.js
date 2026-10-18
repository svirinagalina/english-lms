// Answer checking is shared by grammar units and the mistake drill: a wrong
// "wrong" here marks students down across the whole platform.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkAnswer, normalise } from '../src/answerCheck.js'

test('exact answer passes, a different one fails', () => {
  assert.equal(checkAnswer('I have a car', ['I have a car']).correct, true)
  assert.equal(checkAnswer('I has a car', ['I have a car']).correct, false)
})

test('case, punctuation and extra spaces do not matter', () => {
  assert.equal(checkAnswer('  i HAVE a car!!  ', ['I have a car.']).correct, true)
  assert.equal(checkAnswer('— Yes, I do', ['Yes I do']).correct, true)
})

test('curly apostrophes compare like straight ones', () => {
  assert.equal(normalise('don’t'), normalise("don't"))
})

test('contracted and full forms are equal', () => {
  assert.equal(checkAnswer("I don't know", ['I do not know']).correct, true)
  assert.equal(checkAnswer("She isn't here", ['She is not here']).correct, true)
})

test('any accepted variant passes and is reported as matched', () => {
  const result = checkAnswer('Hi', ['Hello', 'Hi'])
  assert.deepEqual(result, { correct: true, matched: 'Hi' })
})

test('"no article" blank: a dash, an underscore or an em dash all match —', () => {
  for (const given of ['-', '_', '—']) {
    assert.equal(checkAnswer(given, ['—']).correct, true, `"${given}" should match "—"`)
  }
  // A real word where no word is wanted is still wrong.
  assert.equal(checkAnswer('the', ['—']).correct, false)
})

test('a hyphen inside a word is kept', () => {
  assert.equal(normalise('well-known'), 'well-known')
})

test('a phrase alternative can be swapped into the main answer', () => {
  const accepted = ['There is no one in the kitchen', "there isn't anyone"]
  assert.equal(checkAnswer("There isn't anyone in the kitchen", accepted).correct, true)
  // The phrase alone is itself an accepted answer.
  assert.equal(checkAnswer("there isn't anyone", accepted).correct, true)
  assert.equal(checkAnswer("There isn't anyone in the garden", accepted).correct, false)
})

test('«этот» in the prompt lets this/that stand for the', () => {
  assert.equal(checkAnswer('this bookcase is old', ['the bookcase is old'], { prompt: 'Этот шкаф старый' }).correct, true)
  // Without a demonstrative in the Russian, "this" is a different answer.
  assert.equal(checkAnswer('this bookcase is old', ['the bookcase is old'], { prompt: 'Шкаф старый' }).correct, false)
})

test('an empty answer does not match a real one', () => {
  assert.equal(checkAnswer('', ['I have a car']).correct, false)
})
