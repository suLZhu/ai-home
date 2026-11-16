import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sulzhu.aihome',
  appName: '栖间',
  webDir: 'dist',
  android: {
    // WebView 页面源是 https://localhost，局域网后端是纯 http://192.168.x.x:4180；
    // 不放开混合内容，页面里的 fetch 与 <img> 会被内核按 mixed content 拦下。
    // 本 App 只加载包内本地资源，放开的目标仅是用户自己填的 API 地址。
    allowMixedContent: true
  }
};

export default config;
