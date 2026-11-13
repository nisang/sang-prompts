# 桑的提示词（dsh-sang-prompts）

> 让 DSH（DeepSeek Harness）全面说中文：统一系统提示词、把框架注入的英文指令在运行时替换为中文，并自动写入项目规程。

`dsh-sang-prompts` 是一个 DSH 插件，安装后做四件事：

1. **替换系统提示词**：把人格前缀段替换为本包内的 `prompts/system.md`（第八版系统提示词），无论使用哪个预设（标准模式 / 创造模式）都统一生效。
2. **DSH 英文指令全面中文化**：把 DSH 框架注入到模型上下文中的英文指令（harness 身份、工作区提醒、运行时上下文、时间上下文、子代理注入指引、子代理身份说明、关键工具描述、plan-mode 等）在运行时**替换为中文**，不改动 dsh 框架源码。
3. **历史会话同步最新提示词**：每次请求时检查历史会话的头节点系统消息，发现旧版即替换为最新插件提示词，确保历史会话继续对话时也采用最新版本。
4. **写入项目规程**：进入项目目录时，为软件项目确保 `AGENTS.md` 含项目规程段。

英文指令中文化的完整对照清单见 [docs/dsh-english-instructions.md](docs/dsh-english-instructions.md)。

---

## 为什么需要「DSH 提示词全面中文化」

DSH 框架在模型可见的上下文中注入了大量**英文指令**：

- 系统提示词的固定段（`You are an AI agent powered by DeepSeek Harness.`）
- 子代理创建时注入的委派指引（`Your parent agent id is...`）
- 子代理专属身份说明（`You are a delegated subagent...`、`Delegation depth...`）
- 工具描述（`send_message`、`subagent`、`subagent_fork` 等）
- 工作区指令提醒、运行时上下文、时间上下文、plan-mode 指令

**问题**：当模型（尤其是 `u2-flash` 等对英文敏感的模型）看到大量英文指令时，它的**内部推理链会自动切换到英文**——即使系统提示词要求「所有思考必须使用中文」。这会导致：

- 新会话、子代理的思考用英文，与中文用户环境割裂
- 推理语言与最终回复语言不一致，影响表达连贯性
- 中文用户难以理解和审查模型的处理过程

**解决方案**：本插件在运行时把上述英文指令**替换为中文**（不是英文旁加翻译，而是直接用中文替代），让模型从「看到什么」到「思考什么」都处于中文环境。

## 中文化后对 DSH 能力的提升

- ✅ **子代理思考恢复中文**：彻底解决子代理英文思考问题（子代理指令、身份说明、工具描述三层英文源全部中文化后，子代理推理链以中文为主）。
- ✅ **新会话思考语言稳定**：新会话从第一条消息起就用中文思考，无需依赖长中文历史「驯化」。
- ✅ **推理与回复语言一致**：模型用中文思考、用中文回复，表达自然连贯。
- ✅ **可理解性**：所有注入指令、上下文、工具说明均为中文，用户可清晰理解模型每一步的处理依据。
- ✅ **不侵入框架**：不修改 dsh 框架源码，全部通过插件运行时替换实现；升级 dsh 不受影响。

## 中文化覆盖范围

| 来源 | 替换内容 | 生效版本 |
|---|---|---|
| 系统提示词固定段 | `You are an AI agent powered by DeepSeek Harness.` → 中文 | v0.1.9 |
| 工作区指令提醒 | `The following workspace instructions...` → 中文 | v0.1.9 |
| 运行时上下文 | `Current runtime context...`、`Current working directory...` → 中文 | v0.1.9 |
| 时间上下文 | `Time sampled while preparing turn...` → 中文 | v0.1.9 |
| plan-mode 核心指令 | `You are in plan mode...` → 中文 | v0.1.9 |
| 子代理注入指引 | `Your parent agent id is... Before you finish...` → 中文 | v0.1.9 |
| 子代理身份说明 | `You are a delegated subagent...` → 中文 | v0.1.10 |
| 子代理委派深度 | `Delegation depth for subagent...` → 中文 | v0.1.10 |
| 关键工具描述 | `send_message` / `subagent` / `subagent_fork` 中文说明注入 | v0.1.11 |

> 说明：工具描述位于 tool schema（不走消息文本），插件通过**在子代理上下文注入中文工具说明**来抵消英文描述的影响。

---

## 历史会话同步最新提示词

DSH 的会话历史会保存系统提示词快照。插件更新后，**历史会话默认沿用旧快照**，不会自动使用最新插件提示词。

本插件从 v0.1.18 起增加「历史会话同步」：在每次请求的 `agent/pre-step` 阶段，检查会话头节点的系统消息：

- 若头节点已包含当前插件 `prompts/system.md` 的内容 → 已是最新，跳过。
- 若不含（旧版）→ 用最新装配的系统提示词**替换头节点**（`surfaceOp: replace`）。

效果：**历史会话继续对话时自动采用最新插件提示词**，无需新建或分叉会话。

说明：
- 只更新系统提示词头节点，不触碰用户消息与对话内容。
- 执行失败时记录警告，不影响主流程。
- 同步发生在请求时；仅打开会话、不发消息时，历史快照保持原样。

---

## 涉及修改的指令（DSH 升级检查清单）

本插件在运行时替换 DSH 框架注入的英文指令。**DSH 升级后，框架的英文文案可能改词、换位置或新增指令**，届时翻译规则可能失效。请按本清单复查，并更新 `lib/index.js` 中的 `INSTRUCTION_TRANSLATIONS`（段/消息翻译）、`CONTEXT_REPLACEMENTS`（子代理 context 移除注入）、`POLICY_CONTEXT_NAMES`（动态 context 翻译改名）。

### 检查方法

```bash
# 在 dsh 安装目录的 @deepseek-ai 包中搜索各指令的英文特征
cd /home/sangji/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai
grep -rn "英文特征" <包名>/lib/index.js
```

- **特征仍存在且文案未变** → 翻译规则有效。
- **特征存在但文案变了** → 更新对应规则的 `re`（正则）与 `replacement`（中文）。
- **出现新的英文指令** → 新增一条翻译规则。

### 指令清单

| # | 指令 | DSH 来源包 | 英文原文特征（grep 用） | 处理方式 |
|---|---|---|---|---|
| 1 | harness 身份 | `dsh-system-prompt` | `You are an AI agent powered by DeepSeek Harness.` | 段翻译 |
| 2 | 工作区指令提醒 | `dsh-agent-instructions` | `The following workspace instructions may be relevant to your work.` | 段翻译 |
| 3 | 运行时上下文 | `dsh-system-prompt` | `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.` | 段翻译 |
| 4 | 时间上下文 | `dsh-time-context` | `Time sampled while preparing turn` | context 翻译改名 |
| 5 | plan-mode 核心指令 | `dsh-plan-mode` | `You are in plan mode. Stay in plan mode until` | 段翻译 |
| 6 | 子代理注入指引 | `dsh-subagent` | `Your parent agent id is` | pre-step 消息翻译 |
| 7 | 子代理身份说明 | `dsh-subagent` | `You are a delegated subagent` | context 移除+中文注入 |
| 8 | 子代理委派深度 | `dsh-tool-subagent` | `Delegation depth for` | context 移除+中文注入 |
| 9 | 沙箱文件策略 | `dsh-sandbox-policy` | `Current DSH file policy:` | context 翻译改名 |
| 10 | 审批政策 | `dsh-user-approval` | `Approval prompts are disabled in this session` | context 翻译改名 |
| 11 | bash 工具指导 | `dsh-tool-bash` | `Check the [exit code: N] marker` | 段翻译 |
| 12 | read 工具指导 | `dsh-tool-fs` | `Use the read tool — not shell commands like cat, sed, head, or tail` | 段翻译 |
| 13 | write/edit 工具指导 | `dsh-tool-fs` | `Read an existing file before overwriting it with write` | 段翻译 |
| 14 | edit 工具指导 | `dsh-tool-fs` | `Read a file before editing it unless you just created or edited it` | 段翻译 |
| 15 | apply_patch 工具指导 | `dsh-tool-fs` | `Prefer apply_patch over separate edit calls` | 段翻译 |
| 16 | 结构化输出指令 | `dsh-subagent` | `When you have your final answer, you MUST report it` | 段翻译 |
| 17 | 实现检出说明 | `dsh-harness-dev-context` | `The runtime context names the DeepSeek Harness implementation checkout.` | 段翻译 |
| 18 | Web GUI 说明 | `dsh-harness-dev-context` | `You are interacting with the user through the DeepSeek Harness Web GUI` | 段翻译 |
| 19 | 实现检出 context | `dsh-harness-dev-context` | `Current DeepSeek Harness implementation checkout:` | context 翻译改名 |
| 20 | Web GUI 地址 context | `dsh-harness-dev-context` | `Current DeepSeek Harness Web GUI URL:` | context 翻译改名 |
| 21 | glob 工具指导 | `dsh-tool-fs-search` | `Use the glob tool — not shell find` | 段翻译 |
| 22 | grep 工具指导 | `dsh-tool-fs-search` | `Use the grep tool — not shell grep or rg` | 段翻译 |
| 23 | 后台任务指导 | `dsh-tool-jobs` | `Track every background job id you start` | 段翻译 |
| 24 | pwsh 退出码指导 | `dsh-tool-pwsh` | `Non-zero exits are reported as [exit code: N] markers` | 段翻译 |
| 25 | 目标管理指导 | `dsh-tool-goal` | `create_goal may infer goal intent from a direct human request` | 段翻译 |
| 26 | 定时任务授权 | `dsh-tool-schedule` | `Only create or modify scheduled tasks at the user's explicit request` | 段翻译 |
| 27 | 会话检索指导 | `dsh-tool-session-query` | `Use session_search to find relevant work from prior sessions` | 段翻译 |
| 28 | 终端面板指导 | `dsh-terminal-panel` | `Terminals you open with terminal_open appear in the user's side panel` | 段翻译 |
| 29 | 文件引用与展示指导 | `dsh-deliverable-file-references` | `Prefer showing the primary results within your final response` | 段翻译 |
| 30 | Agent Teams 政策 | `dsh-tool-agent-team` | `Agent Teams is available in this session` | 段翻译 |

中英对照的完整原文见 [docs/dsh-english-instructions.md](docs/dsh-english-instructions.md)。

### 保留英文（环境信息）

以下为环境信息而非指令，保留英文不影响模型行为：

- `Current working directory:`（工作目录，required context，不可改名，否则会被框架恢复）
- 时间戳、路径、URL 等具体值

---

## 环境要求

- **DSH 版本**：适配 `0.2.2-rc.1`（兼容声明 `>=0.2.1-rc.2`）
- 本插件在 DSH `0.2.2-rc.1` 下开发与验证，标准模式与创造模式均正常生效

## 安装

### 从本地目录安装

```bash
dsh plugin --profile web add /home/sangji/dsh/sang-prompts
```

### 从打包文件安装

```bash
cd /home/sangji/dsh/sang-prompts
npm pack
dsh plugin --profile web add ./dsh-sang-prompts-<版本号>.tgz
```

安装后**重启 DSH 生效**。profile 名不是 `web` 时，把 `--profile web` 换成实际 profile 名。

## 配置

在 profile 的 `cordis.patch.yml` 中覆盖 `sang-prompts` 条目的 config：

| 键 | 默认 | 说明 |
|---|---|---|
| `systemPrompt` | `true` | `true` 用包内文件；字符串直接作正文；`false` 关闭替换 |
| `userPrompt` | `true` | 是否写入项目规程 |
| `fileName` | `AGENTS.md` | 目标文件名 |
| `detectProject` | `true` | 只对软件项目目录写入 |
| `projectMarkers` | 见源码 | 判定项目的标志文件 |
| `body` | 空 | 规程正文；空则用 `prompts/project.md` |

## 行为

| 情形 | 结果 |
|---|---|
| 会话装配系统提示词（任意预设） | 人格前缀段替换为 `prompts/system.md`，其他英文指令段一并中文化 |
| 历史会话装配系统提示词 | 检查头节点，旧版替换为最新插件提示词（v0.1.19） |
| 子代理装配上下文 | 英文委派身份/深度说明移除，注入中文身份与工具说明 |
| 项目目录无 `AGENTS.md` | 新建，写入规程并加标记 |
| 有文件无规程段 | 插到文件开头，原内容保留 |
| 已有标记 | 跳过 |
| 非项目目录 | 跳过，只记日志 |
| 同会话同目录 | 只检查一次 |

项目规程标记：`<!-- dsh-sang-prompts:begin -->` 与 `<!-- dsh-sang-prompts:end -->`。

## 包含文件

| 文件 | 说明 |
|---|---|
| `prompts/system.md` | 第七版系统提示词（含「所有思考必须使用中文」硬约束） |
| `prompts/project.md` | 软件项目规程正文 |
| `prompts/system-novel.md` / `project-novel.md` | 小说创作场景专用提示词与规程 |
| `lib/index.js` | 插件实现（提示词替换 + 英文指令中文化 + 项目规程写入） |
| `docs/dsh-english-instructions.md` | DSH 英文指令中英对照清单 |

## 版本历史

| 版本 | 内容 |
|---|---|
| v0.1.22 | 适配 DSH 0.2.2-rc.3，重新编写全部英文指令（更新 read 指导，新增 glob/grep、后台任务、pwsh、目标、定时任务、会话检索、终端面板、文件引用、Agent Teams 等 10 类中文化） |
| v0.1.21 | 发布标记（内容同 v0.1.20） |
| v0.1.20 | 系统提示词更新为优化版第八版（语言规范扩展：中文数字、西文专名、标点规范） |
| v0.1.19 | 修正历史会话同步的 surface replace 参数（sourceEventSeqs），历史会话同步稳定生效 |
| v0.1.18 | 新增历史会话同步：请求时把最新系统提示词写入会话头节点 |
| v0.1.17 | 系统提示词升级到第八版（新增「结论、结果与交付」等） |
| v0.1.16 | 以系统提示词为蓝本重新打磨指令中文，去除翻译腔 |
| v0.1.15 | 补全运行时上下文全量中文化（实现检出/Web GUI 地址/时间上下文） |
| v0.1.14 | 按系统提示词风格去除翻译腔 |
| v0.1.13 | 优化隐藏指令中文措辞，补充运行时上下文翻译 |
| v0.1.12 | dsh 隐藏指令全面中文化（沙箱/审批/工具指导/结构化输出） |
| v0.1.11 | 子代理上下文注入关键工具中文说明（send_message/subagent/subagent_fork），彻底解决子代理英文思考 |
| v0.1.10 | 替换子代理英文身份说明与委派深度为中文 |
| v0.1.9 | 新增 DSH 英文指令全面中文化（harness 身份/工作区提醒/运行时上下文/时间上下文/plan-mode/子代理指令） |
| v0.1.8 | 「思考过度防止」新增硬约束：所有思考必须使用中文，禁止切换到英文 |
| v0.1.7 | 恢复默认静态读取（回滚 v0.1.6 的动态读取） |
| v0.1.6 | 实验：每次装配动态读取提示词文件（后回滚） |
| v0.1.5 | 系统提示词第七版优化（思考过度防止/快与慢措辞优化） |
| v0.1.4 | 系统提示词第七版 |

## 注意

- 安装后，系统提示词以本包 `prompts/system.md` 为准，profile 中 preset 的 persona 配置会被运行时替换。改提示词请改该文件，重启后生效。
- 英文指令中文化只替换 DSH 框架注入的已知指令模板，**不会触碰用户自己的消息内容**。
- 不改 dsh 框架源码；升级 dsh 不影响本插件。

## 卸载

```bash
dsh plugin --profile web remove dsh-sang-prompts
```