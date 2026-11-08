/**
 * 桑的提示词。
 *
 * 三件事：
 * 1. 系统提示词：在 system-prompt/assemble 瀑布中，把 persona 前缀段的文本
 *    替换为本包 prompts/system.md。不改 profile 配置，因此不依赖 preset 结构。
 * 2. 英文指令中文化：把 DSH 框架注入到模型上下文中的英文指令（harness 身份、
 *    工作区提醒、运行时上下文、时间上下文、子代理注入指引、plan-mode 等）
 *    在运行时替换为中文，不改 dsh 框架源码。不触碰用户自己的内容。
 * 3. 用户提示词：会话进入新的工作目录时，为软件项目确保 AGENTS.md 内含
 *    项目规程段；文件不存在就新建，存在但缺这段就插到开头，已有标记则跳过。
 */
import { readFileSync } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Cordis 插件名。 */
export const name = "sang-prompts";
/** 依赖的工作目录服务。 */
export const inject = ["workingDirectory"];

const here = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS = path.join(here, "..", "prompts");

/** 读取包内提示词，失败返回空串。 */
const readPrompt = (file) => {
	try {
		return readFileSync(path.join(PROMPTS, file), "utf8").trim();
	} catch {
		return "";
	}
};

/** 项目规程段的标记，兼作幂等判断与人工编辑边界。 */
export const MARKER_BEGIN = "<!-- dsh-sang-prompts:begin -->";
export const MARKER_END = "<!-- dsh-sang-prompts:end -->";
/** 系统提示词中人格前缀段的段名。 */
const PERSONA_SECTION = "deployment:persona-prefix";

/**
 * DSH 框架注入到模型上下文中的英文指令 → 中文翻译规则。
 * 按顺序执行字符串替换，仅覆盖已知的框架指令模板，不触碰用户内容。
 */
const INSTRUCTION_TRANSLATIONS = [
	// harness 身份
	{ re: /You are an AI agent powered by DeepSeek Harness\./g, replacement: "你是由 DeepSeek Harness 驱动的 AI 智能体。" },
	// 工作区指令提醒
	{ re: /The following workspace instructions may be relevant to your work\. Use them as guidance when applicable\./g, replacement: "以下工作区指令可能与你的工作相关，适用时作为指导。" },
	{ re: /More specific instructions take precedence over broader ones\. They do not override system, developer, or direct user instructions\./g, replacement: "具体指令优先于宽泛指令，且不覆盖系统、开发者或用户的直接指令。" },
	{ re: /This complete workspace instruction baseline replaces all earlier workspace instruction baselines\./g, replacement: "本完整工作区指令基线取代此前所有基线。" },
	// 运行时上下文
	{ re: /Current runtime context\. This snapshot supersedes earlier runtime-context snapshots\./g, replacement: "当前运行时上下文，本快照取代先前快照。" },
	{ re: /Current runtime context: none\. Earlier runtime-context snapshots no longer apply\./g, replacement: "当前运行时上下文：无，先前快照不再适用。" },
	{ re: /Current working directory: /g, replacement: "当前工作目录：" },
	{ re: /Current DeepSeek Harness implementation checkout: /g, replacement: "当前 DeepSeek Harness 实现检出：" },
	{ re: /Current DeepSeek Harness Web GUI URL: /g, replacement: "当前 DeepSeek Harness Web GUI 地址：" },
	// 时间上下文
	{ re: /Time sampled while preparing turn (\d+), step (\d+): ([^ ]+)/g, replacement: "第 $1 轮、第 $2 步的采样时间：$3" },
	{ re: /Browser time zone for this request: /g, replacement: "本次请求的浏览器时区：" },
	{ re: /Interpret otherwise-unqualified dates and times in this zone\./g, replacement: "未标注的日期与时间按此时区解释。" },
	// 子代理注入指令（withContinuableReturnGuidance）
	{ re: /Your parent agent id is /g, replacement: "你的父代理 ID 是 " },
	{ re: /Before you finish, send your result to that agent with send_message\(\{ agent_id: /g, replacement: "结束前请通过 send_message({ agent_id: " },
	{ re: /, message: "<self-contained result>" \}\)\./g, replacement: ', message: "<完整结果>" }) 将结果发送给父代理。' },
	{ re: /The parent shares your workspace but does not automatically receive your transcript, tool output, or reasoning\./g, replacement: "父代理与你共享工作区，但不会自动收到你的对话记录、工具输出或推理。" },
	{ re: /Send earlier messages as well when a finding changes what the parent should do next; sending a message does not end your turn\./g, replacement: "有新发现需改变父代理下一步行动时，提前发送消息；发送消息不会结束当前回合。" },
	// plan-mode 核心指令首句
	{ re: /You are in plan mode\. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode\. Imperative language to implement changes means plan the implementation, not execute it\./g, replacement: "你处于规划模式：在用户通过 exit_plan_mode 批准计划或切换模式前，保持规划模式。命令式改动要求意味着规划实现而非执行。" },
	// sandbox 文件策略
	{ re: /Current DSH file policy: read-only\. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode\. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns\./g, replacement: "当前 DSH 文件策略：只读。沙箱可用操作无法修改当前模式下的文件。不要仅凭此拒绝必要修改：正常尝试可用工具，按返回的拒绝与升级指引处理。" },
	{ re: /Current DSH file policy: workspace-write\. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: /g, replacement: "当前 DSH 文件策略：工作区可写。沙箱可用操作可修改会话工作区下的文件：" },
	{ re: /Some platform temporary areas may also be writable\./g, replacement: "部分平台临时区域亦可写。" },
	{ re: /Current DSH file policy: danger-full-access\. The DSH file sandbox does not restrict file modifications by available operations\./g, replacement: "当前 DSH 文件策略：完全访问。沙箱不限制对文件的修改。" },
	// 审批政策
	{ re: /Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation \(do not set `sandbox_permissions`\)\./g, replacement: "本会话禁用审批：需审批的操作自动拒绝——不要请求沙箱升级（不要设置 `sandbox_permissions`）。" },
	{ re: /Approval prompts are enabled in this session: operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed\./g, replacement: "本会话启用审批：需审批的操作询问配置的应答者；无应答者时请求以失败关闭。" },
	// 工具指导（bash / fs）
	{ re: /Check the \[exit code: N\] marker on every bash result; investigate failures before moving on\./g, replacement: "检查每个 bash 结果上的 [exit code: N] 标记；先调查失败再继续。" },
	{ re: /Use the read tool — not shell commands like cat — to inspect text files\. Use offset and limit to continue reading large files\./g, replacement: "用 read 工具检查文本文件（不要用 cat 等 shell 命令）；大文件用 offset 与 limit 分段读取。" },
	{ re: /Read an existing file before overwriting it with write and prefer edit for targeted changes\./g, replacement: "覆盖文件前先读取；针对性修改优先用 edit。" },
	{ re: /Read a file before editing it unless you just created or edited it in this session\./g, replacement: "编辑前先读取文件，除非刚创建或编辑过。" },
	{ re: /Prefer apply_patch over separate edit calls for changes across files or separated regions\. Give every hunk enough surrounding context lines to match one place in the current file\. The whole patch is checked first \(syntax, hunk matching, missing files\) and a rejected patch changes nothing; once applying starts, operations run in order, stop at the first failure, and are not rolled back, so re-read affected files before retrying when needed\./g, replacement: "跨文件或分散区域的修改优先用 apply_patch 而非多次 edit。每个 hunk 需带足上下文行，确保只匹配一处。补丁先整体校验（语法、hunk 匹配、缺文件），被拒则不改动；应用开始后按序执行，遇首个失败即停且不回滚，重试前重读受影响文件。" },
	// 结构化输出指令（子代理）
	{ re: /When you have your final answer, you MUST report it by calling the `structured_output` tool with arguments matching its parameter schema exactly\. Do not finish with a plain text answer: only the tool call counts as your result\./g, replacement: "得出最终答案后，必须调用 `structured_output` 工具报告，参数与参数模式完全一致；不要以纯文本作答，只有工具调用才算结果。" },
];

/**
 * 子代理专属英文 context → 中文替换表。
 * 这些 context 由 dsh 在子代理作用域注册（optional），可在装配时从 contexts 中移除，
 * 并插入中文翻译 context（无 provider，refreshContext 会保留它）。
 */
const CONTEXT_REPLACEMENTS = [
	{
		nameRe: /^subagent:delegation$/,
		zh: "你是被委派的子代理：权限范围在启动时已固定，本会话内无法扩大——需审批的操作自动拒绝。任务需要超出权限时，不要重试被拒操作，在回复中说明限制，由委派代理处理。"
	},
	{
		nameRe: /^tool:subagent:depth$/,
		zh: "子代理委派深度已达上限：不要再调用 subagent，直接完成工作。"
	},
	{
		nameRe: /^tool:subagent_fork:depth$/,
		zh: "子代理委派深度已达上限：不要再调用 subagent_fork，直接完成工作。"
	}
];

/** 中文替换 context 的段名（无 provider，会被 refreshContext 保留）。 */
const ZH_CONTEXT_NAME = "sang-prompts:zh:subagent";

/** 子代理关键工具的英文描述 → 中文说明，随中文替换 context 一并注入。 */
const SUBAGENT_TOOL_ZH = [
	"# 关键工具说明（中文）",
	"- send_message：向 agent_id 指定的代理发送消息。可直接发送给直接可续的子代理；驻留可续子代理也可发送给直接父代理。目标运行中时在最近步骤边界接收；空闲时开始或恢复一轮。调用只返回接收确认（messageId），不返回回复。",
	"- send_message 的 agent_id：直接可续子代理的 ID；驻留可续子代理也可填直接父代理的 ID。",
	"- subagent：将自包含任务委派给独立上下文的子代理，分担聚焦的独立工作（研究、限定实现、分析），不消耗本会话上下文。子代理返回最终结果而非中间步骤。",
	"- subagent_fork：将任务委派给继承本对话上下文的子代理（以当前全部已完成轮次为初始上下文）。适合基于本会话的后续分析、评审、续写。你收到其结果而非中间步骤。"
].join("\n");

/** 从装配上下文中移除已知英文子代理 context，并插入中文翻译 context。 */
export const replaceSubagentContexts = (contexts) => {
	if (!Array.isArray(contexts) || contexts.length === 0) return contexts;
	const kept = [];
	const zhList = [];
	for (const entry of contexts) {
		const name = entry?.name;
		const hit = CONTEXT_REPLACEMENTS.find((rule) => rule.nameRe.test(name ?? ""));
		if (hit) zhList.push(hit.zh);
		else kept.push(entry);
	}
	if (zhList.length === 0) return contexts;
	kept.push({
		name: ZH_CONTEXT_NAME,
		order: 100000,
		text: `${zhList.join("\n\n")}\n\n${SUBAGENT_TOOL_ZH}`
	});
	return kept;
};

/**
 * 需要翻译并改名的策略类英文 context（optional）。
 * 改名后原 provider 不再关联，refreshContext 不会用英文原文覆盖中文文本。
 */
const POLICY_CONTEXT_NAMES = new Set(["sandbox:policy", "approval:policy"]);

/** 把策略类英文 context 翻译为中文，并改名为无 provider 的名字。 */
export const replacePolicyContexts = (contexts) => {
	if (!Array.isArray(contexts) || contexts.length === 0) return contexts;
	return contexts.map((entry) => {
		if (!entry || !POLICY_CONTEXT_NAMES.has(entry.name)) return entry;
		const text = translateInstructionText(entry.text ?? "");
		if (text === entry.text) return entry;
		return { ...entry, name: `sang-prompts:zh:${entry.name}`, text };
	});
};

/** 对一段模型可见文本应用英文指令 → 中文翻译。 */
export const translateInstructionText = (text) => {
	if (!text) return text;
	let out = text;
	for (const { re, replacement } of INSTRUCTION_TRANSLATIONS) out = out.replace(re, replacement);
	return out;
};

/** 翻译一条 user 消息文本块中的英文指令；内容未变化时返回原消息。 */
const translateUserMessage = (message) => {
	if (!message || typeof message !== "object" || message.role !== "user") return message;
	const content = message.content;
	if (!Array.isArray(content)) return message;
	let changed = false;
	const newContent = content.map((block) => {
		if (!block || block.type !== "text" || typeof block.text !== "string") return block;
		const text = translateInstructionText(block.text);
		if (text === block.text) return block;
		changed = true;
		return { ...block, text };
	});
	return changed ? { ...message, content: newContent } : message;
};

const DEFAULTS = {
	/** true 用包内 prompts/system.md；字符串则直接作为正文。 */
	systemPrompt: true,
	/** 是否写入项目规程。 */
	userPrompt: true,
	/** 目标文件名，位于工作目录根部。 */
	fileName: "AGENTS.md",
	/** 只对软件项目目录写入。 */
	detectProject: true,
	/** 判定为项目的标志文件或目录。 */
	projectMarkers: [
		"package.json",
		"pyproject.toml",
		"setup.py",
		"go.mod",
		"Cargo.toml",
		"pom.xml",
		"build.gradle",
		"build.gradle.kts",
		"composer.json",
		"Gemfile",
		".git"
	],
	/** 项目规程正文；留空则用包内 prompts/project.md。 */
	body: ""
};

const exists = async (target) => {
	try {
		await access(target, constants.F_OK);
		return true;
	} catch {
		return false;
	}
};

/** 用标记包裹正文。 */
const renderBlock = (body) => [MARKER_BEGIN, body.trim(), MARKER_END].join("\n");

/** 把人格前缀段替换为指定文本；找不到该段则原样返回。 */
export const replacePersona = (assembly, text) => {
	if (!assembly || !Array.isArray(assembly.sections)) return assembly;
	let hit = false;
	const sections = assembly.sections.map((section) => {
		if (section.name !== PERSONA_SECTION) return section;
		hit = true;
		return {
			...section,
			text
		};
	});
	return hit ? {
		...assembly,
		sections
	} : assembly;
};

/**
 * 确保工作目录下存在项目规程。
 * @param cwd - 绝对工作目录。
 * @param options - 合并后的配置。
 * @param body - 规程正文。
 * @param log - 插件日志。
 * @returns 动作：created | inserted | skipped | unchanged。
 */
export const ensureProjectPrompt = async (cwd, options, body, log) => {
	if (options.detectProject) {
		let isProject = false;
		for (const marker of options.projectMarkers) if (await exists(path.join(cwd, marker))) {
			isProject = true;
			break;
		}
		if (!isProject) {
			log.info(`跳过 ${cwd}：未发现项目标志`);
			return "skipped";
		}
	}
	const file = path.join(cwd, options.fileName);
	let current = null;
	try {
		current = await readFile(file, "utf8");
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	const block = renderBlock(body);
	if (current === null) {
		await writeFile(file, `${block}\n`, "utf8");
		log.info(`已新建 ${file}`);
		return "created";
	}
	if (current.includes(MARKER_BEGIN)) return "unchanged";
	await writeFile(file, `${block}\n\n${current}`, "utf8");
	log.info(`已插入 ${file}`);
	return "inserted";
};

/**
 * 挂载插件。
 * @param ctx - Cordis 上下文。
 * @param config - patch 中传入的配置。
 */
export function apply(ctx, config = {}) {
	const options = { ...DEFAULTS, ...(config ?? {}) };
	const log = ctx.logger("sang-prompts");
	const systemText = options.systemPrompt === true ? readPrompt("system.md") : typeof options.systemPrompt === "string" ? options.systemPrompt.trim() : "";
	const projectBody = options.body || readPrompt("project.md");

	// 系统提示词：替换 persona 段为包内 system.md，把其他段中的英文指令翻译为中文，
	// 并把子代理专属与策略类的英文 context（委派身份、委派深度、沙箱/审批政策）替换为中文。
	ctx.on("system-prompt/assemble", async (assembly, _context, next) => {
		const final = await next();
		let result = final;
		if (systemText.length > 0) result = replacePersona(result, systemText);
		const sections = result.sections.map((section) => {
			const text = translateInstructionText(section.text);
			return text === section.text ? section : { ...section, text };
		});
		const contexts = replacePolicyContexts(replaceSubagentContexts(result.contexts));
		return {
			...result,
			sections,
			contexts
		};
	});

	// 英文指令中文化：在消息进入模型前，把 user 消息中注入的英文指令翻译为中文
	// （子代理创建时注入的 parent agent / send_message 指引等）。
	ctx.on("agent/pre-step", async (payload, next) => {
		const decision = typeof next === "function" ? await next() : void 0;
		if (decision?.kind === "enter" && Array.isArray(decision.messages)) {
			const messages = decision.messages.map(translateUserMessage);
			return messages === decision.messages ? decision : { ...decision, messages };
		}
		return decision;
	});

	if (!options.userPrompt) return;
	const checked = new WeakMap();
	const ensure = async (agent, signal) => {
		const cwd = await ctx.workingDirectory.ensure(agent, signal);
		let seen = checked.get(agent.session);
		if (seen === void 0) {
			seen = new Set();
			checked.set(agent.session, seen);
		}
		if (seen.has(cwd)) return;
		seen.add(cwd);
		try {
			await ensureProjectPrompt(cwd, options, projectBody, log);
		} catch (error) {
			seen.delete(cwd);
			throw error;
		}
	};
	ctx.on("agent/pre-step", async (payload, next) => {
		const decision = typeof next === "function" ? await next() : void 0;
		try {
			const agent = payload?.agent;
			const signal = payload?.signal;
			if (agent !== void 0 && signal !== void 0 && !signal.aborted) await ensure(agent, signal);
		} catch (error) {
			log.warn(`项目规程写入跳过：${error?.message ?? error}`);
		}
		return decision;
	});
}
