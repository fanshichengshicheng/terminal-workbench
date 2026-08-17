from pathlib import Path

from PIL import Image, ImageFilter
from rembg import new_session, remove


SOURCE = Path(r"C:\Users\Lenovo\AppData\Local\Temp\codex-clipboard-d3a07005-89a3-41ce-b1ff-a421eb8d64e4.png")
OUTPUT_DIR = Path(r"G:\Git_project\工作台\剪影")
OUTPUT = OUTPUT_DIR / "角色纯白剪影.png"


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
source = Image.open(SOURCE).convert("RGBA")
cutout = remove(
    source,
    session=new_session("isnet-anime"),
    alpha_matting=True,
    alpha_matting_foreground_threshold=240,
    alpha_matting_background_threshold=10,
    alpha_matting_erode_size=5,
).convert("RGBA")

alpha = cutout.getchannel("A").filter(ImageFilter.GaussianBlur(0.35))
alpha = alpha.point(lambda value: 255 if value >= 24 else 0)
silhouette = Image.new("RGBA", source.size, (255, 255, 255, 0))
silhouette.putalpha(alpha)
silhouette.save(OUTPUT, optimize=True)

preview = Image.new("RGBA", source.size, (20, 20, 20, 255))
preview.alpha_composite(silhouette)
preview.convert("RGB").save(OUTPUT_DIR / "角色纯白剪影_黑底预览.jpg", quality=95)
print(OUTPUT)
