import json, sys
from PIL import Image, ImageChops
d = sys.argv[1]; labels = json.load(open(f"{d}/labels.json")); res = {}
for vp, ls in labels.items():
    a = Image.open(f"{d}/{vp}-hw.png").convert("RGB"); b = Image.open(f"{d}/{vp}-bg.png").convert("RGB")
    diff = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 8 else 0)
    res[vp] = {}
    for l in ls:
        box = (max(0, int(l["x"])), max(0, int(l["y"])), min(a.width, int(l["x"] + l["w"] + 0.999)), min(a.height, int(l["y"] + l["h"] + 0.999)))
        res[vp][l["t"]] = sum(1 for p in diff.crop(box).getdata() if p)
print(json.dumps(res))
