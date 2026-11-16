#!/usr/bin/env python3
"""栖间品牌资源生成器（幂等；两张原图母版只读，从不覆盖）。

用法：python scripts/build_brand_assets.py     （需要 Pillow）

产出：
  brand/qijian-icon-source.png          Launcher 简化裁切版母版（正方形米白底）
  brand/qijian-icon-foreground.png      Adaptive Icon foreground 母版（透明底 + safe zone）
  public/brand/light/*.png              前端运行时资源（浅色）
  public/brand/dark/fallback.json       深色资源预留；当前明确回退到 light
  public/favicon.png                    浏览器标签图标（同一套简化裁切）
  android/.../mipmap-*/ic_launcher*.png  按 5 档密度从母版重新采样，不复制同一张 PNG
  android/.../drawable*/splash.png       启动页：米白 + 完整图片1 Logo 居中

设计约束：只做原图裁切 / 等比缩放 / 背景平铺，不重绘、不 AI 生成、不改字体与花色。
"""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).resolve().parents[1]
MASTER_PRIMARY = ROOT / 'brand/masters/qijian-logo-primary.jpg'
MASTER_ORNAMENTAL = ROOT / 'brand/masters/qijian-logo-ornamental.jpg'
ANDROID_RES = ROOT / 'android/app/src/main/res'
PUBLIC_BRAND = ROOT / 'public/brand'

# 原图四角实测色 (253,248,242)，全部衍生资源与 Android background 用同一米白，拼接无接缝。
BG = (253, 248, 242)
BG_HEX = '#FDF8F2'

# 图片 1 的 Launcher 简化裁切框（原始 1254px 坐标）：
# 完整保留「栖」x510-710/y360-620、「间」x530-720/y680-980、右上主花 x750-950/y230-400、
# 左下花 x370-520/y780-900 与缠绕字形的黑色藤蔓；去掉左右外围长弧细枝和大量空白。
ICON_CROP = (370, 195, 965, 1010)

# 内容占画布高度的比例。foreground 取 0.56：核心字形与两朵主花都落在
# Android adaptive icon 中心 66dp 圆形 safe zone 内（108dp 画布）。
FILL_SOURCE = 0.90       # legacy 方形图标 / 简化裁切母版
FILL_ROUND = 0.72        # legacy 圆形图标，四角在圆内安全
FILL_FOREGROUND = 0.58   # adaptive icon foreground
FILL_SPLASH_W = 0.74     # 启动页 Logo 相对屏宽上限
FILL_SPLASH_H = 0.62     # 启动页 Logo 相对屏高上限


def masters():
    primary = Image.open(MASTER_PRIMARY).convert('RGB')
    ornamental = Image.open(MASTER_ORNAMENTAL).convert('RGB')
    assert primary.size == ornamental.size == (1254, 1254), '母版尺寸异常，请检查是否被覆盖'
    return primary, ornamental


def icon_crop(primary):
    """只裁一次，不重绘：所有图标衍生资源都从这块高分辨率内容重新采样。"""
    return primary.crop(ICON_CROP)


def compose(crop, size, fill, *, transparent=False, square=True):
    """把裁切内容等比缩放后居中放进正方形画布。"""
    w, h = (size, size) if square else size
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0) if transparent else BG + (255,))
    ratio = min((h * fill) / crop.height, (w * fill) / crop.width)
    cw, ch = max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio))
    content = crop.resize((cw, ch), Image.LANCZOS).convert('RGBA')
    canvas.alpha_composite(content, ((w - cw) // 2, (h - ch) // 2))
    return canvas


def splash(full_logo, size):
    """启动页：整张图片 1（不裁切、保持原构图与比例）居中，米白纯底。"""
    w, h = size
    side = min(w * FILL_SPLASH_W, h * FILL_SPLASH_H)
    side = int(side)
    logo = full_logo.resize((side, side), Image.LANCZOS).convert('RGBA')
    canvas = Image.new('RGBA', (w, h), BG + (255,))
    canvas.alpha_composite(logo, ((w - side) // 2, (h - side) // 2))
    return canvas.convert('RGB')


def save(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    return path


def main():
    primary, ornamental = masters()
    crop = icon_crop(primary)

    # 1) 品牌目录里的衍生母版（高分辨率，不进 APK，供以后重新生成任意尺寸）
    save(compose(crop, 1024, FILL_SOURCE), ROOT / 'brand/qijian-icon-source.png')
    save(compose(crop, 1024, FILL_FOREGROUND, transparent=True),
         ROOT / 'brand/qijian-icon-foreground.png')

    # 2) 前端运行时资源：light 四件套；dark 只预留结构，明确 fallback 到 light
    save(primary.resize((1024, 1024), Image.LANCZOS).convert('RGBA'),
         PUBLIC_BRAND / 'light/qijian-logo-primary-light.png')
    save(ornamental.resize((1024, 1024), Image.LANCZOS).convert('RGBA'),
         PUBLIC_BRAND / 'light/qijian-logo-ornamental-light.png')
    save(compose(crop, 512, FILL_SOURCE),
         PUBLIC_BRAND / 'light/qijian-icon-light.png')
    save(compose(crop, 512, FILL_FOREGROUND, transparent=True),
         PUBLIC_BRAND / 'light/qijian-icon-foreground-light.png')
    (PUBLIC_BRAND / 'dark').mkdir(parents=True, exist_ok=True)
    (PUBLIC_BRAND / 'dark/fallback.json').write_text(json.dumps({
        'status': 'reserved',
        'note': '深色版 Logo 尚未设计；当前 dark 一律回退到 light，仅对承载背景做安全适配。',
        'fallbackTo': 'light',
        'reservedKeys': ['qijian-logo-primary-dark', 'qijian-logo-ornamental-dark',
                         'qijian-icon-dark', 'qijian-icon-foreground-dark'],
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # 浏览器标签：同一套简化裁切，不做第二套造型
    save(compose(crop, 128, FILL_SOURCE), ROOT / 'public/favicon.png')

    # 3) Android launcher 图标：每档密度都从 1254px 母版重新采样，不复制同一 PNG
    densities = {
        'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216),
        'xxhdpi': (144, 324), 'xxxhdpi': (192, 432),
    }
    for dpi, (legacy, foreground) in densities.items():
        folder = ANDROID_RES / ('mipmap-' + dpi)
        save(compose(crop, legacy, FILL_SOURCE).convert('RGBA'),
             folder / 'ic_launcher.png')
        save(compose(crop, legacy, FILL_ROUND).convert('RGBA'),
             folder / 'ic_launcher_round.png')
        save(compose(crop, foreground, FILL_FOREGROUND, transparent=True),
             folder / 'ic_launcher_foreground.png')

    # 4) Android 启动页资源：竖屏 / 横屏 / 默认，共 11 张，全部米白 + 完整 Logo
    port = {'mdpi': (320, 480), 'hdpi': (480, 720), 'xhdpi': (640, 960),
            'xxhdpi': (960, 1440), 'xxxhdpi': (1280, 1920)}
    land = {'mdpi': (480, 320), 'hdpi': (720, 480), 'xhdpi': (960, 640),
            'xxhdpi': (1440, 960), 'xxxhdpi': (1920, 1280)}
    for dpi, size in port.items():
        save(splash(primary, size), ANDROID_RES / ('drawable-port-' + dpi) / 'splash.png')
    for dpi, size in land.items():
        save(splash(primary, size), ANDROID_RES / ('drawable-land-' + dpi) / 'splash.png')
    save(splash(primary, (480, 320)), ANDROID_RES / 'drawable/splash.png')

    # 4b) 正式启动页：layer-list 用 dp 固定 Logo 尺寸，避免 windowBackground 的 PNG
    #     被不同屏幕比例拉伸导致「栖间」字形与花枝变形。完整图片 1，不裁切、不动画。
    save(primary.resize((1024, 1024), Image.LANCZOS).convert('RGBA'),
         ANDROID_RES / 'drawable/qijian_logo_primary.png')
    (ANDROID_RES / 'drawable/splash_brand.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!-- 栖间启动页：米白纯底 + 完整主 Logo 居中，无 spinner / 文案 / 版本号 / 渐变。\n'
        '     用 260dp 固定尺寸而非拉伸整张 PNG，保证原图比例与构图不被屏幕比例改变。 -->\n'
        '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <item android:drawable="@color/qijian_brand_background" />\n'
        '    <item android:gravity="center" android:width="260dp" android:height="260dp">\n'
        '        <bitmap android:src="@drawable/qijian_logo_primary" android:gravity="fill" />\n'
        '    </item>\n'
        '</layer-list>\n', encoding='utf-8')

    # 5) 与米白底一致的 adaptive icon background 色值
    (ANDROID_RES / 'values/ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        '    <color name="ic_launcher_background">%s</color>\n'
        '    <color name="qijian_brand_background">%s</color>\n'
        '</resources>\n' % (BG_HEX, BG_HEX), encoding='utf-8')

    print('brand assets rebuilt from masters; bg=%s crop=%s' % (BG_HEX, ICON_CROP))


if __name__ == '__main__':
    main()
