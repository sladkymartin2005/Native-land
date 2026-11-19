# Složí pohled shora z fotky orla zdola: křídlo natočené kolmo k tělu + zrcadlo, tělo srovnané do osy letu.
# Vstup: vyříznutý orel (průhledné pozadí, hlava vpravo), výstup: eagle-top-{wing-up,wing-down,body}.webp
# Použití: python3 eagle_topview.py vstup.webp vystupni_slozka   (vyžaduje numpy, pillow, opencv-python-headless)
import sys, math, numpy as np, cv2
from PIL import Image, ImageDraw
src, outdir = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert('RGBA'))
H, W = im.shape[:2]
P = lambda pts: [(x / 100 * W, y / 100 * H) for x, y in pts]
def poly_mask(pts):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(P(pts), fill=255); return np.array(m)
alpha = im[..., 3]
# --- křídlo (dolní pravé ve fotce) ---
wmask = poly_mask([(61,46),(100,46),(100,100),(46,100),(50,86),(54,76),(57,66),(60,56)])
wing = im.copy(); wing[..., 3] = np.minimum(alpha, wmask)
R = np.array([56 / 100 * W, 64 / 100 * H])
ys, xs = np.nonzero(wing[..., 3] > 80)
d = (xs - R[0]) ** 2 + (ys - R[1]) ** 2; k = np.argmax(d); T = np.array([xs[k], ys[k]])
a = math.degrees(math.atan2(T[1] - R[1], T[0] - R[0]))
print('wing angle', a, 'len', math.dist(T, R))
M = cv2.getRotationMatrix2D((float(R[0]), float(R[1])), a - 90, 1.0)
big = max(W, H) * 2
M[0, 2] += big / 2 - R[0]; M[1, 2] += big / 2 - R[1]          # kořen křídla do středu velkého plátna
wr = cv2.warpAffine(wing, M, (big, big), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0, 0))
ys, xs = np.nonzero(wr[..., 3] > 20); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
wr = wr[y0:y1 + 1, x0:x1 + 1]; root_in_wr = (big / 2 - x0, big / 2 - y0)
print('wing crop', wr.shape, 'root', root_in_wr)
# --- tělo: hlava, trup, ocas; pařáty vymazat (shora nejsou vidět) ---
bmask = poly_mask([(48,30),(62,30),(61,47),(58,56),(54,68),(50,80),(47,100),(27,100),(28,76),(34,66),(38,57),(43,45)])
body = im.copy(); body[..., 3] = np.minimum(alpha, bmask)
# průhledné okolí má v RGB modrou oblohu – nejdřív ho vyplnit barvou sousedních peří, ať se nepropíše do výplně
rgb = np.ascontiguousarray(body[..., :3])
transp = (body[..., 3] < 200).astype(np.uint8) * 255
small = cv2.resize(rgb, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
tsmall = cv2.resize(transp, (W // 4, H // 4), interpolation=cv2.INTER_NEAREST)
fill = cv2.resize(cv2.inpaint(small, tsmall, 9, cv2.INPAINT_TELEA), (W, H), interpolation=cv2.INTER_CUBIC)
rgb = np.where(transp[..., None] > 0, fill, rgb).astype(np.uint8)
# nohy a pařáty (shora nejsou vidět) přemalovat okolním peřím ocasu
legs = poly_mask([(34,74),(45,73),(47,86),(43,93),(35,93),(32,85)])
hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
talon = ((hsv[..., 0] >= 5) & (hsv[..., 0] <= 32) & (hsv[..., 1] > 80) & (hsv[..., 2] > 70)).astype(np.uint8) * 255
lowmask = np.zeros((H, W), np.uint8); lowmask[int(H * 0.68):, :int(W * 0.5)] = 255
talon = cv2.dilate(cv2.bitwise_and(talon, lowmask), np.ones((21, 21), np.uint8))
rgb = cv2.inpaint(rgb, cv2.bitwise_or(talon, legs), 22, cv2.INPAINT_TELEA)
body[..., :3] = rgb
T0 = np.array([37 / 100 * W, 93 / 100 * H]); H0 = np.array([56 / 100 * W, 40 / 100 * H])
b = math.degrees(math.atan2(H0[1] - T0[1], H0[0] - T0[0])); print('body angle', b, 'len', math.dist(T0, H0))
C = (T0 + H0) / 2
M = cv2.getRotationMatrix2D((float(C[0]), float(C[1])), b, 1.0); M[0, 2] += big / 2 - C[0]; M[1, 2] += big / 2 - C[1]
br = cv2.warpAffine(body, M, (big, big), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0, 0))
ys, xs = np.nonzero(br[..., 3] > 20); bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
br = br[by0:by1 + 1, bx0:bx1 + 1]; bc = (big / 2 - bx0, big / 2 - by0)
blen = br.shape[1]; print('body crop', br.shape)
# --- ocas: nový bílý vějíř z textury peří z hlavy (původní ocas zakrývají nohy) ---
ay = int(round(bc[1])); hb, wb = br.shape[:2]
col_alpha = (br[..., 3] > 128).sum(0)
tailX = int(wb * 0.30)
bw = int(np.median(col_alpha[int(wb * 0.35):int(wb * 0.45)]))           # šířka trupu u ocasu
tl = int(blen * 0.31)
pad = tl + 40
br = np.concatenate([np.zeros((hb, pad, 4), np.uint8), br], 1); bc = (bc[0] + pad, bc[1]); tailX += pad; wb = br.shape[1]
vp = int(bw * 0.6)
br = np.concatenate([np.zeros((vp, wb, 4), np.uint8), br, np.zeros((vp, wb, 4), np.uint8)], 0); bc = (bc[0], bc[1] + vp); ay += vp; hb = br.shape[0]
# trup u ocasu měkce ukončit
# zaoblená záď: uprostřed sahá trup dál dozadu než na bocích
yy0, xx0 = np.mgrid[0:hb, 0:wb].astype(np.float32)
dy = np.clip(np.abs(yy0 - ay) / (bw * 0.5), 0, 1)
edge = tailX + bw * 0.25 - bw * 0.42 * (1 - dy ** 2)
ramp = np.clip((xx0 - edge) / (bw * 0.22), 0, 1)
br[..., 3] = (br[..., 3] * ramp).astype(np.uint8)
# tvar vějíře
rootX, tipX = tailX + int(bw * 0.25), tailX - tl
yy, xx = np.mgrid[0:hb, 0:wb].astype(np.float32)
t = np.clip((rootX - xx) / (rootX - tipX), 0, 1)
half = bw * (0.30 + 0.36 * t)
inside = (np.abs(yy - ay) <= half) & (xx <= rootX) & (xx >= tipX - bw * 0.25)
# zaoblený konec s vroubky jednotlivých per
ang = np.arctan2(yy - ay, rootX - xx); nfeat = 12
scallop = 0.035 * (rootX - tipX) * np.abs(np.sin(ang * nfeat * 1.9))
endR = (rootX - tipX) - scallop + bw * 0.12 * np.cos(np.clip(ang * 1.4, -1.5, 1.5))
rad = np.hypot(rootX - xx, (yy - ay) * 0.55)
fan = inside & (rad <= endR)
# textura: bílé peří z hlavy
hx0, hx1, hy0, hy1 = int(0.505 * W), int(0.565 * W), int(0.40 * H), int(0.52 * H)
patch = im[hy0:hy1, hx0:hx1, :3]
ty0, ty1 = int(ay - bw * 0.7), int(ay + bw * 0.7); tx0, tx1 = int(tipX - bw * 0.3), int(rootX)
tex = cv2.resize(patch, (tx1 - tx0, ty1 - ty0), interpolation=cv2.INTER_CUBIC).astype(np.float32)
rgb = np.zeros((hb, wb, 3), np.float32); rgb[ty0:ty1, tx0:tx1] = tex
# linky mezi pery a stínování (tmavší u kořene a na okrajích)
lines = 1 - 0.13 * np.clip(1 - np.abs(np.sin(ang * nfeat * 0.95)) * 6, 0, 1) * (t > 0.25)
shade = (0.78 + 0.22 * t) * (1 - 0.18 * (np.abs(yy - ay) / np.maximum(half, 1)) ** 3)
rgb = rgb * (lines * shade)[..., None]
fa = cv2.GaussianBlur(fan.astype(np.float32), (5, 5), 0)
tailL = np.zeros_like(br); tailL[..., :3] = rgb.clip(0, 255).astype(np.uint8); tailL[..., 3] = (fa * 255).astype(np.uint8)
# ocas pod trup
a_s = br[..., 3:4].astype(np.float32) / 255; a_d = tailL[..., 3:4].astype(np.float32) / 255
a_o = a_s + a_d * (1 - a_s)
out = (br[..., :3] * a_s + tailL[..., :3] * a_d * (1 - a_s)) / np.maximum(a_o, 1e-6)
br = np.concatenate([out, a_o * 255], -1).clip(0, 255).astype(np.uint8)
blen = wb - pad + tl
# --- proporce: polovina rozpětí ≈ 1,05 × délka těla; tětiva křídla rozšířit (ve fotce je zkrácená perspektivou) ---
L = wr.shape[0] - root_in_wr[1]
sy = blen * 1.05 / L; sx = sy * 1.9
wr2 = cv2.resize(wr, (max(1, int(wr.shape[1] * sx)), max(1, int(wr.shape[0] * sy))), interpolation=cv2.INTER_AREA)
rw = (root_in_wr[0] * sx, root_in_wr[1] * sy)
print('scaled wing', wr2.shape)
# --- poskládat na plátno: let doprava, rozpětí svisle ---
span = 2 * (wr2.shape[0] - rw[1]) + 40
CW, CH = int(blen + 2 * max(0, wr2.shape[1]) ), int(span + 40)
cx, cy = CW // 2, CH // 2
def paste(dst, src, x, y):
    h, w = src.shape[:2]; x, y = int(round(x)), int(round(y))
    sx0, sy0 = max(0, -x), max(0, -y); dx0, dy0 = max(0, x), max(0, y)
    w2, h2 = min(w - sx0, dst.shape[1] - dx0), min(h - sy0, dst.shape[0] - dy0)
    s = src[sy0:sy0 + h2, sx0:sx0 + w2].astype(np.float32); d = dst[dy0:dy0 + h2, dx0:dx0 + w2].astype(np.float32)
    a_s = s[..., 3:4] / 255; a_d = d[..., 3:4] / 255; a_o = a_s + a_d * (1 - a_s)
    rgb = (s[..., :3] * a_s + d[..., :3] * a_d * (1 - a_s)) / np.maximum(a_o, 1e-6)
    dst[dy0:dy0 + h2, dx0:dx0 + w2] = np.concatenate([rgb, a_o * 255], -1).clip(0, 255).astype(np.uint8)
blank = lambda: np.zeros((CH, CW, 4), np.uint8)
shoulder_x = cx + blen * 0.06                                   # křídla nasazená kousek před středem těla
lower, upper, bodyL = blank(), blank(), blank()
paste(lower, wr2, shoulder_x - rw[0], cy + 6 - rw[1] + 0)
upper[:] = lower[::-1]                                         # zrcadlo = druhé křídlo
paste(bodyL, br, cx - bc[0], cy - bc[1])
ys, xs = np.nonzero((lower[..., 3] > 10) | (upper[..., 3] > 10) | (bodyL[..., 3] > 10))
X0, X1, Y0, Y1 = xs.min() - 8, xs.max() + 8, ys.min() - 8, ys.max() + 8
for name, arr in (('wing-up', upper), ('wing-down', lower), ('body', bodyL)):
    a = arr[Y0:Y1, X0:X1]
    img = Image.fromarray(a, 'RGBA')
    img = img.resize((round(img.width * 1800 / img.height), 1800), Image.LANCZOS)
    img.save(f'{outdir}/eagle-top-{name}.webp', 'WEBP', quality=86, method=6)
full = blank(); paste(full, lower, 0, 0); paste(full, upper, 0, 0); paste(full, bodyL, 0, 0)
f = Image.fromarray(full[Y0:Y1, X0:X1], 'RGBA'); bg = Image.new('RGBA', f.size, (232, 220, 196, 255)); bg.alpha_composite(f)
bg = bg.convert('RGB'); bg.thumbnail((1400, 1400)); bg.save(f'{outdir}/preview.jpg', quality=90)
print('canvas', (X1 - X0, Y1 - Y0), 'shoulder_y_frac', (cy - Y0) / (Y1 - Y0))
