// 软键盘高度判定（纯逻辑，可单测）。
// 两条检测路径，优先级：
//   1) visualViewport 重叠：Android <11 用 SOFT_INPUT_ADJUST_RESIZE 时窗口会缩小，
//      WebView 真实高度变小，overlap = innerHeight - vv.height - vv.offsetTop 即键盘高度。
//   2) 原生回传的 --native-ime-bottom：Android 11+ edge-to-edge 下窗口不再随 IME 缩小，
//      visualViewport 量不到键盘，只能靠原生 ime inset 兜底。
//
// 返回：
//   open       是否判定键盘打开
//   source     'visualViewport' | 'native' | 'none'
//   height     键盘高度（px，已取整）
//   visualHeight  给聊天锁用的可视高度（px）：
//                - visualViewport 路径 = vv.height（窗口已缩小，直接用）
//                - native 路径 = innerHeight - height（窗口未缩小，需自己留出键盘）
export function computeKeyboardState({ innerHeight, vvHeight, vvOffsetTop, innerWidth, nativeIme }) {
  const vvOverlap = Math.max(0, innerHeight - vvHeight - Math.max(0, vvOffsetTop));
  const vvDetected = vvOverlap > 90 && innerWidth <= 700;
  const nativeDetected = nativeIme > 90;
  if (vvDetected) {
    return { open: true, source: 'visualViewport', height: Math.round(vvOverlap), visualHeight: Math.round(vvHeight) };
  }
  if (nativeDetected) {
    return { open: true, source: 'native', height: Math.round(nativeIme), visualHeight: Math.round(innerHeight - nativeIme) };
  }
  return { open: false, source: 'none', height: 0, visualHeight: 0 };
}
