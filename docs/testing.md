# 统一测试入口

当前维护分支提供一个统一测试入口，用于一次性检查环境、后端接口、配置模型、仿真运行和前端构建。

## 推荐入口

在仓库根目录执行：

```powershell
.\run_checks.ps1
```

也可以直接双击：

```text
run_checks.bat
```

测试脚本会自动使用 Conda 环境 `yulu-sim`。如果环境不存在，会根据 `etc_sim/environment.yml` 创建；如果环境不是 Python 3.11，会尝试更新。

## 测试执行策略

测试不是遇到第一个失败就停止。

- 独立测试之间互不阻塞。
- 失败会记录到报告中，然后继续运行其他独立测试。
- 只有声明依赖关系的测试才会因前置失败而跳过。

例如：

```text
python-version
  └─ backend-imports
       ├─ security-tests
       ├─ configuration-tests
       │    └─ api-smoke
       └─ engine-runtime-tests
            └─ simulation-smoke

node-available ─┐
npm-available  ─┴─ frontend-build
```

如果 `security-tests` 失败，但 `engine-runtime-tests` 的依赖仍然通过，仿真测试仍会继续。

## 检查内容

### 环境

- Python 是否为 3.11 或更高版本；
- FastAPI、Pydantic、NumPy、仿真引擎是否可以导入；
- Node.js 和 npm 是否可用。

### 后端单元测试

- 危险代码执行接口是否被禁用；
- 路径穿越检查是否有效；
- 配置模型是否唯一且兼容旧输入；
- 引擎终止状态与采样时钟是否正确。

### HTTP 接口测试

测试脚本会启动一个使用随机空闲端口的临时 Uvicorn 后端，然后检查：

```text
GET  /
GET  /health
GET  /api/openapi.json
GET  /api/configs
GET  /api/files/output-files
POST /api/code/execute
POST /api/files/scripts/run
GET  /api/files/output-files?path=../secret
```

危险执行接口应返回 404，路径穿越请求应返回 400。

### 仿真冒烟测试

- 建立小规模正式 `SimulationConfig`；
- 运行 Python `SimulationEngine`；
- 检查终止状态；
- 检查最大时间边界；
- 检查轨迹采样时间；
- 检查轨迹字段；
- 尝试将完整结果 JSON 序列化；
- 检查基础统计字段。

结果序列化检查可能暴露尚未修复的事件对象问题。这类失败应被保留在报告中，而不是由测试脚本隐藏。

### 前端

运行：

```text
npm run build
```

用于检查 TypeScript 类型和 Vite 生产构建。

## 报告

执行结束后生成：

```text
reports/maintenance_check.json
reports/maintenance_check.md
```

JSON 版本适合后续自动分析，Markdown 版本适合人工审查。

报告包含：

- 每个检查的状态；
- 依赖关系；
- 耗时；
- 执行命令；
- 返回码；
- stdout；
- stderr；
- 跳过原因。

`reports/` 已加入 `.gitignore`，不会污染提交。

## 诊断模式与严格模式

默认诊断模式：

```powershell
.\run_checks.ps1
```

即使某些测试失败，入口最终仍返回 0，失败只记录在报告中。适合本地继续开发和集中分析。

CI 或准备合并时使用严格模式：

```powershell
.\run_checks.ps1 -Strict
```

只要存在实际失败，严格模式就返回非零退出码。

跳过前端构建：

```powershell
.\run_checks.ps1 -NoFrontend
```

组合使用：

```powershell
.\run_checks.ps1 -Strict -NoFrontend
```

## 直接运行 Python 入口

已经激活 `yulu-sim` 时，也可以直接执行：

```powershell
python scripts/maintenance_check.py
python scripts/render_maintenance_report.py `
  reports/maintenance_check.json `
  reports/maintenance_check.md
```

不建议继续使用 PowerShell 中的反斜杠续行写法：

```powershell
python -m unittest \ test_a \ test_b
```

PowerShell 的续行符是反引号，而不是反斜杠。统一入口已经避免了这一问题。
