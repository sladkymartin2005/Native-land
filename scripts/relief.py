# Výřez Severní Ameriky z Natural Earth II (rovnoběžkové zobrazení) převedený do Web Mercatoru pro Leaflet.
import sys, math, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); W, H = im.size; a = np.asarray(im)
LON0, LON1, LAT0, LAT1 = -180.0, 5.0, 5.0, 84.0
ow = 5550
merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
y0, y1 = merc(LAT1), merc(LAT0)
oh = int(round(ow * (y0 - y1) / math.radians(LON1 - LON0)))
ys = y0 - (np.arange(oh) + 0.5) / oh * (y0 - y1)
lats = np.degrees(2 * np.arctan(np.exp(ys)) - math.pi / 2)
rows = np.clip(((90 - lats) / 180 * H).astype(int), 0, H - 1)
lons = LON0 + (np.arange(ow) + 0.5) / ow * (LON1 - LON0)
cols = np.clip(((lons + 180) / 360 * W).astype(int), 0, W - 1)
o = a[rows][:, cols]
img = Image.fromarray(o)
img.save(out, 'JPEG', quality=82, optimize=True, progressive=True)
print(ow, oh)
