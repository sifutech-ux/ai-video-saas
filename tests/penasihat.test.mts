import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clipTurns,
  localPenasihat,
  originAllowed,
  parsePenasihatReply,
  penasihatPrompt,
  penasihatStage,
  tooManyNotes,
} from '../src/lib/penasihat.ts'

test('penasihat terima peringkat dan asal portal', () => {
  assert.equal(penasihatStage('jual'), 'jual')
  assert.equal(penasihatStage('lain'), null)
  assert.equal(originAllowed('https://beshareaisolution.com'), true)
  assert.equal(originAllowed('https://ai-video-saas-ten.vercel.app'), false)
  assert.equal(originAllowed(null), false)
})

test('arahan penasihat kekal Bahasa Malaysia dan tiga langkah', () => {
  const prompt = penasihatPrompt({
    nama: 'Lemon S',
    jualan: 'minuman lemon untuk orang yang nak kempiskan perut',
    peringkat: 'jual',
    giliran: [{ dari: 'klien', teks: 'Macam mana saya nak naikkan jualan minggu ini?' }],
  })
  assert.match(prompt, /Bahasa Malaysia/)
  assert.match(prompt, /bukan loghat atau perkataan Indonesia/)
  assert.match(prompt, /SSM/)
  assert.match(prompt, /Lemon S/)
  assert.match(prompt, /Sudah jual/)
  assert.match(prompt, /"langkah":\["langkah 1","langkah 2","langkah 3"\]/)
})

test('jawapan model dipotong kepada tiga langkah', () => {
  const reply = parsePenasihatReply(`{"jawapan":"Fokus pada pelanggan lama.","langkah":["Hubungi lima orang.","Tulis satu tawaran.","Catat pertanyaan yang masuk.","buang"]}`)
  assert.equal(reply.langkah.length, 3)
  assert.equal(reply.jawapan.includes('{'), false)
  assert.throws(() => parsePenasihatReply('{"jawapan":"kosong","langkah":["satu"]}'))
})

test('sandaran tempatan sebut perniagaan dan tiga langkah', () => {
  const reply = localPenasihat({
    nama: 'Kedai Minyak',
    jualan: 'minyak urut untuk ibu yang letih',
    peringkat: 'mula',
    giliran: [{ dari: 'klien', teks: 'Saya nak tahu pasal SSM dan cukai.' }],
  })
  assert.match(reply.jawapan, /Kedai Minyak/)
  assert.match(reply.jawapan, /orang yang berkelayakan/)
  assert.equal(reply.langkah.length, 3)
  assert.equal(clipTurns([{ dari: 'klien', teks: '  hello  ' }, { dari: 'lain', teks: 'x' }]).length, 1)
})

test('had mesej penasihat', () => {
  const key = `ujian-${Date.now()}`
  for (let i = 0; i < 12; i += 1) assert.equal(tooManyNotes(key, 1_000), false)
  assert.equal(tooManyNotes(key, 1_000), true)
  assert.equal(tooManyNotes(key, 70_000), false)
})
