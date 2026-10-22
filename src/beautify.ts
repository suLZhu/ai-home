// 美化包注册表。切换美化包 = 在 .shell 根节点挂不同的 CSS 类，
// 只改变视觉，不影响聊天记录、记忆、模型与数据。
//
// 新增美化包的步骤（无需改动业务代码）：
// 1) 新建 src/beautify-<id>.css，所有选择器以 .beautify-<id> 开头（照抄 pixel.css 的写法，
//    需要覆盖组件原样式时用 !important，因为组件 CSS 可能同特异性）。
// 2) 在 App.tsx 顶部 import 该 CSS（放在 pixel.css 之后导入，保证覆盖顺序）。
// 3) 在下面 BEAUTIFY_PACKS 里加一条注册即可 —— 设置页「美化」会自动出现新开关行，
//    根据 cssClass 自动应用。纯新增，不需要触碰其他文件。

export type BeautifyPack = {
  id: string
  name: string
  description: string
  /** 挂在 .shell 根节点上的类名；空串 = 普通模式（无附加样式） */
  cssClass: string
}

export const BEAUTIFY_PACKS: BeautifyPack[] = [
  { id: 'pixel', name: '像素风', description: '黑白像素选框、硬边控件与灰度图标', cssClass: 'beautify-pixel' },
  { id: 'plain', name: '简洁风', description: '原生奶灰浅紫，干净轻量无附加装饰', cssClass: '' },
]

export const DEFAULT_BEAUTIFY_PACK = 'pixel'
