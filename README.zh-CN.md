# Gemini Software Factory

一个面向 Gemini CLI 的受保护多 agent 工作流扩展。它会把软件需求依次交给 CEO、PM、Dev 和 Tester agent，并通过 hooks 强制执行阶段门禁和 checkpoint JSON，让每一步都可检查、可追踪。

## 功能

- 使用 `/factory-run <需求>` 启动完整工作流。
- 使用 `/factory-lite <需求>` 启动精简工作流。
- 使用 `/factory-continue` 推进当前工作流。
- 阻止错误的 agent 在错误阶段运行。
- 在工作流进入下一阶段前验证每个 agent 的 checkpoint。
- Dev 成功完成后，可自动交接给 Tester 验证。
- 写入人类可读产物，并通过 `/factory-report` 生成最终报告。

## 项目结构

```text
agents/                 CEO、PM、Dev、Tester 的 agent 指令
commands/               Gemini CLI slash commands
hooks/                  工作流状态、阶段门禁、checkpoint 验证 hooks
gemini-extension.json   扩展 manifest
GEMINI.md               调度器指令
PROJECT_PLAN.md         产品化和路线图 checklist
```

## 要求

- 支持扩展的 Gemini CLI
- PATH 中可用的 Node.js

本扩展的 hooks 是普通 Node.js 脚本，不需要 npm 依赖。

## 安装

直接从 GitHub 安装：

```powershell
gemini extensions install https://github.com/hahaBlizzard/gemini-software-factory
```

安装后重启 Gemini CLI，这样扩展命令和 hooks 才会被加载。

可以在系统终端中验证扩展：

```powershell
gemini extensions list
```

也可以在 Gemini CLI 内部验证：

```text
/extensions list
```

## 本地开发

如果你想开发或测试本地改动，可以克隆仓库并链接扩展目录：

```powershell
git clone https://github.com/hahaBlizzard/gemini-software-factory.git
cd gemini-software-factory
gemini extensions link .
```

`link` 会让 Gemini CLI 使用你的本地 checkout，因此每次本地编辑后不需要运行 extension update。链接后请重启 Gemini CLI。

## 第一次运行

在每个需要使用 factory 的 Gemini CLI workspace 中，先初始化本地工作目录和 workflow state：

```text
/factory-init
```

然后启动受保护工作流：

```text
/factory-run Build a small CLI tool that validates JSON files.
```

查看返回的 checkpoint。准备继续时运行：

```text
/factory-continue
```

每个阶段完成后重复运行 `/factory-continue`。Dev 成功完成后，Tester 验证可能会自动运行。如果 Tester 要求重试，工作流会暂停等待人工 review，然后再返回 Dev。

精简流程可以使用：

```text
/factory-lite Build a small CLI tool that validates JSON files.
```

## 演示 Transcript

```text
> /factory-init
Initialization complete. Use /factory-run <requirement> to start the software factory.

> /factory-run Build a small CLI tool that validates JSON files.
{"current_phase":"ceo","status":"WAITING_FOR_USER_APPROVAL","checkpoint":"CEO_BLUEPRINT_READY","next_command":"/factory-continue","message":"CEO blueprint and architecture snapshot are ready."}

> /factory-continue
{"current_phase":"pm","status":"WAITING_FOR_USER_APPROVAL","checkpoint":"PM_PRD_READY","next_command":"/factory-continue","message":"PRD and acceptance criteria are ready."}

> /factory-continue
{"current_phase":"dev","status":"WAITING_FOR_USER_APPROVAL","checkpoint":"DEV_IMPLEMENTATION_COMPLETED","next_command":"auto:tester","message":"Implementation summary is ready; Tester will validate automatically."}

> auto handoff
{"current_phase":"tester","status":"FACTORY_WORKFLOW_COMPLETED","checkpoint":"TESTER_PASS","result":"PASS","message":"Tester accepted the implementation."}

> /factory-report
Report written to .agents/outputs/factory_report.md.
```

如果 Tester 返回 `RETRY_REQUIRED`，先查看 `.agents/outputs/test_report.md`，确认修复建议后再运行 `/factory-continue` 把任务交回 Dev。

## 工作流

默认工作流：

```text
CEO -> PM -> Dev -> Tester
```

每个 agent 都必须返回有效的 JSON checkpoint。Hooks 会注入当前工作流上下文、阻止非法阶段跳转，并在每个 agent 运行后验证 checkpoint 输出。

每个阶段也会在 `.agents/outputs/` 下写入 Markdown 产物：

- `architecture_snapshot.md`
- `prd.md`
- `implementation_summary.md`
- `test_report.md`
- `factory_report.md`

## 编码说明

仓库中的 prompt、command 和文档使用 UTF-8。若 PowerShell 中显示中文 mojibake，通常是终端解码问题，不代表文件损坏；文件本身应能以 UTF-8 解码且不包含 `U+FFFD` 替换字符。

## 路线图

查看 `PROJECT_PLAN.md` 了解当前产品化计划和后续工作，包括 status/reset/doctor 命令、人类可读的运行产物、更强的 guardrails、memory 工具和自动化 hook 测试。

## License

MIT License. See `LICENSE`.
