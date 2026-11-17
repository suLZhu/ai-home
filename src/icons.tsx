// 极简基线：功能图标统一以 <img> 图片资源渲染，不再把 SVG 节点直接塞进页面。
// 当前先固定黑灰色，后续如果恢复“手机主题”再按主题替换整套图片资源。
import type { ReactElement } from 'react'

export type IconProps = { size?: number; className?: string }
export type IconComponent = (props: IconProps) => ReactElement

const RAW: Record<string,string> = {
  "home":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 10.5 12 4l8 6.5\" />\n  <path d=\"M6 9.6V20h12V9.6\" />\n  <path d=\"M10 20v-5.5h4V20\" /></svg>",
  "chat":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16A2.5 2.5 0 0 1 4 13.5Z\" />\n  <path d=\"M8 9h8M8 12.5h5\" /></svg>",
  "user":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"8\" r=\"3.6\" />\n  <path d=\"M5 20c.9-3.6 3.6-5.4 7-5.4s6.1 1.8 7 5.4\" /></svg>",
  "settings":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 7h9.5\" />\n  <circle cx=\"16.5\" cy=\"7\" r=\"2.3\" />\n  <path d=\"M20 17h-9.5\" />\n  <circle cx=\"7.5\" cy=\"17\" r=\"2.3\" /></svg>",
  "clock":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8\" />\n  <path d=\"M12 7.5V12l3 2\" /></svg>",
  "memory":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3.6 13.8 9l5.4 1.8-5.4 1.8L12 18.4l-1.8-5.8L4.8 10.8 10.2 9Z\" />\n  <path d=\"M18.5 15.5v4M16.5 17.5h4\" /></svg>",
  "grid":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.6\" />\n  <rect x=\"13.5\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.6\" />\n  <rect x=\"4\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.6\" />\n  <rect x=\"13.5\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.6\" /></svg>",
  "calendar":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"5.5\" width=\"16\" height=\"14\" rx=\"2.2\" />\n  <path d=\"M4 9.5h16M8.5 3.5v4M15.5 3.5v4\" /></svg>",
  "coffee":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 8h11v5.5a5.5 5.5 0 0 1-11 0Z\" />\n  <path d=\"M16 9.5h1.8a2.7 2.7 0 0 1 0 5.4H16\" />\n  <path d=\"M5 20h12\" /></svg>",
  "photo":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"5\" width=\"16\" height=\"14\" rx=\"2.2\" />\n  <circle cx=\"9\" cy=\"10\" r=\"1.6\" />\n  <path d=\"m5 17 4.5-4 3 2.5L16 12l4 4\" /></svg>",
  "music":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 18V6.5l9-2v11\" />\n  <circle cx=\"7.5\" cy=\"18\" r=\"2\" />\n  <circle cx=\"16.5\" cy=\"15.5\" r=\"2\" /></svg>",
  "ledger":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8\" />\n  <path d=\"M9 8.5 12 12l3-3.5M12 12v5M9.5 14h5\" /></svg>",
  "book":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6.5 4H18a1 1 0 0 1 1 1v15H8a2 2 0 0 1-2-2Z\" />\n  <path d=\"M6.5 4v14M6 20h13\" /></svg>",
  "plus":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 12H18M12 6V18\" /></svg>",
  "sun":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\" />\n  <path d=\"M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4\" /></svg>",
  "star":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3.2 14.3 9.7 20.8 12l-6.5 2.3L12 20.8l-2.3-6.5L3.2 12l6.5-2.3Z\" /></svg>",
  "flower":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"2.2\" />\n  <path d=\"M12 9.8V5.5M14.1 10.8l3.6-2.1M14.1 13.2l3.6 2.1M12 14.2v4.3M9.9 13.2l-3.6 2.1M9.9 10.8 6.3 8.7\" />\n  <circle cx=\"12\" cy=\"4.2\" r=\"1.4\" />\n  <circle cx=\"18.6\" cy=\"8\" r=\"1.4\" />\n  <circle cx=\"18.6\" cy=\"16\" r=\"1.4\" />\n  <circle cx=\"12\" cy=\"19.8\" r=\"1.4\" />\n  <circle cx=\"5.4\" cy=\"16\" r=\"1.4\" />\n  <circle cx=\"5.4\" cy=\"8\" r=\"1.4\" /></svg>",
  "list":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6h12M8 12h12M8 18h12\" />\n  <path d=\"M4 6h.01M4 12h.01M4 18h.01\" /></svg>",
  "palette":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 21a9 9 0 1 1 9-9c0 2-1.8 3.2-3.8 3.2h-1.4a1.8 1.8 0 0 0-1.4 2.9 1.6 1.6 0 0 1-1.3 2.5Z\" />\n  <circle cx=\"13.6\" cy=\"7\" r=\".9\" />\n  <circle cx=\"17.4\" cy=\"10.4\" r=\".9\" />\n  <circle cx=\"7\" cy=\"11.4\" r=\".9\" />\n  <circle cx=\"9\" cy=\"7.2\" r=\".9\" /></svg>",
  "plug":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 21v-4.2\" />\n  <path d=\"M9 8V3.5M15 8V3.5\" />\n  <path d=\"M17 8.5v3.4a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V8.5Z\" /></svg>",
  "chart":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 4v15.5h16\" />\n  <path d=\"M8 16.5v-3M12.5 16.5V8M17 16.5v-5.5\" /></svg>",
  "sparkles":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 4.2 13.3 8.7l4.5 1.3-4.5 1.3L12 15.8l-1.3-4.5L6.2 10l4.5-1.3Z\" />\n  <path d=\"M18.6 15.4v3.2M17 17h3.2\" /></svg>",
  "folder":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 7.2A1.7 1.7 0 0 1 5.7 5.5h3.6l1.8 2h6.2A1.7 1.7 0 0 1 19 9.2v7.6a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 16.8Z\" /></svg>",
  "shield":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3.6 19 6v5.6c0 4-2.9 6.9-7 8.4-4.1-1.5-7-4.4-7-8.4V6Z\" />\n  <path d=\"m9 11.6 2 2 4-4\" /></svg>",
  "info":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8.2\" />\n  <path d=\"M12 11v5M12 8.2h.01\" /></svg>",
  "back":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M15 6L9 12L15 18\" /></svg>",
  "chevron-right":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 6L15 12L9 18\" /></svg>",
  "chevron-down":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 9L12 15L18 9\" /></svg>",
  "chevron-up":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 15L12 9L18 15\" /></svg>",
  "close":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6.758 17.243 12.001 12M17.244 6.757 12.001 12M12.001 12 6.758 6.757M12.001 12l5.243 5.243\" /></svg>",
  "edit":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14.363 5.652 15.843 4.172a2 2 0 0 1 2.829 0l1.414 1.414a2 2 0 0 1 0 2.828l-1.48 1.48M14.363 5.652 4.747 15.267a2 2 0 0 0-.578 1.238l-.242 2.741a1 1 0 0 0 1.085 1.084l2.74-.242a2 2 0 0 0 1.238-.578l9.616-9.616M14.363 5.652l4.243 4.242\" /></svg>",
  "trash":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 9 18.005 20.346A2 2 0 0 1 16.035 22H7.965a2 2 0 0 1-1.97-1.654L4 9\" />\n  <path d=\"M21 6h-5.625M3 6h5.625M8.625 6V4a2 2 0 0 1 2-2h2.75a2 2 0 0 1 2 2v2M8.625 6h6.75\" /></svg>",
  "eye":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 13C6.6 5 17.4 5 21 13\" />\n  <path d=\"M12 17a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z\" /></svg>",
  "eye-off":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m19.5 16-2.475-3.396M12 17.5V14M4.5 16l2.469-3.388M3 8c3.6 8 14.4 8 18 0\" /></svg>",
  "arrow-up":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 21V3M12 3l8.5 8.5M12 3l-8.5 8.5\" /></svg>",
  "arrow-down":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3v18M12 21l8.5-8.5M12 21l-8.5-8.5\" /></svg>",
  "switch":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 8h12M14 5l3 3-3 3M19 16H7M10 13l-3 3 3 3\" /></svg>",
  "share":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6M12 15V3M12 3 8.5 6.5M12 3l3.5 3.5\" /></svg>",
  "test":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6.141 19.995c2.458 1.721 4.281-.012 5.318-1.492l7.3-10.426 1.967-1.065-6.554-4.588-8.447 12.063c-1.037 1.481-2.041 3.787.416 5.508Z\" />\n  <path d=\"M16.091 11.019c-2.876-.852-4.403.782-7.28-.07\" /></svg>",
  "search":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17 17l4 4\" />\n  <path d=\"M3 11a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z\" /></svg>",
  "minus":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 12h12\" /></svg>",
  "file":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 3.8h8l4 4V20H6Z\" />\n  <path d=\"M14 3.8V8h4M9 12h6M9 15h6\" /></svg>",
  "warning":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20.043 21H3.957a2 2 0 0 1-1.734-2.997l8.043-13.988a2 2 0 0 1 3.468 0l8.043 13.988A2 2 0 0 1 20.043 21Z\" />\n  <path d=\"M12 9v4M12 17.01l.01-.011\" /></svg>",
  "mail":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"6\" width=\"16\" height=\"12\" rx=\"2\" />\n  <path d=\"m5 8 7 5 7-5\" /></svg>",
  "lock":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"5.5\" y=\"10\" width=\"13\" height=\"10\" rx=\"2\" />\n  <path d=\"M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10\" /></svg>",
  "check":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m5 13 4 4 10-10\" /></svg>",
  "more":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z\" fill=\"#262626\" />\n  <path d=\"M12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z\" fill=\"#262626\" />\n  <path d=\"M4 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z\" fill=\"#262626\" /></svg>",
  "video":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M15 12v4.4a.6.6 0 0 1-.6.6H3.6a.6.6 0 0 1-.6-.6V7.6a.6.6 0 0 1 .6-.6h10.8a.6.6 0 0 1 .6.6V12Zm0 0 5.016-4.18A.6.6 0 0 1 21 8.281v7.438a.6.6 0 0 1-.984.461L15 12Z\" /></svg>",
  "copy":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M19.4 20H9.6a.6.6 0 0 1-.6-.6V9.6a.6.6 0 0 1 .6-.6h9.8a.6.6 0 0 1 .6.6v9.8a.6.6 0 0 1-.6.6Z\" />\n  <path d=\"M15 9V4.6a.6.6 0 0 0-.6-.6H4.6a.6.6 0 0 0-.6.6v9.8a.6.6 0 0 0 .6.6H9\" /></svg>",
  "refresh":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21.888 13.5A10 10 0 1 1 21.168 8\" />\n  <path d=\"M17 8h4.4a.6.6 0 0 0 .6-.6V3\" /></svg>",
  "emoji":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M16.5 14.5S15 16.5 12 16.5s-4.5-2-4.5-2\" />\n  <path d=\"M15.5 9a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1ZM8.5 9a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z\" fill=\"#262626\" /></svg>",
  "menu":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#262626\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 5h18M3 12h18M3 19h18\" /></svg>",
}
const SRC: Record<string,string> = Object.fromEntries(Object.entries(RAW).map(([k,v])=>[k,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(v)]))

function IconImage({name,size=20,className}:{name:string}&IconProps){
  return <img src={SRC[name]} width={size} height={size} className={className} aria-hidden="true" draggable={false} alt="" />
}

export const IconHome: IconComponent = props => <IconImage name="home" {...props}/>
export const IconChat: IconComponent = props => <IconImage name="chat" {...props}/>
export const IconUser: IconComponent = props => <IconImage name="user" {...props}/>
export const IconSettings: IconComponent = props => <IconImage name="settings" {...props}/>
export const IconClock: IconComponent = props => <IconImage name="clock" {...props}/>
export const IconMemory: IconComponent = props => <IconImage name="memory" {...props}/>
export const IconGrid: IconComponent = props => <IconImage name="grid" {...props}/>
export const IconCalendar: IconComponent = props => <IconImage name="calendar" {...props}/>
export const IconCoffee: IconComponent = props => <IconImage name="coffee" {...props}/>
export const IconPhoto: IconComponent = props => <IconImage name="photo" {...props}/>
export const IconMusic: IconComponent = props => <IconImage name="music" {...props}/>
export const IconLedger: IconComponent = props => <IconImage name="ledger" {...props}/>
export const IconBook: IconComponent = props => <IconImage name="book" {...props}/>
export const IconPlus: IconComponent = props => <IconImage name="plus" {...props}/>
export const IconSun: IconComponent = props => <IconImage name="sun" {...props}/>
export const IconStar: IconComponent = props => <IconImage name="star" {...props}/>
export const IconFlower: IconComponent = props => <IconImage name="flower" {...props}/>
export const IconList: IconComponent = props => <IconImage name="list" {...props}/>
export const IconPalette: IconComponent = props => <IconImage name="palette" {...props}/>
export const IconPlug: IconComponent = props => <IconImage name="plug" {...props}/>
export const IconChart: IconComponent = props => <IconImage name="chart" {...props}/>
export const IconSparkles: IconComponent = props => <IconImage name="sparkles" {...props}/>
export const IconFolder: IconComponent = props => <IconImage name="folder" {...props}/>
export const IconShield: IconComponent = props => <IconImage name="shield" {...props}/>
export const IconInfo: IconComponent = props => <IconImage name="info" {...props}/>
export const IconBack: IconComponent = props => <IconImage name="back" {...props}/>
export const IconChevronRight: IconComponent = props => <IconImage name="chevron-right" {...props}/>
export const IconChevronDown: IconComponent = props => <IconImage name="chevron-down" {...props}/>
export const IconChevronUp: IconComponent = props => <IconImage name="chevron-up" {...props}/>
export const IconClose: IconComponent = props => <IconImage name="close" {...props}/>
export const IconEdit: IconComponent = props => <IconImage name="edit" {...props}/>
export const IconTrash: IconComponent = props => <IconImage name="trash" {...props}/>
export const IconEye: IconComponent = props => <IconImage name="eye" {...props}/>
export const IconEyeOff: IconComponent = props => <IconImage name="eye-off" {...props}/>
export const IconArrowUp: IconComponent = props => <IconImage name="arrow-up" {...props}/>
export const IconArrowDown: IconComponent = props => <IconImage name="arrow-down" {...props}/>
export const IconSwitch: IconComponent = props => <IconImage name="switch" {...props}/>
export const IconShare: IconComponent = props => <IconImage name="share" {...props}/>
export const IconTest: IconComponent = props => <IconImage name="test" {...props}/>
export const IconSearch: IconComponent = props => <IconImage name="search" {...props}/>
export const IconMinus: IconComponent = props => <IconImage name="minus" {...props}/>
export const IconFile: IconComponent = props => <IconImage name="file" {...props}/>
export const IconWarning: IconComponent = props => <IconImage name="warning" {...props}/>
export const IconMail: IconComponent = props => <IconImage name="mail" {...props}/>
export const IconLock: IconComponent = props => <IconImage name="lock" {...props}/>
export const IconCheck: IconComponent = props => <IconImage name="check" {...props}/>
export const IconMore: IconComponent = props => <IconImage name="more" {...props}/>
export const IconVideo: IconComponent = props => <IconImage name="video" {...props}/>
export const IconCopy: IconComponent = props => <IconImage name="copy" {...props}/>
export const IconRefresh: IconComponent = props => <IconImage name="refresh" {...props}/>
export const IconEmoji: IconComponent = props => <IconImage name="emoji" {...props}/>
export const IconMenu: IconComponent = props => <IconImage name="menu" {...props}/>
