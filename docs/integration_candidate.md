# 集成维护候选版本

用于集中验证的分支：

```text
maintenance/revival-integrated
```

该分支由当前维护链整合而成，包含：

- PR-01 安全与开发环境基线；
- PR-02 唯一配置模型；
- PR-03 引擎终止和采样时钟；
- Windows 一键启动修复；
- 统一测试入口；
- HTTP 接口冒烟测试；
- 小规模仿真冒烟测试；
- 前端构建检查；
- JSON 与 Markdown 测试报告。

## 验证方式

```powershell
git fetch origin
git checkout maintenance/revival-integrated
.\run_checks.ps1
```

双击入口：

```text
run_checks.bat
```

启动系统：

```text
etc_sim\start.bat
```

## 合并约束

该分支用于完整联调，不应在未审查测试报告前直接合并到 `main`。

验证完成后，应根据报告修正失败项，再决定是否：

1. 按 PR #6、#7、#8 的顺序合并；或
2. 将已经验证的集成版本整理成一个最终维护 PR。
