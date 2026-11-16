// 栖间品牌资源单一入口：Brand Tokens → Components → Pages。
// 两张原图母版在 brand/masters/，只裁切/等比缩放，不重绘、不生成、不覆盖。
// 深色版 Logo 尚未设计：dark 结构已预留，当前一律安全回退到 light，
// 后续出品正式深色 Logo 时只需在这里切换路径，页面无需改动。
export const BRAND_NAME = '栖间'
export const BRAND_BG = '#FDF8F2'

const LIGHT = '/brand/light'
export const BRAND_ASSETS = {
  logoPrimary: `${LIGHT}/qijian-logo-primary-light.png`,
  logoOrnamental: `${LIGHT}/qijian-logo-ornamental-light.png`,
  icon: `${LIGHT}/qijian-icon-light.png`,
  iconForeground: `${LIGHT}/qijian-icon-foreground-light.png`,
} as const

export type BrandAssetKey = keyof typeof BRAND_ASSETS

/** dark 资源预留：正式深色 Logo 完成前不臆造，直接回退 light。 */
export function brandAsset(key: BrandAssetKey, dark = false): string {
  void dark
  return BRAND_ASSETS[key]
}
