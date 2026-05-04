# Gemini Software Factory

一个面向 Gemini CLI 的受保护多 agent 工作流扩展。它会把软件需求依次交给 CEO、PM、Dev 和 Tester agent，并通过 hooks 强制执行阶段门禁和 checkpoint JSON，让每一步都可检查、可追踪。

## 功能

- 使用 `/factory-run <需求>` 启动完整工作流。
- 使用 `/factory-lite <需求>` 启动精简工作流。
- 使用 `/factory-continue` 推进当前工作流。
- 阻止错误的 agent 在错误阶段运行。
- 在工作流进入下一阶段前验证每个 agent 的 checkpoint。
- Dev 成功完成后，可自动交接给 Tester 验证。

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

## 安装或链接

克隆仓库：

```powershell
git clone https://github.com/hahaBlizzard/gemini-software-factory.git
```

然后按照你的 Gemini CLI 扩展工作流链接或安装该扩展。开发时，可以把本仓库根目录作为 extension folder 链接。

## 第一次运行

在 Gemini CLI workspace 中启动受保护工作流：

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

## 工作流

默认工作流：

```text
CEO -> PM -> Dev -> Tester
```

每个 agent 都必须返回有效的 JSON checkpoint。Hooks 会注入当前工作流上下文、阻止非法阶段跳转，并在每个 agent 运行后验证 checkpoint 输出。

## 路线图

查看 `PROJECT_PLAN.md` 了解当前产品化计划和后续工作，包括 status/reset/doctor 命令、人类可读的运行产物、更强的 guardrails、memory 工具和自动化 hook 测试。

## License

MIT License. See `LICENSE`.
