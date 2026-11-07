/**
 * 桑的提示词。
 *
 * 两件事：
 * 1. 系统提示词：在 system-prompt/assemble 瀑布中，把 persona 前缀段的文本
 *    替换为本包 prompts/system.md。不改 profile 配置，因此不依赖 preset 结构。
 * 2. 用户提示词：会话进入新的工作目录时，为软件项目确保 AGENTS.md 内含
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

	if (systemText.length > 0) ctx.on("system-prompt/assemble", async (assembly, _context, next) => {
		const final = await next();
		return replacePersona(final, systemText);
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
