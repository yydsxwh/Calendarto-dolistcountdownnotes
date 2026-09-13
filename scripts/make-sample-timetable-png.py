#!/usr/bin/env python3
"""Render public/samples/course-grid.png with a CJK-capable font."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples" / "course-grid.png"
FONT_PATHS = [
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
]

HEADERS = ["节次/时间", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]
ROWS = [
    (
        "第1-2节\n08:00-09:40",
        "高等数学\n1-16周\n教学楼A101\n王老师",
        "",
        "大学英语\n1-16周\n外语楼203\n李老师",
        "",
        "程序设计\n1-16周\n机房B2\n赵老师",
        "",
        "",
    ),
    (
        "第3-4节\n10:00-11:40",
        "",
        "线性代数\n1-16周\n理科楼305\n陈老师",
        "",
        "大学物理\n1-16周\n实验楼1-02\n周老师",
        "",
        "",
        "",
    ),
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    raise SystemExit("Need a CJK font to render the sample timetable PNG")


def main() -> None:
    col_w = [168] + [150] * 7
    row_h = [52] + [148] * 2
    width = sum(col_w) + 1
    height = sum(row_h) + 1
    img = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(img)
    title = load_font(20)
    body = load_font(18)

    y = 0
    for r, heights in enumerate([None, *ROWS]):
        x = 0
        h = row_h[r]
        for c, w in enumerate(col_w):
            if r == 0:
                draw.rectangle([x, y, x + w, y + h], fill="#0ea5e9")
                text = HEADERS[c]
                font = title
                fill = "#ffffff"
            else:
                draw.rectangle([x, y, x + w, y + h], fill="#f8fafc" if c == 0 else "#ffffff")
                text = heights[c]
                font = body
                fill = "#0f172a"
            draw.rectangle([x, y, x + w, y + h], outline="#cbd5e1")
            if text:
                bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=6, align="center")
                tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
                draw.multiline_text(
                    (x + (w - tw) / 2, y + (h - th) / 2),
                    text,
                    font=font,
                    fill=fill,
                    spacing=6,
                    align="center",
                )
            x += w
        y += h

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG")
    print(f"wrote {OUT} {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
