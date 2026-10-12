import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { promisify } from 'node:util'
import { OPTIONS as copilotOptions } from '../src/app/api/copilot/nasihat/route.ts'
import { OPTIONS as awamOptions, POST as awamPost } from '../src/app/api/penasihat/route.ts'
import { adviseCopilot, fetchCopilotSession } from '../src/lib/copilot-nasihat.ts'
import { createKuotaClient } from '../src/lib/copilot-kuta.ts'
import { ModelAttemptError } from '../src/lib/copilot-model.ts'
import { publicRuntime } from '../src/lib/copilot-model.ts'

const exec = promisify(execFile)
const IPO = '/agent/repos/beshare-ipo'
const KUTA = 'kuta-ujian-gabungan'
const RAHSIA = 'rahsia-ujian-gabungan'
const MODEL = '{"jawapan":"Fokus pelanggan lama minggu ini.","langkah":["Hubungi lima orang.","Tulis satu tawaran.","Catat pertanyaan."]}'
const GILIRAN = [{ dari: 'klien' as const, teks: 'Macam mana nak susun minggu ini?' }]
const LAIN = [{ dari: 'klien' as const, teks: 'Soalan lain yang tidak sama.' }]

const PELAYAN = `import json, os, sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pelanggan_akaun as akaun

DB = os.environ['COPILOT_DB']
SECRET = os.environ['COPILOT_ACCOUNT_SECRET']

def connect():
    return sqlite3.connect(DB, timeout=5)

class H(BaseHTTPRequestHandler):
    def _go(self):
        length = int(self.headers.get('Content-Length', 0) or 0)
        raw = self.rfile.read(length) if length else b''
        path = self.path.split('?', 1)[0]
        status, body = akaun.dispatch(
            self.command, path, self.headers.get('Origin'), self.headers.get('Authorization'),
            raw, connect, False, SECRET, '127.0.0.1',
            kuta_headers={
                'masa': self.headers.get('X-Copilot-Masa'),
                'nonce': self.headers.get('X-Copilot-Nonce'),
                'tandatangan': self.headers.get('X-Copilot-Tandatangan'),
            },
        )
        data = b'' if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if data and status != 204:
            self.wfile.write(data)
    def do_GET(self): self._go()
    def do_POST(self): self._go()
    def do_OPTIONS(self): self._go()
    def log_message(self, fmt, *args):
        return

server = ThreadingHTTPServer(('127.0.0.1', 0), H)
print(f'PORT {server.server_address[1]}', flush=True)
server.serve_forever()
`

type Hasil = { status: number; body: Record<string, unknown> }

function jawapan() {
  return {
    text: MODEL,
    model: 'gemini-ujian',
    promptTokens: 3,
    outputTokens: 5,
  }
}

async function sql(db: string, statement: string) {
  const { stdout } = await exec('python3', ['-c', `
import json, sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
cur = conn.cursor()
cur.execute(sys.argv[2])
rows = cur.fetchall()
conn.commit()
conn.close()
print(json.dumps(rows))
`, db, statement])
  return JSON.parse(stdout) as unknown[][]
}

function permintaanAwam(ip: string) {
  return new Request('https://beshareaisolution.com/api/penasihat', {
    method: 'POST',
    headers: {
      origin: 'https://beshareaisolution.com',
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({
      nama: 'Kedai Awam',
      jualan: 'Kuih kering untuk pejabat kecil',
      peringkat: 'mula',
      giliran: GILIRAN,
    }),
  })
}

test('bendera nasihat awam mati kekal dan hidup menolak sebelum Gemini', async () => {
  const previous = {
    tutup: process.env.PENASIHAT_AWAM_TUTUP,
    kuota: process.env.PENASIHAT_KUOTA,
    gemini: process.env.GEMINI_API_KEY,
  }
  const original = publicRuntime.generate
  let model = 0
  publicRuntime.generate = async () => {
    model += 1
    throw new Error('Gemini tidak patut dipanggil')
  }
  delete process.env.PENASIHAT_AWAM_TUTUP
  delete process.env.PENASIHAT_KUOTA
  delete process.env.GEMINI_API_KEY
  try {
    const mati = await awamPost(permintaanAwam('203.0.113.80'))
    const badanMati = await mati.json()
    assert.equal(mati.status, 200)
    assert.equal(badanMati.ok, true)
    assert.equal(typeof badanMati.jawapan, 'string')
    assert.equal(badanMati.sumber, undefined)
    assert.equal(model, 0)

    process.env.PENASIHAT_AWAM_TUTUP = 'true'
    const bukan = await awamPost(permintaanAwam('203.0.113.81'))
    assert.equal(bukan.status, 200)
    assert.equal(model, 0)

    process.env.PENASIHAT_AWAM_TUTUP = 'on'
    process.env.GEMINI_API_KEY = 'ujian-bukan-panggilan'
    process.env.PENASIHAT_KUOTA = 'on'
    const hidup = await awamPost(permintaanAwam('203.0.113.82'))
    const badanHidup = await hidup.json()
    assert.equal(hidup.status, 403)
    assert.equal(badanHidup.error, 'Nasihat awam ditutup. Guna meja akaun.')
    assert.equal(badanHidup.ok, undefined)
    assert.equal(model, 0)

    const preflight = await awamOptions(new Request('https://beshareaisolution.com/api/penasihat', {
      method: 'OPTIONS',
      headers: { origin: 'https://beshareaisolution.com' },
    }))
    assert.equal(preflight.status, 204)
    const copilot = await copilotOptions(new Request('https://beshareaisolution.com/api/copilot/nasihat', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://beshareaisolution.com',
        'access-control-request-headers': 'content-type, authorization, idempotency-key',
      },
    }))
    assert.equal(copilot.status, 204)
    assert.match(copilot.headers.get('access-control-allow-headers') || '', /Authorization/)
    assert.match(copilot.headers.get('access-control-allow-headers') || '', /Idempotency-Key/)
    assert.equal(copilot.headers.get('access-control-allow-origin'), 'https://beshareaisolution.com')
  } finally {
    publicRuntime.generate = original
    assign('PENASIHAT_AWAM_TUTUP', previous.tutup)
    assign('PENASIHAT_KUOTA', previous.kuota)
    assign('GEMINI_API_KEY', previous.gemini)
  }
})

test('akaun kuota dan nasihat tempatan bersama dengan Gemini palsu', async () => {
  const previousNode = process.env.NODE_ENV
  const previousKuta = process.env.COPILOT_KUTA_SECRET
  process.env.NODE_ENV = 'test'
  process.env.COPILOT_KUTA_SECRET = KUTA
  const dir = await mkdtemp(join(tmpdir(), 'copilot-gabungan-'))
  const db = join(dir, 'akaun.db')
  const skrip = join(dir, 'pelayan.py')
  await writeFile(skrip, PELAYAN)
  const child = spawn('python3', [skrip], {
    cwd: IPO,
    env: {
      ...process.env,
      PYTHONPATH: IPO,
      COPILOT_DB: db,
      COPILOT_KUTA_SECRET: KUTA,
      COPILOT_ACCOUNT_SECRET: RAHSIA,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stderr?.on('data', (chunk) => { log += chunk.toString() })
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`pelayan tidak bangun ${log}`)), 8000)
    child.stdout?.on('data', (chunk) => {
      const match = /PORT (\d+)/.exec(chunk.toString())
      if (!match) return
      clearTimeout(timer)
      resolve(Number(match[1]))
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`pelayan keluar ${code} ${log}`))
    })
  })
  const asal = `http://127.0.0.1:${port}`
  let model = 0
  const panggilan = { rezab: 0 }

  function kuota(token: string) {
    const dalam = createKuotaClient({
      akaunUrl: asal,
      secret: KUTA,
      authorization: `Bearer ${token}`,
      testLoopback: true,
    })
    return {
      async rezab(input: Parameters<typeof dalam.rezab>[0]) {
        panggilan.rezab += 1
        return dalam.rezab(input)
      },
      hantar: (id: string) => dalam.hantar(id),
      muktamad: (input: Parameters<typeof dalam.muktamad>[0]) => dalam.muktamad(input),
    }
  }

  async function nasihat(token: string, kunci: string | null, giliran: typeof GILIRAN, ask: () => Promise<ReturnType<typeof jawapan>> = async () => {
    model += 1
    return jawapan()
  }): Promise<Hasil> {
    const result = await adviseCopilot({
      origin: 'https://beshareaisolution.com',
      authorization: token ? `Bearer ${token}` : null,
      body: { giliran },
      rateKey: `gabungan-${kunci || 'tiada'}-${giliran[0]?.teks || 'kosong'}`,
      akaunUrl: asal,
      idempotencyKey: kunci,
      copilotKeyPresent: () => true,
      testLoopback: true,
      introspect: (url, authorization) => fetchCopilotSession(url, authorization, globalThis.fetch, Date.now(), true),
      kuota: kuota(token),
      ask,
    })
    return { status: result.status, body: result.body as Record<string, unknown> }
  }

  async function http(path: string, token: string, badan?: unknown) {
    const balas = await fetch(`${asal}${path}`, {
      method: badan === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(badan === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: badan === undefined ? undefined : JSON.stringify(badan),
    })
    return { status: balas.status, data: await balas.json() as Record<string, unknown> }
  }

  try {
    const daftarA = await http('/api/akaun/daftar', '', { email: 'aminah@kedai.my', password: 'kata-rahsia' })
    assert.equal(daftarA.status, 200)
    const tokenA = String(daftarA.data.token)
    const profil = await http('/api/akaun/penasihat', tokenA, {
      penasihat: {
        nama: 'Kedai Amanah',
        jualan: 'Kuih kering untuk pejabat kecil',
        peringkat: 'mula',
        mesej: [{ dari: 'klien', teks: 'Macam mana nak susun minggu ini?' }],
      },
    })
    assert.equal(profil.status, 200, JSON.stringify(profil.data))
    const versiAwal = profil.data.mesej_versi

    const rezabSebelum = panggilan.rezab
    const modelSebelum = model
    const lulus = await nasihat(tokenA, 'idem-gabung-0001', GILIRAN)
    assert.equal(lulus.status, 200)
    assert.equal(lulus.body.ok, true)
    assert.equal(lulus.body.sumber, 'gemini')
    assert.equal(lulus.body.bukan_model, false)
    assert.equal(lulus.body.jawapan, 'Fokus pelanggan lama minggu ini.')
    assert.equal(model, modelSebelum + 1)
    const disimpan = await http('/api/akaun/penasihat', tokenA, {
      versi: versiAwal,
      penasihat: {
        nama: 'Kedai Amanah',
        jualan: 'Kuih kering untuk pejabat kecil',
        peringkat: 'mula',
        mesej: [
          { dari: 'klien', teks: 'Macam mana nak susun minggu ini?' },
          { dari: 'penasihat', teks: lulus.body.jawapan, langkah: lulus.body.langkah },
        ],
      },
    })
    assert.equal(disimpan.status, 200, JSON.stringify(disimpan.data))
    const mesej = (disimpan.data.penasihat as { mesej: Array<{ teks: string }> }).mesej
    assert.equal(mesej.filter((item) => item.teks === 'Fokus pelanggan lama minggu ini.').length, 1)

    const ulang = await nasihat(tokenA, 'idem-gabung-0001', GILIRAN)
    assert.equal(ulang.status, 200)
    assert.equal(ulang.body.main_semula, true)
    assert.equal(ulang.body.sumber, 'gemini')
    assert.equal(model, modelSebelum + 1)
    const saya = await http('/api/akaun/saya', tokenA)
    const selepasUlang = (saya.data.penasihat as { mesej: Array<{ teks: string }> }).mesej
    assert.equal(selepasUlang.filter((item) => item.teks === 'Fokus pelanggan lama minggu ini.').length, 1)

    const bezar = await nasihat(tokenA, 'idem-gabung-0001', LAIN)
    assert.equal(bezar.status, 409)
    assert.equal(model, modelSebelum + 1)

    const model401 = model
    const rezab401 = panggilan.rezab
    const luput = await nasihat('token-luput', 'idem-gabung-0002', GILIRAN)
    assert.equal(luput.status, 401)
    assert.equal(model, model401)
    assert.equal(panggilan.rezab, rezab401)

    const daftarKosong = await http('/api/akaun/daftar', '', { email: 'kosong@kedai.my', password: 'kata-rahsia' })
    const tokenKosong = String(daftarKosong.data.token)
    const model422 = model
    const rezab422 = panggilan.rezab
    const tanpaProfil = await nasihat(tokenKosong, 'idem-gabung-0003', GILIRAN)
    assert.equal(tanpaProfil.status, 422)
    assert.match(String(tanpaProfil.body.error), /profil/)
    assert.equal(model, model422)
    assert.equal(panggilan.rezab, rezab422)

    const model400 = model
    const rezab400 = panggilan.rezab
    const tiadaKunci = await nasihat(tokenA, null, GILIRAN)
    const kunciRosak = await nasihat(tokenA, 'pendek', GILIRAN)
    assert.equal(tiadaKunci.status, 400)
    assert.equal(kunciRosak.status, 400)
    assert.equal(model, model400)
    assert.equal(panggilan.rezab, rezab400)

    const rosak = await nasihat(tokenA, 'idem-gabung-0004', GILIRAN, async () => {
      model += 1
      return { text: '{"jawapan":"Untung rekaan","langkah":["satu"]}', model: 'ujian', promptTokens: null, outputTokens: null }
    })
    assert.equal(rosak.status, 502)
    assert.equal(rosak.body.ok, false)
    assert.equal(rosak.body.sumber, 'tempatan')
    assert.equal(rosak.body.bukan_model, true)
    assert.equal(rosak.body.ralat, 'output_tidak_sah')
    assert.match(String(rosak.body.label), /bukan jawapan model/)
    const barisRosak = await sql(db, "SELECT status, reply_json FROM copilot_usage_reservation WHERE idempotency_key = 'idem-gabung-0004'")
    assert.equal(barisRosak[0][0], 'provider_failed')
    assert.equal(barisRosak[0][1], null)
    const teksAkaun = JSON.stringify((await http('/api/akaun/saya', tokenA)).data.penasihat)
    assert.equal(teksAkaun.includes('Untung rekaan'), false)
    assert.equal(teksAkaun.includes('baru nak bermula'), false)

    const sebelumTidakPasti = model
    const tidakPasti = await nasihat(tokenA, 'idem-gabung-0005', GILIRAN, async () => {
      model += 1
      throw new ModelAttemptError('uncertain')
    })
    assert.equal(tidakPasti.status, 502)
    assert.equal(tidakPasti.body.bukan_model, true)
    assert.equal(model, sebelumTidakPasti + 1)
    const ulangTidakPasti = await nasihat(tokenA, 'idem-gabung-0005', GILIRAN, async () => {
      model += 1
      return jawapan()
    })
    assert.equal(ulangTidakPasti.status, 503)
    assert.match(String(ulangTidakPasti.body.error), /belum pasti/)
    assert.equal(model, sebelumTidakPasti + 1)

    let masuk = 0
    let buka: () => void = () => {}
    const tahan = new Promise<void>((resolve) => { buka = resolve })
    const tertangkap: Hasil[] = []
    const perlahan = async () => {
      masuk += 1
      model += 1
      if (masuk === 1) await tahan
      return jawapan()
    }
    const sebelumSelari = model
    const janji = Promise.all([
      nasihat(tokenA, 'idem-gabung-selari-a', GILIRAN, perlahan).then((item) => { tertangkap.push(item); return item }),
      nasihat(tokenA, 'idem-gabung-selari-b', LAIN, perlahan).then((item) => { tertangkap.push(item); return item }),
    ])
    const mula = Date.now()
    while (masuk < 1 && Date.now() - mula < 4000) await new Promise((resolve) => setTimeout(resolve, 20))
    while (tertangkap.length < 1 && Date.now() - mula < 4000) await new Promise((resolve) => setTimeout(resolve, 20))
    buka()
    const selari = await janji
    const kod = selari.map((item) => item.status).sort()
    assert.deepEqual(kod, [200, 429])
    assert.equal(model, sebelumSelari + 1)
    assert.equal(masuk, 1)

    await sql(db, "UPDATE copilot_quota_policy SET copilot_daily_account = 0, circuit_open = 0 WHERE id = 'utama'")
    const modelHad = model
    const had = await nasihat(tokenA, 'idem-gabung-0006', GILIRAN)
    assert.equal(had.status, 429)
    assert.equal(model, modelHad)

    await sql(db, "UPDATE copilot_quota_policy SET copilot_daily_account = 20, circuit_open = 1 WHERE id = 'utama'")
    const modelLitar = model
    const litar = await nasihat(tokenA, 'idem-gabung-0007', GILIRAN)
    assert.equal(litar.status, 503)
    assert.equal(litar.body.error, 'Nasihat ditutup sebentar.')
    assert.equal(model, modelLitar)
    await sql(db, "UPDATE copilot_quota_policy SET circuit_open = 0 WHERE id = 'utama'")

    const daftarB = await http('/api/akaun/daftar', '', { email: 'kedua@kedai.my', password: 'kata-rahsia' })
    const tokenB = String(daftarB.data.token)
    const sayaB = await http('/api/akaun/saya', tokenB)
    assert.equal(sayaB.data.penasihat, null)
    assert.equal(JSON.stringify(sayaB.data).includes('Fokus pelanggan lama'), false)
    const modelB = model
    const asing = await nasihat(tokenB, 'idem-gabung-0001', GILIRAN)
    assert.equal(asing.status, 422)
    assert.equal(model, modelB)
    const pemilik = await sql(db, "SELECT DISTINCT owner_scope FROM copilot_usage_reservation")
    const sayaA = await http('/api/akaun/saya', tokenA)
    assert.equal(pemilik.length, 1)
    assert.equal(pemilik[0][0], sayaA.data.akaun_id)
    assert.notEqual(sayaA.data.akaun_id, sayaB.data.akaun_id)
    assert.equal(panggilan.rezab > rezabSebelum, true)
  } finally {
    child.kill('SIGTERM')
    await new Promise((resolve) => {
      child.once('exit', resolve)
      setTimeout(resolve, 1000)
    })
    if (previousNode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNode
    assign('COPILOT_KUTA_SECRET', previousKuta)
    await rm(dir, { recursive: true, force: true })
  }
})

function assign(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
