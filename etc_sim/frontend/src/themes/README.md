# themes/ — 主题系统

本目录包含 ETC 仿真系统的多主题定义。

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.ts` | 主题注册表，定义 `ThemeId` 类型和所有主题元数据 |
| `retro-tech.css` | 复古科技风（Retro-Tech）主题样式，通过 `[data-theme="retro-tech"]` 覆盖 CSS 变量 |

## 如何新增主题

1. 在 `index.ts` 的 `THEMES` 数组中添加一条 `ThemeMeta` 记录
2. 在本目录新建 `<主题id>.css` 文件，使用 `[data-theme="<主题id>"]` 选择器覆盖以下 CSS 变量：
   - `--bg-base`, `--bg-surface`
   - `--glass-bg`, `--glass-bg-hover`, `--glass-border`, `--glass-shadow`  
   - `--accent-blue`, `--accent-purple`, `--accent-green`, `--accent-red`
   - `--text-primary`, `--text-secondary`, `--text-muted`
3. 在 `src/index.css` 顶部引入新 CSS 文件

> 所有已有组件均通过 CSS 变量引用颜色，**无需修改任何组件代码**。

## 复古科技风特征

- 深海蓝底色（`#080d1a`）+ 电光蓝霓虹辉光（`#00d4ff`）
- 面板自带蓝色辉光边框（`box-shadow` 多层发光）
- Orbitron 科技感标题字体 + Share Tech Mono 数据字体  
- 全局 40px 网格纹理背景
- CSS 扫描线叠加层（`prefers-reduced-motion` 可自动关闭）
