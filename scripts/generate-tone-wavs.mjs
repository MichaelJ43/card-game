/**
 * Writes short placeholder WAV cues into public/sounds/ (PCM 16-bit mono).
 * Run: node scripts/generate-tone-wavs.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'sounds')

function writeWavFromSamples(samples, sampleRate, outPath) {
  const n = samples.length
  const dataSize = n * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2)
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, buf)
}

function sineBurst(sampleRate, freq, durationSec, amp = 0.22) {
  const len = Math.floor(sampleRate * durationSec)
  const out = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate
    const env = Math.min(1, i / 80) * Math.min(1, (len - 1 - i) / 200)
    const s = Math.sin(2 * Math.PI * freq * t) * amp * env
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
  }
  return out
}

function concatSamples(parts) {
  const total = parts.reduce((a, p) => a + p.length, 0)
  const out = new Int16Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const sr = 22050

// Chat: quick bright ping
const chat = sineBurst(sr, 920, 0.1, 0.2)

// Turn: two-tone “ding”
const turnA = sineBurst(sr, 620, 0.08, 0.2)
const turnGap = new Int16Array(Math.floor(sr * 0.04))
const turnB = sineBurst(sr, 880, 0.1, 0.22)
const turn = concatSamples([turnA, turnGap, turnB])

// Flip: short tick
const flip = sineBurst(sr, 1400, 0.055, 0.16)

writeWavFromSamples(chat, sr, path.join(outDir, 'chat.wav'))
writeWavFromSamples(turn, sr, path.join(outDir, 'turn.wav'))
writeWavFromSamples(flip, sr, path.join(outDir, 'flip.wav'))

console.log('Wrote', path.join(outDir, 'chat.wav'), 'turn.wav', 'flip.wav')
