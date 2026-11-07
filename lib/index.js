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
	{ re: /The following workspace instructions may be relevant to your work\. Use them as guidance when applicable\./g, replacement: "以下工作区指令可能与你的工作相关。适用时将其作为指导。" },
	{ re: /More specific instructions take precedence over broader ones\. They do not override system, developer, or direct user instructions\./g, replacement: "更具体的指令优先于更宽泛的指令。它们不会覆盖系统、开发者或用户的直接指令。" },
	{ re: /This complete workspace instruction baseline replaces all earlier workspace instruction baselines\./g, replacement: "这份完整的工作区指令基线取代之前所有的工作区指令基线。" },
	// 运行时上下文
	{ re: /Current runtime context\. This snapshot supersedes earlier runtime-context snapshots\./g, replacement: "当前运行时上下文。本快照取代之前的运行时上下文快照。" },
	{ re: /Current runtime context: none\. Earlier runtime-context snapshots no longer apply\./g, replacement: "当前运行时上下文：无。之前的运行时上下文快照不再适用。" },
	{ re: /Current working directory: /g, replacement: "当前工作目录：" },
	// 时间上下文
	{ re: /Time sampled while preparing turn (\d+), step (\d+): ([^ ]+)/g, replacement: "在准备第 $1 轮、第 $2 步时采样的时间：$3" },
	{ re: /Browser time zone for this request: /g, replacement: "本次请求的浏览器时区：" },
	{ re: /Interpret otherwise-unqualified dates and times in this zone\./g, replacement: "未标注的日期与时间按此时区解释。" },
	// 子代理注入指令（withContinuableReturnGuidance）
	{ re: /Your parent agent id is /g, replacement: "你的父代理 ID 是 " },
	{ re: /Before you finish, send your result to that agent with send_message\(\{ agent_id: /g, replacement: "在结束前，请通过 send_message({ agent_id: " },
	{ re: /, message: "<self-contained result>" \}\)\./g, replacement: ', message: "<完整结果>" }) 将结果发送给该代理。' },
	{ re: /The parent shares your workspace but does not automatically receive your transcript, tool output, or reasoning\./g, replacement: "父代理与你共享工作区，但不会自动收到你的对话记录、工具输出或推理过程。" },
	{ re: /Send earlier messages as well when a finding changes what the parent should do next; sending a message does not end your turn\./g, replacement: "当某个发现改变了父代理接下来应做的事情时，也要提前发送消息；发送消息不会结束你的回合。" },
	// plan-mode 核心指令首句
	{ re: /You are in plan mode\. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode\. Imperative language to implement changes means plan the implementation, not execute it\./g, replacement: "你处于规划模式。在用户通过 exit_plan_mode 批准你的计划或切换会话模式之前，请保持规划模式。要求实施改动的命令式语言意味着规划实现方案，而不是执行它。" },
];

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

	// 系统提示词：替换 persona 段为包内 system.md，并把其他段中的英文指令翻译为中文。
	ctx.on("system-prompt/assemble", async (assembly, _context, next) => {
		const final = await next();
		let result = final;
		if (systemText.length > 0) result = replacePersona(result, systemText);
		const sections = result.sections.map((section) => {
			const text = translateInstructionText(section.text);
			return text === section.text ? section : { ...section, text };
		});
		return sections === result.sections ? result : { ...result, sections };
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
