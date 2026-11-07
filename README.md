# 桑的提示词

DSH（DeepSeek Harness）插件。安装后做三件事：

1. **替换系统提示词**：运行时把人格前缀段替换为 `prompts/system.md`。
2. **英文指令中文化**：把 DSH 框架注入到模型上下文中的英文指令（harness 身份、工作区提醒、运行时上下文、时间上下文、子代理注入指引、plan-mode 等）在运行时替换为中文；并把子代理专属的英文身份说明（`You are a delegated subagent...`、委派深度）替换为中文。不改 dsh 框架源码。
3. **写入用户提示词**：进入项目目录时，为软件项目确保 `AGENTS.md` 含项目规程段。

英文指令中文化的对照清单见 [docs/dsh-english-instructions.md](docs/dsh-english-instructions.md)。

cd /home/sangji/dsh/sang-prompts
npm version patch          # 建议升版本，便于区分
npm pack
# 分发 tgz，在目标机器
dsh plugin --profile web add ./dsh-sang-prompts-0.1.2.tgz

## 安装

本地路径：

```bash
dsh plugin --profile web add /home/sangji/dsh/sang-prompts
```

或先打包再装：

```bash
cd /home/sangji/dsh/sang-prompts
npm pack
dsh plugin --profile web add ./dsh-sang-prompts-0.1.0.tgz
```

安装后重启 DSH 生效。

## 行为

| 情形 | 结果 |
|---|---|
| 会话装配系统提示词 | 人格前缀段替换为 `prompts/system.md` |
| 项目目录无 `AGENTS.md` | 新建，写入规程并加标记 |
| 有文件无规程段 | 插到文件开头，原内容保留 |
| 已有标记 | 跳过 |
| 非项目目录 | 跳过，只记日志 |
| 同会话同目录 | 只检查一次 |

标记：`<!-- dsh-sang-prompts:begin -->` 与 `<!-- dsh-sang-prompts:end -->`。

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

## 注意

安装后，系统提示词以本包 `prompts/system.md` 为准，profile 中 preset 的 persona 配置会被运行时替换。改提示词请改该文件，重启后生效。

## 卸载

```bash
dsh plugin --profile web remove dsh-sang-prompts
```
