import assert from 'node:assert/strict'
import test from 'node:test'
import {
  freshSession,
  readSigned,
  rememberJob,
  sameSecret,
  settleJob,
  signSession,
} from '../src/lib/studio-session.ts'
import { allowedMediaUrl } from '../src/lib/media-url.ts'
import { ensureStyle, fallbackPrompt } from '../src/lib/studio-prompt.ts'

test('kata laluan yang sama lulus, yang lain gagal', () => {
  assert.equal(sameSecret('studio-rahsia', 'studio-rahsia'), true)
  assert.equal(sameSecret('salah', 'studio-rahsia'), false)
  assert.equal(sameSecret('', 'studio-rahsia'), false)
})

test('sesi yang diubah tandatangan ditolak', () => {
  const session = freshSession(1_000)
  const token = signSession(session, 'rahsia')
  const opened = readSigned(token, 'rahsia', 1_000)
  assert.equal(opened?.credits, 2)
  assert.equal(readSigned(token, 'lain', 1_000), null)
  assert.equal(readSigned(`${token}x`, 'rahsia', 1_000), null)
  assert.equal(readSigned(token, 'rahsia', session.exp + 1), null)
})

test('kredit dipulangkan sekali sahaja bila gagal', () => {
  const session = freshSession()
  session.credits = 1
  rememberJob(session, 'job-1')
  const failed = settleJob(session, 'job-1', 'gagal')
  assert.equal(failed.changed, true)
  assert.equal(failed.credits, 2)
  const again = settleJob(session, 'job-1', 'gagal')
  assert.equal(again.changed, false)
  assert.equal(again.credits, 2)
})

test('video yang siap tidak memulangkan kredit', () => {
  const session = freshSession()
  session.credits = 1
  rememberJob(session, 'job-2')
  const done = settleJob(session, 'job-2', 'siap')
  assert.equal(done.credits, 1)
  assert.equal(settleJob(session, 'job-2', 'gagal').changed, false)
})

test('gaya vintage masuk ke arahan sandaran', () => {
  const text = fallbackPrompt('buat satu video vintage', 'Vintage Film', '16:9')
  assert.match(text, /buat satu video vintage/)
  assert.match(text, /vintage 16mm film/)
  assert.match(text, /16:9/)
  const kept = ensureStyle('A warm vintage 16mm film of a street.', 'Vintage Film', '16:9')
  assert.equal(kept, 'A warm vintage 16mm film of a street.')
  const added = ensureStyle('A cat in space.', 'Vintage Film', '16:9')
  assert.match(added, /vintage 16mm film/)
})

test('muat turun hanya benarkan hos Replicate', () => {
  assert.equal(allowedMediaUrl('https://replicate.delivery/pbxt/file.mp4'), true)
  assert.equal(allowedMediaUrl('https://pbxt.replicate.delivery/file.mp4'), true)
  assert.equal(allowedMediaUrl('https://example.com/file.mp4'), false)
  assert.equal(allowedMediaUrl('http://replicate.delivery/file.mp4'), false)
  assert.equal(allowedMediaUrl('not a url'), false)
})
