# Výřez lodí z fotek: obloha podle barvy (zachová lanoví), trup a části před pevninou podle ručního obrysu.
import sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter
src, out = sys.argv[1], sys.argv[2]

def poly_mask(W, H, pts, scale=4):
    m = Image.new('L', (W * scale, H * scale), 0)
    ImageDraw.Draw(m).polygon([(x / 100 * W * scale, y / 100 * H * scale) for x, y in pts], fill=255)
    return np.asarray(m.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255

def sky_alpha(a, rows, xl=(0, 3), xr=(95, 100), t0=22, t1=58):
    H, W = a.shape[:2]
    al = np.zeros((H, W), np.float32)
    xs = np.arange(W)[None, :] / W
    for y in range(rows):
        L = np.median(a[y, int(xl[0] / 100 * W):int(xl[1] / 100 * W)], axis=0)
        R = np.median(a[y, int(xr[0] / 100 * W):int(xr[1] / 100 * W)], axis=0)
        sky = L[None, :] * (1 - xs.T) + R[None, :] * xs.T          # vodorovný přechod barvy oblohy
        d = np.sqrt(((a[y] - sky) ** 2).sum(-1))
        al[y] = np.clip((d - t0) / (t1 - t0), 0, 1)
    return al

def finish(rgb, alpha, bbox_pad=6):
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)
    a8 = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    # odstranit drobný šum (osamocené pixely oblohy)
    n, lab, st, _ = cv2.connectedComponentsWithStats((a8 > 40).astype(np.uint8), 8)
    keep = np.zeros_like(a8, bool)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 60: keep |= lab == i
    a8 = np.where(keep | (a8 > 200), a8, 0).astype(np.uint8)
    ys, xs = np.nonzero(a8 > 20)
    x0, x1, y0, y1 = max(0, xs.min() - bbox_pad), xs.max() + bbox_pad, max(0, ys.min() - bbox_pad), ys.max() + 1
    img = Image.fromarray(np.dstack([rgb, a8])[y0:y1, x0:x1].astype(np.uint8), 'RGBA')
    return img

a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W = a.shape[:2]
kind = sys.argv[3]
if kind == 'sm':
    split = int(0.672 * H)                                     # pod touto čarou je pevnina a voda
    al = np.zeros((H, W), np.float32)
    al[:split] = sky_alpha(a[:split], split)
    hull = poly_mask(W, H, [(17.0,66.0),(17.4,70),(18.2,75),(19.0,79),(19.8,82),(20.8,84.4),(22,85.2),(30,85.6),(40,85.7),(50,85.6),(60,85.4),(70,85.0),(78,84.6),(81.5,84.0),(83.5,82.3),(85,79.5),(85.6,76),(85.8,70),(85.9,66.0),(57.6,66.0),(57.5,74.6),(50,75.3),(45,75.0),(40,74.0),(35,72.8),(30,71.6),(25,70.4),(21,69.2),(18.3,67.9),(17.9,66.0)])
    al[split - 6:] = 0
    masts = [poly_mask(W, H, q) for q in (
        [(49.9,60.0),(51.6,60.0),(51.6,75.6),(49.9,75.6)],      # hlavní stěžeň pod plachtou
        [(22.0,64.0),(23.6,64.0),(23.6,70.5),(22.0,70.5)],      # přední stěžeň
    )]
    lum = a.mean(-1)
    dark = np.clip((150 - lum) / 40, 0, 1)
    masts = [m * dark for m in masts]
    yy, xx = np.mgrid[0:H, 0:W]
    # světlý opar nad obzorem v podpalubí: pryč (kromě stěžňů)
    al[(yy > 0.648 * H) & (yy < split) & (xx > 0.175 * W) & (xx < 0.575 * W)] = 0
    al = np.maximum.reduce([al, hull] + masts)
    # obzor a pevnina vedle lodi (nad čarou rozdělení zůstal tenký pruh)
    al[(yy > 0.61 * H) & ((xx < 0.168 * W) | (xx > 0.862 * W))] = 0
    # americká vlajka na zadním stěžni do roku 1492 nepatří
    fx0, fx1, fy0, fy1 = int(0.8105 * W), int(0.85 * W), int(0.243 * H), int(0.298 * H)
    al[fy0:fy1, fx0:fx1] = 0
    # pod čarou ponoru nic
    al[int(0.858 * H):] = 0
    rgb = a.copy()
    # odstranit modrý nádech oblohy na okrajích plachet a lan
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lim = np.maximum(r, g) * 1.06 + 8
    rgb[..., 2] = np.where(al < 0.97, np.minimum(b, lim), b)
else:
    sail = poly_mask(W, H, [(17.0,74.2),(17.5,73.2),(82.4,15.3),(83.3,16.0),(83.2,20.5),(82.0,25.5),(80.8,32.5),(78.6,34.5),(77.7,40),(77.1,44.0),(85.5,36.0),(86.4,37.8),(86.2,40.5),(85.0,42.0),(83.6,47),(82.6,55),(82.0,62),(81.0,67.5),(79.2,70.8),(70,70.8),(60,70.6),(45,70.6),(30,70.8),(27.0,70.8),(18.2,74.6)])
    hull = poly_mask(W, H, [(24.8,76.5),(27.5,75.3),(30,76.0),(40,76.5),(50,76.0),(52,72.4),(60,72.2),(70.3,72.6),(70.5,80),(70.0,86.6),(68.5,87.7),(60,88.1),(45,88.3),(32,88.3),(28.0,87.9),(26.5,84),(25.2,80),(24.6,78)])
    masts = [poly_mask(W, H, p) for p in (
        [(44.3,70.4),(45.7,70.4),(45.7,76.6),(44.3,76.6)],
        [(57.0,70.4),(58.4,70.4),(58.4,72.6),(57.0,72.6)],
        [(24.2,70.5),(28.6,69.3),(28.7,75.6),(24.2,74.4)],
        [(41.3,29.4),(43.4,29.4),(44.6,48.8),(42.6,48.8)],
        [(39.7,29.6),(41.6,29.6),(41.6,33.2),(39.9,33.2)],
    )]
    # zadní stěžeň a výřez mezi plachtami: ponechat jen tmavé / nebeské pozadí odlišné pixely
    lum = a.mean(-1)
    dark = np.clip((175 - lum) / 45, 0, 1)
    masts[3] = masts[3] * dark; masts[4] = masts[4] * dark
    al = np.maximum.reduce([sail, hull] + masts)
    # oblast vlajky na ráhnu: obloha je růžovobílá, vlajka bílá -> porovnat s místní barvou oblohy
    bx0, bx1, by0, by1 = int(0.765 * W), int(0.875 * W), int(0.14 * H), int(0.705 * H)
    sky = np.median(a[by0:by1, int(0.88 * W):int(0.95 * W)].reshape(-1, 3), axis=0)
    d = np.sqrt(((a[by0:by1, bx0:bx1] - sky) ** 2).sum(-1))
    sub = np.clip((d - 14) / 26, 0, 1)
    al[by0:by1, bx0:bx1] *= sub
    rgb = a.copy()
img = finish(rgb, al)
img.save(out)
print(out, img.size)
