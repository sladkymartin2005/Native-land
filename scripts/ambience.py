# Noční kaňon: cvrčci (krátké trylky na ~4–5 kHz, rozmístění do stran) + tichý vítr. Výstup stereo WAV.
import sys, numpy as np, wave
dur, out = float(sys.argv[1]), sys.argv[2]
sr = 44100; n = int(dur * sr); rng = np.random.default_rng(7)
L = np.zeros(n, np.float32); R = np.zeros(n, np.float32)
t = np.arange(int(0.02 * sr)) / sr
def chirp(freq, pulses, gap):
    env = np.sin(np.pi * np.arange(len(t)) / len(t)) ** 2
    one = np.sin(2 * np.pi * freq * t) * env
    seg = np.zeros(int((pulses * gap + 0.03) * sr), np.float32)
    for p in range(pulses):
        s = int(p * gap * sr); seg[s:s + len(one)] += one
    return seg
for c in range(5):                                         # pět cvrčků v různé vzdálenosti a směru
    freq = rng.uniform(4000, 5200); pan = rng.uniform(-0.9, 0.9); vol = rng.uniform(0.02, 0.06)
    period = rng.uniform(0.7, 1.4); pulses = rng.integers(2, 5); gap = rng.uniform(0.028, 0.04)
    pos = rng.uniform(0, period)
    while pos < dur - 1:
        if rng.random() > 0.15:                            # občas vynechá
            seg = chirp(freq * rng.uniform(0.99, 1.01), pulses, gap) * vol * rng.uniform(0.7, 1.1)
            s = int(pos * sr); e = min(n, s + len(seg)); seg = seg[:e - s]
            L[s:e] += seg * (1 - pan) / 2 * 1.4; R[s:e] += seg * (1 + pan) / 2 * 1.4
        pos += period * rng.uniform(0.9, 1.1)
# vítr: hnědý šum, dolní propust, pomalé zesilování a zeslabování
def brown(k):
    w = np.cumsum(rng.standard_normal(k)).astype(np.float32); w -= np.convolve(w, np.ones(4000) / 4000, 'same'); return w / (np.abs(w).max() + 1e-9)
def lowpass(x, cutoff=700):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr); X *= 1 / (1 + (f / cutoff) ** 4); return np.fft.irfft(X, len(x)).astype(np.float32)
wl, wr = lowpass(brown(n)), lowpass(brown(n)); wl /= np.abs(wl).max(); wr /= np.abs(wr).max()
lfo = (0.55 + 0.45 * np.sin(2 * np.pi * np.arange(n) / sr / 23.0 + 1.3)) * (0.7 + 0.3 * np.sin(2 * np.pi * np.arange(n) / sr / 9.1))
L += wl * lfo * 0.05; R += wr * lfo * 0.05
# plynulý začátek/konec, aby smyčka navazovala
fade = int(3 * sr); ramp = np.linspace(0, 1, fade)
for ch in (L, R): ch[:fade] *= ramp; ch[-fade:] *= ramp[::-1]
st = np.stack([L, R], 1); st = np.clip(st / max(1e-9, np.abs(st).max()) * 0.6, -1, 1)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st * 32767).astype(np.int16).tobytes())
print('ok', dur)
