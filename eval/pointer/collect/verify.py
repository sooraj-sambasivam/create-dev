# Draw each target's ground-truth box + cursor on its shot.png for human review. Usage: python3 -I verify.py OUT_DIR [id-prefix ...]
import json, os, sys
from PIL import Image, ImageDraw
corpus = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "corpus")
out = sys.argv[1]; pre = sys.argv[2:]
os.makedirs(out, exist_ok=True)
for d in sorted(os.listdir(corpus)):
    if pre and not any(d.startswith(p) for p in pre): continue
    p = os.path.join(corpus, d, "target.json")
    if not os.path.exists(p): continue
    t = json.load(open(p)); im = Image.open(os.path.join(corpus, d, "shot.png")).convert("RGB"); dr = ImageDraw.Draw(im)
    b = t["box"]; dr.rectangle([b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]], outline=(224, 17, 95), width=3)
    c = t["cursor"]; dr.ellipse([c["x"] - 6, c["y"] - 6, c["x"] + 6, c["y"] + 6], fill=(0, 170, 0))
    im.save(os.path.join(out, d + ".png"))
