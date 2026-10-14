import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createKuotaClient } from '../src/lib/copilot-kuta.ts'

const PELAYAN = `import json, os, sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pelanggan_akaun as akaun

DB = os.environ['COPILOT_DB']
SECRET = os.environ['COPILOT_ACCOUNT_SECRET']

def connect():
    return sqlite3.connect(DB, timeout=5)

class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return
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
        if data:
            self.wfile.write(data)
    def do_GET(self):
        self._go()
    def do_POST(self):
        self._go()

server = ThreadingHTTPServer(('127.0.0.1', 0), H)
print('PORT %s' % server.server_address[1], flush=True)
server.serve_forever()
`

test('kuota sintetik ke akaun terpencil dan hos IPO tidak dirangkaikan', async () => {
  const root = process.env.COPILOT_TEST_AKAUN_ROOT
  assert.equal(typeof root, 'string')
  const nyata = realpathSync(root || '')
  assert.equal(nyata.includes('/agent/repos/beshare-ipo'), false)
  assert.equal(nyata.includes('/tmp/akaun-kontrak'), false)
  const previousHost = process.env.COPILOT_AKAUN_HOST
  const dir = await mkdtemp(join(tmpdir(), 'copilot-hos-'))
  const db = join(dir, 'copilot_akaun_sintetik.db')
  const skrip = join(dir, 'pelayan.py')
  await writeFile(skrip, PELAYAN)
  const anakEnv = { ...process.env, PYTHONPATH: nyata, PYTHONDONTWRITEBYTECODE: '1', COPILOT_DB: db, COPILOT_KUTA_SECRET: 'kuta-ujian', COPILOT_ACCOUNT_SECRET: 'rahsia-ujian-sintetik' }
  for (const key of ['DATABASE_URL', 'ACCOUNT_DATABASE_URL', 'COPILOT_TEST_POSTGRES', 'COPILOT_TEST_DATABASE_URL']) delete anakEnv[key]
  const child = spawn('python3', [skrip], {
    cwd: nyata,
    env: anakEnv,
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
  const previousNode = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  process.env.COPILOT_AKAUN_HOST = 'akaun.beshareaisolution.com'
  let ipo = 0
  try {
    const daftar = await fetch(`http://127.0.0.1:${port}/api/akaun/daftar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'aminah@kedai.my', password: 'kata-rahsia' }),
    })
    const akaun = await daftar.json() as { token?: string }
    assert.equal(daftar.status, 200)
    assert.equal(typeof akaun.token, 'string')
    const profil = await fetch(`http://127.0.0.1:${port}/api/akaun/penasihat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${akaun.token}` },
      body: JSON.stringify({
        penasihat: {
          nama: 'Kedai Amanah',
          jualan: 'Kuih kering untuk pejabat kecil',
          peringkat: 'mula',
          mesej: [{ dari: 'klien', teks: 'Macam mana nak susun minggu ini?' }],
        },
      }),
    })
    assert.equal(profil.status, 200)
    const client = createKuotaClient({
      akaunUrl: `http://127.0.0.1:${port}`,
      secret: 'kuta-ujian',
      authorization: `Bearer ${akaun.token}`,
      testLoopback: true,
    })
    const rezab = await client.rezab({
      route: 'copilot_nasihat',
      idempotencyKey: 'idem-sintetik-0001',
      giliran: [{ dari: 'klien', teks: 'Macam mana nak susun minggu ini?' }],
    })
    assert.equal(rezab.ok, true)
    if (rezab.ok) assert.equal(rezab.status, 'reserved')
    const senyap = createKuotaClient({
      akaunUrl: 'https://beshare-ipo-bot.onrender.com',
      secret: 'kuta-ujian',
      authorization: 'Bearer jangan-hantar',
      fetchImpl: async () => {
        ipo += 1
        throw new Error('rangkaian tidak patut')
      },
    })
    const gagal = await senyap.rezab({
      route: 'copilot_nasihat',
      idempotencyKey: 'idem-sintetik-0001',
      giliran: [{ dari: 'klien', teks: 'Macam mana nak susun minggu ini?' }],
    })
    assert.equal(gagal.ok, false)
    assert.equal(ipo, 0)
  } finally {
    child.kill()
    if (previousHost === undefined) delete process.env.COPILOT_AKAUN_HOST
    else process.env.COPILOT_AKAUN_HOST = previousHost
    if (previousNode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNode
    await rm(dir, { recursive: true, force: true })
  }
})
