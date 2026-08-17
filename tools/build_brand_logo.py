from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SIZE = 1254
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "brand-logo.png"
PREVIEW = ROOT / "public" / "brand-logo-preview.png"
FONT_CN = r"C:\Windows\Fonts\HarmonyOS_Sans_SC_Bold.ttf"
FONT_DATA = r"C:\Windows\Fonts\arial.ttf"


def fit_font(text: str, max_width: int, start_size: int) -> ImageFont.FreeTypeFont:
    size = start_size
    while size > 20:
        font = ImageFont.truetype(FONT_CN, size)
        box = font.getbbox(text, stroke_width=0)
        if box[2] - box[0] <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(FONT_CN, size)


def centered_text(draw: ImageDraw.ImageDraw, y: int, text: str, font: ImageFont.FreeTypeFont,
                  fill: str, stroke_width: int = 0, stroke_fill: str | None = None) -> None:
    box = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    width = box[2] - box[0]
    draw.text(((SIZE - width) // 2, y - box[1]), text, font=font, fill=fill,
              stroke_width=stroke_width, stroke_fill=stroke_fill)


canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

# Compact industrial plate with clipped corners and asymmetric rails.
plate = [(142, 154), (196, 100), (1020, 100), (1110, 190), (1110, 925),
         (1044, 991), (210, 991), (142, 923)]
draw.polygon(plate, fill="#0b0d0e")
draw.line(plate + [plate[0]], fill="#f1f2ed", width=10, joint="curve")
draw.line([(178, 194), (178, 895), (226, 943), (1012, 943)], fill="#34393a", width=3)

# System header and calibration marks.
draw.rectangle((190, 142, 520, 188), fill="#fff44f")
data_font = ImageFont.truetype(FONT_DATA, 24)
data_bold = ImageFont.truetype(FONT_DATA, 27)
draw.text((210, 151), "PFW / TERMINAL 00.06", font=data_bold, fill="#0b0d0e")
draw.text((818, 151), "LOCAL CORE", font=data_font, fill="#aeb3b1")
draw.rectangle((1000, 142, 1037, 188), fill="#46c7bb")
draw.rectangle((1043, 142, 1070, 188), fill="#de5fa1")

# Main wordmark. Wide spacing and horizontal rules make it read like a module label.
font_top = fit_font("终端", 820, 350)
font_bottom = fit_font("工作台", 900, 286)
centered_text(draw, 218, "终端", font_top, "#f4f5f1")
draw.rectangle((202, 551, 1052, 565), fill="#fff44f")
draw.rectangle((202, 565, 350, 573), fill="#46c7bb")
draw.rectangle((350, 565, 438, 573), fill="#de5fa1")
centered_text(draw, 578, "工作台", font_bottom, "#f4f5f1")

# Deliberate engineering cuts through the text block.
draw.polygon([(230, 452), (390, 452), (350, 486), (230, 486)], fill="#0b0d0e")
draw.polygon([(867, 739), (1035, 739), (997, 772), (846, 772)], fill="#0b0d0e")

# Footer lockup and technical framing.
draw.rectangle((190, 896, 1070, 902), fill="#f4f5f1")
draw.rectangle((190, 908, 302, 948), fill="#fff44f")
draw.text((324, 915), "PERSONAL FIELD WORKBENCH", font=ImageFont.truetype(FONT_DATA, 28), fill="#f4f5f1")
draw.text((910, 916), "CN / 01", font=data_font, fill="#8f9694")

# Peripheral targeting details.
draw.line((110, 310, 158, 310), fill="#fff44f", width=8)
draw.line((1096, 690, 1144, 690), fill="#fff44f", width=8)
draw.text((92, 333), "01", font=data_font, fill="#8f9694")
draw.text((1121, 711), "06", font=data_font, fill="#8f9694")

canvas.save(OUT, optimize=True)

preview = Image.new("RGB", (SIZE, SIZE), "#e8e9e5")
preview.paste(canvas, mask=canvas.getchannel("A"))
preview.save(PREVIEW, optimize=True)
print(OUT)
