#!/usr/bin/env python3
"""Campus flame-blue launcher icons for Android densities."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
FONT = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"

SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def paint(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.06
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=size * 0.24,
        fill=(255, 245, 247, 255),
    )
    # flame blob
    draw.ellipse([size * 0.12, size * 0.08, size * 0.72, size * 0.7], fill=(255, 183, 3, 230))
    draw.ellipse([size * 0.28, size * 0.22, size * 0.92, size * 0.92], fill=(37, 99, 235, 220))
    draw.ellipse([size * 0.18, size * 0.38, size * 0.58, size * 0.86], fill=(225, 29, 72, 210))
    font = ImageFont.truetype(FONT, int(size * 0.42))
    text = "日"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2, (size - th) / 2 - size * 0.04), text, font=font, fill="white")
    return img.filter(ImageFilter.SMOOTH)


def main() -> None:
    if not RES.exists():
        raise SystemExit(f"Android res not found: {RES}")
    for folder, size in SIZES.items():
        dest = RES / folder
        dest.mkdir(parents=True, exist_ok=True)
        icon = paint(size)
        icon.save(dest / "ic_launcher.png")
        icon.save(dest / "ic_launcher_round.png")
        icon.save(dest / "ic_launcher_foreground.png")
    # notification small icon: white glyph on transparent
    notif_dir = RES / "drawable"
    notif_dir.mkdir(parents=True, exist_ok=True)
    small = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    d = ImageDraw.Draw(small)
    font = ImageFont.truetype(FONT, 48)
    d.text((14, 6), "日", font=font, fill="white")
    small.save(notif_dir / "ic_stat_days.png")
    # splash screens: pink-blue-flame wash
    splash_sizes = {
        "drawable": (480, 800),
        "drawable-port-mdpi": (320, 480),
        "drawable-port-hdpi": (480, 800),
        "drawable-port-xhdpi": (720, 1280),
        "drawable-port-xxhdpi": (1080, 1920),
        "drawable-port-xxxhdpi": (1440, 2560),
        "drawable-land-mdpi": (480, 320),
        "drawable-land-hdpi": (800, 480),
        "drawable-land-xhdpi": (1280, 720),
        "drawable-land-xxhdpi": (1920, 1080),
        "drawable-land-xxxhdpi": (2560, 1440),
    }
    for folder, (w, h) in splash_sizes.items():
        dest = RES / folder
        dest.mkdir(parents=True, exist_ok=True)
        splash = Image.new("RGB", (w, h), (255, 245, 247))
        sd = ImageDraw.Draw(splash)
        sd.ellipse([-w * 0.2, -h * 0.15, w * 0.7, h * 0.45], fill=(254, 205, 211))
        sd.ellipse([w * 0.35, -h * 0.1, w * 1.2, h * 0.4], fill=(191, 219, 254))
        sd.ellipse([w * 0.2, h * 0.55, w * 1.1, h * 1.2], fill=(255, 183, 3))
        mark = paint(min(w, h) // 4)
        splash.paste(mark, ((w - mark.size[0]) // 2, (h - mark.size[1]) // 2), mark)
        splash.save(dest / "splash.png")
    print("wrote android launcher icons and splash")


if __name__ == "__main__":
    main()
