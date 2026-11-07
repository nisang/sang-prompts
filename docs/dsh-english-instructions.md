# DSH 英文指令中文化对照清单

> 目的：DSH 框架在模型可见上下文（系统提示词、用户消息、运行时上下文）中注入了大量英文指令。
> `u2-flash` 等模型在看到英文指令时，推理链会自动切换到英文。
> 本清单记录已识别的英文指令及其中文翻译，由 `dsh-sang-prompts` 插件在运行时替换为中文。
> 记录时间：2026-11-07。来源：DSH 0.2.2-rc.1 源码与 profile 配置。

## 一、子代理（subagent）注入指令

来源：`@deepseek-ai/dsh-subagent/lib/index.js` `withContinuableReturnGuidance()`
位置：子代理创建时追加到用户任务消息末尾（user 消息）

| 英文原文 | 中文翻译 |
|---|---|
| Your parent agent id is `{id}`. | 你的父代理 ID 是 `{id}`。 |
| Before you finish, send your result to that agent with send_message({ agent_id: `{id}`, message: "<self-contained result>" }). | 在结束前，请通过 send_message({ agent_id: `{id}`, message: "<完整结果>" }) 将结果发送给该代理。 |
| The parent shares your workspace but does not automatically receive your transcript, tool output, or reasoning. | 父代理与你共享工作区，但不会自动收到你的对话记录、工具输出或推理过程。 |
| Send earlier messages as well when a finding changes what the parent should do next; sending a message does not end your turn. | 当某个发现改变了父代理接下来应做的事情时，也要提前发送消息；发送消息不会结束你的回合。 |

## 二、子代理结算通知（发给父代理）

来源：`@deepseek-ai/dsh-subagent/lib/index.js` `settlementSummary()`
位置：子代理完成/终止后，作为工具结果通知父代理

| 英文原文 | 中文翻译 |
|---|---|
| Background subagent `{id}` finished and will do no further work unless you send it more. | 后台子代理 `{id}` 已完成；除非你继续向它发送消息，否则它不会再工作。 |
| Background subagent `{id}` finished. It cannot receive follow-up messages. | 后台子代理 `{id}` 已完成；它无法再接收后续消息。 |
| Background subagent `{id}` was stopped before it finished. | 后台子代理 `{id}` 在完成前被停止了。 |
| Background subagent `{id}` ran out of room before it finished. | 后台子代理 `{id}` 在完成前耗尽了空间。 |
| Background subagent `{id}` declined the task. | 后台子代理 `{id}` 拒绝了任务。 |
| Background subagent `{id}` failed before it finished. | 后台子代理 `{id}` 在完成前失败了。 |
| Background subagent `{id}` ended abnormally (`{reason}`) before it finished. | 后台子代理 `{id}` 异常结束（`{reason}`），未完成。 |

## 三、系统提示词固定段

来源：`@deepseek-ai/dsh-system-prompt` 配置与内置段

| 英文原文 | 中文翻译 |
|---|---|
| You are an AI agent powered by DeepSeek Harness. | 你是由 DeepSeek Harness 驱动的 AI 智能体。 |

## 四、工作区指令提醒（workspace instructions）

来源：`@deepseek-ai/dsh-agent-instructions/lib/index.js` `AGENT_INSTRUCTIONS_INTRO`

| 英文原文 | 中文翻译 |
|---|---|
| The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions. | 以下工作区指令可能与你的工作相关。适用时将其作为指导。更具体的指令优先于更宽泛的指令。它们不会覆盖系统、开发者或用户的直接指令。 |
| This complete workspace instruction baseline replaces all earlier workspace instruction baselines. | 这份完整的工作区指令基线取代之前所有的工作区指令基线。 |

## 五、运行时上下文（runtime context）

来源：`@deepseek-ai/dsh-system-prompt/lib/index.js`、`@deepseek-ai/dsh-working-directory/lib/index.js`

| 英文原文 | 中文翻译 |
|---|---|
| Current runtime context. This snapshot supersedes earlier runtime-context snapshots. | 当前运行时上下文。本快照取代之前的运行时上下文快照。 |
| Current runtime context: none. Earlier runtime-context snapshots no longer apply. | 当前运行时上下文：无。之前的运行时上下文快照不再适用。 |
| Current working directory: `{path}`. | 当前工作目录：`{path}`。 |

## 六、时间上下文（time context）

来源：`@deepseek-ai/dsh-time-context`

| 英文原文 | 中文翻译 |
|---|---|
| Time sampled while preparing turn `{turn}`, step 1: `{timestamp}` | 在准备第 `{turn}` 轮、第 1 步时采样的时间：`{timestamp}` |
| Time sampled while preparing turn `{turn}`, step `{step}`: `{timestamp}` | 在准备第 `{turn}` 轮、第 `{step}` 步时采样的时间：`{timestamp}` |
| Browser time zone for this request: `{zone}`. Interpret otherwise-unqualified dates and times in this zone. | 本次请求的浏览器时区：`{zone}`。未标注的日期与时间按此时区解释。 |

## 七、规划模式（plan mode）指令

来源：profile 配置 `cordis.patch.yml` → `plan-mode` 插件 `section`（仅规划模式生效）

| 英文原文（节选） | 中文翻译 |
|---|---|
| You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. | 你处于规划模式。在用户通过 exit_plan_mode 批准你的计划或切换会话模式之前，请保持规划模式。要求实施改动的命令式语言意味着规划实现方案，而不是执行它。 |
| A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode. | 用户的口头同意——包括对你提问的肯定回答——不代表批准任何内容，也不会结束规划模式；请把确认的决定纳入计划，并通过 exit_plan_mode 提交。 |
| Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. | 先探索。使用非变更的读取、搜索、静态分析与检查，让计划基于实际仓库。 |
| Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. | 不要编辑或写入文件、更改配置、运行会重写受跟踪文件的形式化工具或代码生成器、提交，或以其他方式执行计划。 |
| The tool catalog stays the same across modes for request-cache stability. | 为保证请求缓存稳定，不同模式下的工具目录保持一致。 |
| Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. | 通过检查解决可发现的事实。仅在需要用户自行决定或检查无法回答的重大歧义时使用 ask_user_question。 |
| Make the plan decision-complete: state the goal and success criteria; ... | 让计划完整到可决策：说明目标与成功标准；按子系统分组实施改动；覆盖边界情况、失败模式、测试、验收标准与明确的假设。 |
| When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response. | 准备好后，用完整的计划 Markdown（以 # 标题开头）调用 exit_plan_mode。让 exit_plan_mode 成为该助手回复中唯一且最后的工具调用。 |
| If review rejects it, incorporate the feedback and present again. | 如果评审拒绝了计划，请纳入反馈并重新提交。 |

## 八、工具描述（tool descriptions）

来源：各工具插件的 model-facing 描述（通过 tool schema 传入模型）
说明：工具描述数量庞大（当前会话约 72 个工具），且通过 tool schema 传递，**插件无法在系统提示词/用户消息层面直接替换**。其中对思考语言影响最大的子代理工具描述如下：

| 工具 | 英文描述（节选） | 中文翻译 |
|---|---|---|
| subagent | Delegate a self-contained task to a subagent (a separate agent that works in its own context) to offload focused, independent work — research, a scoped implementation, an analysis — so it does not consume this conversation's context. The subagent returns its result, not its intermediate steps. | 将自包含的任务委派给子代理（一个在自身上下文中工作的独立代理），以分担聚焦的独立工作——研究、限定的实现、分析——从而不消耗本会话的上下文。子代理返回其结果，而不是中间步骤。 |
| subagent_fork | Delegate a task to a subagent that inherits this conversation: a child agent seeded with all completed turns so far (it does not see the current in-flight turn). Use this when the subtask builds on this conversation's context — a follow-up analysis, a review, a continuation. | 将任务委派给继承本对话的子代理：一个以当前全部已完成轮次作为初始上下文的子代理（它看不到当前进行中的轮次）。当子任务基于本会话上下文时使用——后续分析、评审、续写。 |

## 处理范围说明

- **插件已覆盖**：一（subagent 注入指令）、三（harness 身份）、四（workspace 提醒）、五（runtime context）、六（时间上下文）、七（plan-mode）——通过 `agent/pre-step` 修改用户消息文本与 `system-prompt/assemble` 修改系统提示词段实现。
- **暂未覆盖**：二（结算通知，位于父代理的工具结果历史中，无法在 pre-step 修改）、八（工具描述，走 tool schema）。这两类可通过后续升级（如插件在系统提示词注入对照翻译）进一步缓解。