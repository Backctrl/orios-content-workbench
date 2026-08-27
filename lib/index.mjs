import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parse, stringify } from "yaml";
import { spawnSync } from "node:child_process";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
//#region src/settings.ts
const PROVIDER_DEFINITIONS = [
	{
		id: "image",
		label: "图像生成",
		group: "provider",
		description: "文章插图、封面和小红书图卡，可接 Baoyu image adapter。",
		credentialHint: "密钥环境变量名",
		defaultEndpoint: "https://api.openai.com/v1",
		defaultModel: "gpt-image-1",
		defaultCredentialEnvs: ["OPENAI_API_KEY"],
		defaultCommand: "",
		requiresCommand: false
	},
	{
		id: "speech",
		label: "标准中文配音",
		group: "provider",
		description: "视频旁白和替换音频，默认保留 OpenAI TTS 兼容配置。",
		credentialHint: "密钥环境变量名",
		defaultEndpoint: "https://api.openai.com/v1",
		defaultModel: "gpt-4o-mini-tts",
		defaultCredentialEnvs: ["OPENAI_API_KEY"],
		defaultCommand: "",
		requiresCommand: false
	},
	{
		id: "remotion",
		label: "Remotion 渲染",
		group: "provider",
		description: "本地生成 1080×1920、30fps 的视频预览和字幕合成。",
		credentialHint: "本地命令或绝对路径",
		defaultEndpoint: "",
		defaultModel: "",
		defaultCredentialEnvs: [],
		defaultCommand: "npx remotion",
		requiresCommand: true
	},
	{
		id: "wechat",
		label: "微信公众号草稿",
		group: "platform",
		description: "使用官方接口写入草稿箱，最终发布仍由用户确认。",
		credentialHint: "AppID 与 AppSecret 的环境变量名",
		defaultEndpoint: "https://api.weixin.qq.com",
		defaultModel: "",
		defaultCredentialEnvs: ["WECHAT_APP_ID", "WECHAT_APP_SECRET"],
		defaultCommand: "",
		requiresCommand: false
	},
	{
		id: "xhs",
		label: "小红书发布器",
		group: "platform",
		description: "默认输出人工上传包；可配置受控浏览器/发布器会话路径。",
		credentialHint: "会话文件或发布器环境变量名",
		defaultEndpoint: "",
		defaultModel: "",
		defaultCredentialEnvs: ["XHS_SESSION_PATH"],
		defaultCommand: "",
		requiresCommand: false
	},
	{
		id: "douyin",
		label: "抖音视频发布器",
		group: "platform",
		description: "可选视频发布器；未配置时只生成视频发布包。",
		credentialHint: "会话文件或发布器环境变量名",
		defaultEndpoint: "",
		defaultModel: "",
		defaultCredentialEnvs: ["DOUYIN_SESSION_PATH"],
		defaultCommand: "",
		requiresCommand: false
	},
	{
		id: "channels",
		label: "视频号发布器",
		group: "platform",
		description: "可选视频号发布器；未配置时只生成视频发布包。",
		credentialHint: "会话文件或发布器环境变量名",
		defaultEndpoint: "",
		defaultModel: "",
		defaultCredentialEnvs: ["WECHAT_CHANNELS_SESSION_PATH"],
		defaultCommand: "",
		requiresCommand: false
	}
];
new Map(PROVIDER_DEFINITIONS.map((definition) => [definition.id, definition]));
function isRecord$2(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function stringValue(value, fallback) {
	return typeof value === "string" ? value.trim() : fallback;
}
function stringArray(value, fallback) {
	if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
	if (!Array.isArray(value)) return [...fallback];
	return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}
function providerSettings(definition, value) {
	const input = isRecord$2(value) ? value : {};
	return {
		enabled: input.enabled !== false,
		endpoint: stringValue(input.endpoint, definition.defaultEndpoint),
		model: stringValue(input.model, definition.defaultModel),
		credentialEnvs: stringArray(input.credentialEnvs, definition.defaultCredentialEnvs),
		command: stringValue(input.command, definition.defaultCommand),
		profilePath: stringValue(input.profilePath, "")
	};
}
function defaultSettings() {
	return {
		schemaVersion: 1,
		providers: Object.fromEntries(PROVIDER_DEFINITIONS.map((definition) => [definition.id, providerSettings(definition)]))
	};
}
function normalizeSettings(value) {
	const input = isRecord$2(value) ? value : {};
	const providers = isRecord$2(input.providers) ? input.providers : {};
	return {
		schemaVersion: 1,
		providers: Object.fromEntries(PROVIDER_DEFINITIONS.map((definition) => [definition.id, providerSettings(definition, providers[definition.id])]))
	};
}
function endpointValid(endpoint) {
	if (!endpoint) return true;
	try {
		const value = new URL(endpoint);
		return value.protocol === "http:" || value.protocol === "https:";
	} catch {
		return false;
	}
}
function detectProviderStatuses(settings, environment = {}, checkedAt = (/* @__PURE__ */ new Date()).toISOString()) {
	return PROVIDER_DEFINITIONS.map((definition) => {
		const config = settings.providers[definition.id];
		if (!config.enabled) return {
			id: definition.id,
			label: definition.label,
			group: definition.group,
			enabled: false,
			status: "disabled",
			detail: "已停用，不参与任务",
			checkedAt,
			endpoint: config.endpoint,
			model: config.model,
			credentialEnvs: [...config.credentialEnvs]
		};
		if (!endpointValid(config.endpoint)) return {
			id: definition.id,
			label: definition.label,
			group: definition.group,
			enabled: true,
			status: "invalid",
			detail: "Endpoint 不是有效的 HTTP(S) 地址",
			checkedAt,
			endpoint: config.endpoint,
			model: config.model,
			credentialEnvs: [...config.credentialEnvs]
		};
		if (definition.requiresCommand && !config.command) return {
			id: definition.id,
			label: definition.label,
			group: definition.group,
			enabled: true,
			status: "missing",
			detail: "尚未填写本地渲染命令",
			checkedAt,
			endpoint: config.endpoint,
			model: config.model,
			credentialEnvs: [...config.credentialEnvs]
		};
		const missing = config.credentialEnvs.filter((name) => !environment[name]);
		if (missing.length > 0) return {
			id: definition.id,
			label: definition.label,
			group: definition.group,
			enabled: true,
			status: "missing",
			detail: `缺少环境变量：${missing.join("、")}`,
			checkedAt,
			endpoint: config.endpoint,
			model: config.model,
			credentialEnvs: [...config.credentialEnvs]
		};
		const detail = definition.requiresCommand ? "命令已配置；首次运行时仍会执行实际渲染探测" : "配置项已具备；检测未调用外部 API";
		return {
			id: definition.id,
			label: definition.label,
			group: definition.group,
			enabled: true,
			status: "configured",
			detail,
			checkedAt,
			endpoint: config.endpoint,
			model: config.model,
			credentialEnvs: [...config.credentialEnvs]
		};
	});
}
function settingsSnapshot(settings, storage, contentRootConfigured, environment = {}, updatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
	return {
		settings: normalizeSettings(settings),
		statuses: detectProviderStatuses(normalizeSettings(settings), environment, updatedAt),
		storage,
		contentRootConfigured,
		updatedAt
	};
}
//#endregion
//#region src/env.ts
/**
* Windows 用户环境注册表（HKCU\Environment）读取。
* 背景：本机 dsh 启动链（bin.js → launcher）会剥离/重建子进程环境变量，
* 导致 setx 写入的用户环境变量在 harness 进程内 process.env 读不到。
* 此处提供注册表回退：key 已写入用户环境即可被 dsh-creator 检测与执行器读取，
* 不依赖进程启动方式。非 Windows 或读取失败时返回空映射。
*/
let cache = null;
function isWindows() {
	return typeof process !== "undefined" && process.platform === "win32";
}
function userEnvironment() {
	if (cache !== null) return cache;
	const out = {};
	if (!isWindows()) {
		cache = out;
		return out;
	}
	try {
		const result = spawnSync("reg", ["query", "HKCU\\Environment"], {
			encoding: "utf8",
			windowsHide: true,
			timeout: 8e3,
			maxBuffer: 1048576
		});
		if (result.status === 0) {
			const stdout = String(result.stdout ?? "");
			for (const line of stdout.split(/\r?\n/)) {
				const match = /^\s*(.+?)\s+REG_[A-Z_0-9]+\s+(.*)$/.exec(line.trim());
				if (match) out[match[1]] = match[2];
			}
		}
	} catch {}
	cache = out;
	return out;
}
/** 解析环境变量：process.env 优先，其次 Windows 用户环境注册表。 */
function resolveEnv(name) {
	const direct = process.env[name];
	if (direct !== void 0 && direct !== "") return direct;
	return userEnvironment()[name];
}
/** 合并后的完整环境视图：process.env + 用户环境注册表（后者仅补缺）。 */
function environmentWithUserVars() {
	const merged = { ...process.env };
	try {
		const user = userEnvironment();
		for (const [key, value] of Object.entries(user)) if (merged[key] === void 0 && value !== void 0 && value !== "") merged[key] = value;
	} catch {}
	return merged;
}
//#endregion
//#region src/fileRepository.ts
const MAX_TEXT_BYTES$1 = 2097152;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const PROJECT_PATTERN = /^(\d{4}-\d{2}-\d{2})_(.+)$/;
const STAGES$1 = [
	"brief",
	"article",
	"variants",
	"video",
	"publish"
];
const TARGETS$1 = [
	"wechat_article",
	"xhs_graphic",
	"douyin_video",
	"wechat_channels_video"
];
const GATES$1 = [
	"brief_sources",
	"approved_article",
	"platform_variants",
	"publish_package"
];
function isRecord$1(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function textValue$1(value, fallback = "") {
	return typeof value === "string" ? value : fallback;
}
function hashFor$1(value) {
	return `sha256-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}
function clone$1(value) {
	return JSON.parse(JSON.stringify(value));
}
function isMissing(error) {
	return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
function isValidStage(value) {
	return typeof value === "string" && STAGES$1.includes(value);
}
function isValidTarget(value) {
	return typeof value === "string" && TARGETS$1.includes(value);
}
function isValidGate(value) {
	return typeof value === "string" && GATES$1.includes(value);
}
function defaultApprovals() {
	return GATES$1.map((gate) => ({
		gate,
		approved: false,
		artifactHash: ""
	}));
}
function defaultTargets(value) {
	if (!Array.isArray(value)) return [...TARGETS$1];
	const targets = value.filter(isValidTarget);
	return targets.length > 0 ? targets : [...TARGETS$1];
}
function defaultDate(month, folder) {
	return PROJECT_PATTERN.exec(folder)?.[1] ?? `${month}-01`;
}
function validateProjectDraft(draft) {
	if (!draft.title.trim() || draft.title.trim().length > 120) throw new Error("主题标题不能为空且不能超过 120 个字符");
	if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]{1,80}$/u.test(draft.slug)) throw new Error("slug 只能包含中文、字母、数字、下划线或连字符");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.plannedAt)) throw new Error("plannedAt 必须是 YYYY-MM-DD");
	const timestamp = Date.parse(`${draft.plannedAt}T00:00:00Z`);
	if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== draft.plannedAt) throw new Error("plannedAt 不是有效日期");
}
function titleFromSlug(slug) {
	return slug.replace(/[-_]+/g, " ").trim() || "未命名主题";
}
function safeResolve$1(root, candidate) {
	const rootPath = resolve(root);
	const target = resolve(candidate);
	if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) throw new Error("文件路径越过内容根目录");
	return target;
}
async function readText(path) {
	const buffer = await readFile(path);
	if (buffer.byteLength > MAX_TEXT_BYTES$1) throw new Error(`文件过大（上限 ${MAX_TEXT_BYTES$1} 字节）：${path}`);
	return buffer.toString("utf8");
}
async function readOptionalText$1(path) {
	try {
		return await readText(path);
	} catch (error) {
		if (isMissing(error)) return "";
		throw error;
	}
}
async function readOptionalManifest(path) {
	try {
		const value = parse(await readText(path));
		return isRecord$1(value) ? { manifest: value } : {
			manifest: {},
			error: "project.yaml 必须是对象"
		};
	} catch (error) {
		if (isMissing(error)) return { manifest: {} };
		return {
			manifest: {},
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
async function readOptionalJson(path) {
	try {
		return JSON.parse(await readText(path));
	} catch (error) {
		if (isMissing(error)) return void 0;
		throw new Error(`JSON 文件无效：${path}`);
	}
}
async function assertNoSymlinkPath(base, candidate) {
	const basePath = resolve(base);
	const targetPath = safeResolve$1(basePath, candidate);
	const suffix = relative(basePath, targetPath);
	let current = basePath;
	for (const part of suffix.split(sep).filter(Boolean)) {
		current = join(current, part);
		try {
			if ((await lstat(current)).isSymbolicLink()) throw new Error(`拒绝读取符号链接路径：${current}`);
		} catch (error) {
			if (isMissing(error)) return;
			throw error;
		}
	}
}
async function ensureDirectoryChain(base, target) {
	const basePath = resolve(base);
	const targetPath = safeResolve$1(basePath, target);
	const suffix = relative(basePath, targetPath);
	let current = basePath;
	if (!suffix) return;
	for (const part of suffix.split(sep).filter(Boolean)) {
		current = join(current, part);
		try {
			const info = await lstat(current);
			if (info.isSymbolicLink()) throw new Error(`拒绝写入符号链接目录：${current}`);
			if (!info.isDirectory()) throw new Error(`写入目标不是目录：${current}`);
		} catch (error) {
			if (!isMissing(error)) throw error;
			await mkdir(current);
		}
	}
}
async function atomicWriteText$1(base, target, value) {
	const targetPath = safeResolve$1(base, join(base, target));
	const parent = dirname(targetPath);
	await ensureDirectoryChain(base, parent);
	const temporary = join(parent, `.${targetPath.split(sep).pop() ?? "content"}.${process.pid}.${Date.now()}.tmp`);
	await writeFile(temporary, value, {
		encoding: "utf8",
		flag: "wx"
	});
	try {
		await rename(temporary, targetPath);
	} catch (error) {
		await unlink(temporary).catch(() => void 0);
		throw error;
	}
}
async function directoryFileCount(path) {
	try {
		const info = await lstat(path);
		if (info.isSymbolicLink() || !info.isDirectory()) return 0;
		return (await readdir(path, { withFileTypes: true })).filter((entry) => !entry.isSymbolicLink() && (entry.isFile() || entry.isDirectory()) && entry.name !== "PENDING.md").length;
	} catch (error) {
		if (isMissing(error)) return 0;
		throw error;
	}
}
function artifactReady(project, path) {
	return project.artifacts.some((artifact) => artifact.path === path && artifact.ready);
}
function formatTime(totalSeconds) {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.floor(totalSeconds % 60);
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function parseScriptTimeline(script) {
	const pattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?[\s:：]+(.+)$/;
	const timed = [];
	for (const raw of script.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const match = pattern.exec(line);
		if (!match) continue;
		const hours = match[3] ? Number(match[1]) : 0;
		const minutes = match[3] ? Number(match[2]) : Number(match[1]);
		const seconds = match[3] ? Number(match[3]) : Number(match[2]);
		timed.push({
			seconds: hours * 3600 + minutes * 60 + seconds,
			text: match[4].trim()
		});
	}
	if (timed.length === 0) {
		const text = script.trim();
		if (!text) return [];
		return [{
			startSeconds: 0,
			endSeconds: 60,
			startLabel: "00:00",
			endLabel: "01:00",
			text
		}];
	}
	return timed.map((item, index) => {
		const next = timed[index + 1];
		const end = next ? Math.max(next.seconds, item.seconds + 1) : item.seconds + 5;
		return {
			startSeconds: item.seconds,
			endSeconds: end,
			startLabel: formatTime(item.seconds),
			endLabel: formatTime(end),
			text: item.text
		};
	});
}
function pendingActionsForPlatform(key, ready, provider) {
	if (key === "wechat_article") {
		const actions = [];
		if (!ready) actions.push("先完成公众号长文（wechat/article.md）");
		actions.push(provider?.status === "configured" ? "调用微信草稿 API 写入草稿箱（发布前需人工确认）" : "配置 WECHAT_APP_ID / WECHAT_APP_SECRET 后写入草稿箱");
		return actions;
	}
	if (key === "xhs_graphic") {
		const actions = [];
		if (!ready) actions.push("先完成小红书文案（xhs/post.md）");
		actions.push("按 xhs/cards/PENDING.md 生成 6–8 张图卡（图像 Provider）");
		actions.push("人工上传 xhs/post.md 与 xhs/cards/ 至小红书");
		return actions;
	}
	const actions = [];
	if (!ready) actions.push("先渲染 video/final.mp4（Remotion，见 video/narration/PENDING.md）");
	actions.push(provider?.status === "configured" ? "使用已配置的发布器准备草稿（最终发布需人工确认）" : "未配置视频发布器：仅生成发布包，人工上传");
	return actions;
}
async function fileArtifact(projectDirectory, path, kind, label) {
	const absolute = safeResolve$1(projectDirectory, join(projectDirectory, path));
	await assertNoSymlinkPath(projectDirectory, absolute);
	try {
		const info = await lstat(absolute);
		if (info.isSymbolicLink()) throw new Error(`拒绝读取符号链接：${path}`);
		const isDirectory = info.isDirectory();
		const count = isDirectory ? await directoryFileCount(absolute) : 0;
		const ready = isDirectory ? count > 0 : info.isFile() && info.size > 0;
		return {
			path,
			kind,
			label: path === "xhs/cards/" ? `小红书图卡 ${count} 张` : label,
			ready,
			hash: ready ? hashFor$1(`${path}:${info.size}:${info.mtimeMs}:${count}`) : "",
			updatedAt: info.mtime.toISOString()
		};
	} catch (error) {
		if (!isMissing(error)) throw error;
		return {
			path,
			kind,
			label,
			ready: false,
			hash: "",
			updatedAt: ""
		};
	}
}
function approvalsFrom(value) {
	if (!Array.isArray(value)) return defaultApprovals();
	const records = defaultApprovals();
	for (const item of value) {
		if (!isRecord$1(item) || !isValidGate(item.gate)) continue;
		const target = records.find((record) => record.gate === item.gate);
		if (!target) continue;
		target.approved = item.approved === true;
		target.approvedAt = typeof item.approvedAt === "string" ? item.approvedAt : void 0;
		target.artifactHash = textValue$1(item.artifactHash);
	}
	return records;
}
function deriveStage(approvals, manifest) {
	if (isValidStage(manifest.stage)) return manifest.stage;
	if (approvals.find((item) => item.gate === "publish_package")?.approved) return "publish";
	if (approvals.find((item) => item.gate === "platform_variants")?.approved) return "video";
	if (approvals.find((item) => item.gate === "approved_article")?.approved) return "variants";
	if (approvals.find((item) => item.gate === "brief_sources")?.approved) return "article";
	return "brief";
}
function deriveNextAction(stage, approvals) {
	const pending = approvals.find((item) => !item.approved);
	if (!pending) return "检查草稿并人工点击最终发布";
	if (pending.gate === "brief_sources") return "补充 Brief、事实和可核验来源";
	if (pending.gate === "approved_article") return "审阅公众号长文并批准表达锚点";
	if (pending.gate === "platform_variants") return "检查小红书图卡与视频脚本";
	return stage === "publish" ? "生成发布包并人工确认平台草稿" : "准备发布包并等待人工确认";
}
function gateHash(project, gate) {
	if (gate === "brief_sources") return hashFor$1(`${project.brief}\n${project.artifacts.find((item) => item.path === "claims.yaml")?.hash ?? ""}`);
	if (gate === "approved_article") return hashFor$1(project.article);
	if (gate === "platform_variants") return hashFor$1(`${project.article}\n${project.xhsCopy}\n${project.videoScript}`);
	return hashFor$1(project.artifacts.find((item) => item.path === "publish/package.json")?.hash ?? "");
}
function invalidateFrom(records, gate) {
	const index = GATES$1.indexOf(gate);
	for (const record of records) if (GATES$1.indexOf(record.gate) >= index) {
		record.approved = false;
		record.approvedAt = void 0;
	}
}
var FileCreatorRepository = class {
	root;
	constructor(contentRoot) {
		if (!contentRoot.trim()) throw new Error("未配置 contentRoot，无法使用文件内容仓库");
		this.root = resolve(contentRoot);
	}
	settingsRelativePath() {
		return join("_工作台", "creator-settings.json");
	}
	async readSettingsFile() {
		await this.ensureRoot();
		const absolute = safeResolve$1(this.root, join(this.root, this.settingsRelativePath()));
		await assertNoSymlinkPath(this.root, absolute);
		try {
			const parsed = JSON.parse(await readText(absolute));
			const info = await lstat(absolute);
			return {
				settings: normalizeSettings(parsed),
				updatedAt: info.mtime.toISOString()
			};
		} catch (error) {
			if (!isMissing(error)) throw error;
			return {
				settings: defaultSettings(),
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
		}
	}
	async ensureRoot() {
		let info;
		try {
			info = await lstat(this.root);
		} catch (error) {
			if (isMissing(error)) throw new Error(`内容根目录不存在：${this.root}`);
			throw error;
		}
		if (info.isSymbolicLink()) throw new Error("contentRoot 不能是符号链接");
		if (!info.isDirectory()) throw new Error(`contentRoot 不是目录：${this.root}`);
	}
	async locations() {
		await this.ensureRoot();
		const result = [];
		const months = await readdir(this.root, { withFileTypes: true });
		for (const month of months) {
			if (!month.isDirectory() || month.isSymbolicLink() || !MONTH_PATTERN.test(month.name)) continue;
			const monthDirectory = safeResolve$1(this.root, join(this.root, month.name));
			const projects = await readdir(monthDirectory, { withFileTypes: true });
			for (const project of projects) {
				if (!project.isDirectory() || project.isSymbolicLink()) continue;
				const directory = safeResolve$1(this.root, join(monthDirectory, project.name));
				if ((await lstat(directory)).isSymbolicLink()) continue;
				result.push({
					month: month.name,
					folder: project.name,
					directory
				});
			}
		}
		return result;
	}
	async readLocation(location) {
		const manifestPath = safeResolve$1(location.directory, join(location.directory, "project.yaml"));
		await assertNoSymlinkPath(location.directory, manifestPath);
		const parsed = await readOptionalManifest(manifestPath);
		const manifest = parsed.manifest;
		const slug = textValue$1(manifest.slug, location.folder.replace(PROJECT_PATTERN, "$2")) || location.folder;
		const id = textValue$1(manifest.id, `${location.month}-${slug}`);
		const title = textValue$1(manifest.title, titleFromSlug(slug));
		const plannedAt = textValue$1(manifest.plannedAt, defaultDate(location.month, location.folder));
		const briefPath = safeResolve$1(location.directory, join(location.directory, "brief.md"));
		const articlePath = safeResolve$1(location.directory, join(location.directory, "wechat/article.md"));
		const xhsCopyPath = safeResolve$1(location.directory, join(location.directory, "xhs/post.md"));
		const videoScriptPath = safeResolve$1(location.directory, join(location.directory, "video/script.md"));
		await Promise.all([
			assertNoSymlinkPath(location.directory, briefPath),
			assertNoSymlinkPath(location.directory, articlePath),
			assertNoSymlinkPath(location.directory, xhsCopyPath),
			assertNoSymlinkPath(location.directory, videoScriptPath)
		]);
		const brief = await readOptionalText$1(briefPath);
		const article = await readOptionalText$1(articlePath);
		const xhsCopy = await readOptionalText$1(xhsCopyPath);
		const videoScript = await readOptionalText$1(videoScriptPath);
		const sourceCount = await directoryFileCount(safeResolve$1(location.directory, join(location.directory, "sources")));
		const claimsPath = safeResolve$1(location.directory, join(location.directory, "claims.yaml"));
		await assertNoSymlinkPath(location.directory, claimsPath);
		const claimsText = await readOptionalText$1(claimsPath);
		let claimsHasItems = false;
		try {
			const parsedClaims = parse(claimsText);
			claimsHasItems = isRecord$1(parsedClaims) && Array.isArray(parsedClaims.claims) && parsedClaims.claims.length > 0;
		} catch {
			claimsHasItems = false;
		}
		const claims = await fileArtifact(location.directory, "claims.yaml", "source", "Claims 与来源");
		if (!claimsHasItems) claims.ready = false;
		const artifacts = await Promise.all([
			fileArtifact(location.directory, "brief.md", "markdown", "Brief"),
			claims,
			fileArtifact(location.directory, "sources/", "source", `来源目录${sourceCount ? ` ${sourceCount} 项` : ""}`),
			fileArtifact(location.directory, "wechat/article.md", "markdown", "公众号长文"),
			fileArtifact(location.directory, "xhs/post.md", "markdown", "小红书文案"),
			fileArtifact(location.directory, "xhs/cards/", "image", "小红书图卡"),
			fileArtifact(location.directory, "video/script.md", "markdown", "视频脚本"),
			fileArtifact(location.directory, "video/scenes.json", "json", "视频场景"),
			fileArtifact(location.directory, "video/captions.json", "json", "视频字幕"),
			fileArtifact(location.directory, "video/narration/", "audio", "视频配音"),
			fileArtifact(location.directory, "video/final.mp4", "video", "视频预览"),
			fileArtifact(location.directory, "publish/package.json", "json", "发布包"),
			fileArtifact(location.directory, "publish/preview.html", "json", "微信排版预览")
		]);
		const approvalsPath = safeResolve$1(location.directory, join(location.directory, "approvals.json"));
		await assertNoSymlinkPath(location.directory, approvalsPath);
		const raw = approvalsFrom(await readOptionalJson(approvalsPath) ?? manifest.approvals);
		const hasSources = claimsHasItems || sourceCount > 0;
		const blockedReason = textValue$1(manifest.blockedReason) || parsed.error || (!brief.trim() ? "Brief 尚未填写" : !hasSources ? "来源尚未准备" : void 0);
		const status = blockedReason ? "blocked" : manifest.status === "running" ? "running" : "ready";
		const project = {
			id,
			title,
			slug,
			month: location.month,
			plannedAt,
			stage: "brief",
			status,
			progress: 0,
			nextAction: "",
			blockedReason,
			targets: defaultTargets(manifest.targets),
			approvals: raw,
			artifacts,
			brief,
			article,
			xhsCopy,
			videoScript
		};
		const effective = raw.map((record) => {
			if (!record.approved || record.artifactHash === "") return record;
			return gateHash(project, record.gate) === record.artifactHash ? record : {
				...record,
				approved: false,
				approvedAt: void 0
			};
		});
		project.approvals = effective;
		project.stage = deriveStage(effective, manifest);
		project.progress = Math.min(100, effective.filter((item) => item.approved).length * 25);
		project.nextAction = textValue$1(manifest.nextAction, deriveNextAction(project.stage, effective));
		return {
			location,
			manifest,
			manifestError: parsed.error,
			project
		};
	}
	async find(id) {
		for (const location of await this.locations()) {
			const item = await this.readLocation(location);
			if (item.project.id === id) return item;
		}
		throw new Error(`主题不存在：${id}`);
	}
	async listProjects(query = "") {
		const needle = query.trim().toLowerCase();
		return (await Promise.all((await this.locations()).map((location) => this.readLocation(location)))).map((item) => item.project).filter((project) => needle === "" || `${project.title} ${project.slug}`.toLowerCase().includes(needle)).sort((a, b) => b.plannedAt.localeCompare(a.plannedAt)).map(clone$1);
	}
	async createProject(draft) {
		validateProjectDraft(draft);
		await this.ensureRoot();
		const month = draft.plannedAt.slice(0, 7);
		const folder = `${draft.plannedAt}_${draft.slug}`;
		const monthDirectory = safeResolve$1(this.root, join(this.root, month));
		await ensureDirectoryChain(this.root, monthDirectory);
		const projectDirectory = safeResolve$1(this.root, join(monthDirectory, folder));
		try {
			if ((await lstat(projectDirectory)).isSymbolicLink()) throw new Error("拒绝覆盖符号链接主题目录");
			throw new Error("同一日期和 slug 的主题已存在");
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
		await mkdir(projectDirectory);
		const id = `${month}-${draft.slug}`;
		const targets = draft.targets?.filter(isValidTarget);
		const manifest = {
			schemaVersion: 1,
			id,
			title: draft.title.trim(),
			slug: draft.slug,
			plannedAt: draft.plannedAt,
			stage: "brief",
			status: "blocked",
			nextAction: "填写 Brief 并补充可核验来源",
			targets: targets && targets.length > 0 ? targets : [...TARGETS$1]
		};
		await atomicWriteText$1(projectDirectory, "project.yaml", stringify(manifest));
		await atomicWriteText$1(projectDirectory, "brief.md", `# ${draft.title.trim()}\n\n> 选题卡：本主题从哪个选题转正而来，服务谁、解决什么问题。\n\n- 目标读者：\n- 核心问题：\n- 边界：\n- 待验证问题：\n- 来源：\n  - \n`);
		await atomicWriteText$1(projectDirectory, "claims.yaml", "# 待补充主张与来源\nclaims: []\n");
		await atomicWriteText$1(projectDirectory, "wechat/article.md", "");
		await atomicWriteText$1(projectDirectory, "xhs/post.md", "");
		await atomicWriteText$1(projectDirectory, "video/script.md", "");
		await atomicWriteText$1(projectDirectory, "approvals.json", `${JSON.stringify(defaultApprovals(), null, 2)}\n`);
		await ensureDirectoryChain(projectDirectory, join(projectDirectory, "sources"));
		await ensureDirectoryChain(projectDirectory, join(projectDirectory, "wechat"));
		await ensureDirectoryChain(projectDirectory, join(projectDirectory, "xhs", "cards"));
		await ensureDirectoryChain(projectDirectory, join(projectDirectory, "video"));
		return clone$1((await this.find(id)).project);
	}
	async getProject(id) {
		try {
			return clone$1((await this.find(id)).project);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("主题不存在：")) return null;
			throw error;
		}
	}
	async updateArtifact(id, content) {
		const item = await this.find(id);
		const files = [
			["brief", "brief.md"],
			["article", "wechat/article.md"],
			["xhsCopy", "xhs/post.md"],
			["videoScript", "video/script.md"]
		];
		let changed = false;
		for (const [field, path] of files) {
			const value = content[field];
			if (value === item.project[field]) continue;
			if (Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES$1) throw new Error(`${path} 超过 2 MiB 上限`);
			await atomicWriteText$1(item.location.directory, path, value);
			changed = true;
		}
		if (changed) {
			const approvals = approvalsFrom(item.project.approvals);
			if (content.brief !== item.project.brief) invalidateFrom(approvals, "brief_sources");
			else if (content.article !== item.project.article) invalidateFrom(approvals, "approved_article");
			else if (content.xhsCopy !== item.project.xhsCopy || content.videoScript !== item.project.videoScript) invalidateFrom(approvals, "platform_variants");
			await atomicWriteText$1(item.location.directory, "approvals.json", `${JSON.stringify(approvals, null, 2)}\n`);
		}
		return clone$1((await this.find(id)).project);
	}
	async approveGate(id, gate) {
		if (!isValidGate(gate)) throw new Error("审批闸门不存在");
		const item = await this.find(id);
		const { project } = item;
		const ready = (path) => project.artifacts.some((artifact) => artifact.path === path && artifact.ready);
		if (gate === "brief_sources" && (!project.brief.trim() || !ready("claims.yaml") && !ready("sources/"))) throw new Error("Brief 与来源未准备完整");
		if (gate === "approved_article" && (!project.approvals.find((record) => record.gate === "brief_sources")?.approved || !project.article.trim())) throw new Error("请先批准 Brief 与来源，并完成公众号长文");
		if (gate === "platform_variants" && (!project.approvals.find((record) => record.gate === "approved_article")?.approved || !project.xhsCopy.trim() || !project.videoScript.trim())) throw new Error("请先批准公众号长文，并完成平台变体");
		if (gate === "publish_package" && (!project.approvals.find((record) => record.gate === "platform_variants")?.approved || !ready("publish/package.json"))) throw new Error("请先批准平台变体，并生成发布包");
		const approvals = approvalsFrom(project.approvals);
		const record = approvals.find((entry) => entry.gate === gate);
		if (!record) throw new Error("审批闸门不存在");
		record.approved = true;
		record.approvedAt = (/* @__PURE__ */ new Date()).toISOString();
		record.artifactHash = gateHash(project, gate);
		await atomicWriteText$1(item.location.directory, "approvals.json", `${JSON.stringify(approvals, null, 2)}\n`);
		return clone$1((await this.find(id)).project);
	}
	async runStage(id, stage) {
		if (!isValidStage(stage)) throw new Error("创作阶段不存在");
		const item = await this.find(id);
		const { project } = item;
		const settings = await this.getSettings();
		let approvalsChanged = false;
		const approvals = approvalsFrom(project.approvals);
		if (stage === "article") {
			if (!project.brief.trim() || !artifactReady(project, "claims.yaml") && !artifactReady(project, "sources/")) throw new Error("请先完成 Brief 与可核验来源（brief.md、claims.yaml 或 sources/）");
		}
		if (stage === "variants") {
			if (!project.xhsCopy.trim()) throw new Error("请先完成小红书文案（xhs/post.md）");
			const pending = [
				"# 小红书图卡待执行清单",
				"",
				`> 生成时间：${(/* @__PURE__ */ new Date()).toISOString()} · 状态：pending（尚未生成任何图卡）`,
				"",
				"依据已批准公众号长文与 xhs/post.md 生成 6–8 张 3:4 图卡：",
				"",
				"1. 封面：主题一句话 + 平台名",
				"2. 事实卡：每个核心主张一张，文字可读、可追溯到 claims.yaml",
				"3. 结构卡：长文结构拆解（背景 → 事实 → 结论）",
				"4. 结尾卡：行动建议或关注引导",
				"",
				"每张卡保存可复现提示词到本目录（如 card-01.prompt.md），生成的图片以 card-01.png 命名。",
				"图像 Provider 可用之前，不要伪造 PNG 已生成。",
				""
			].join("\n");
			await atomicWriteText$1(item.location.directory, join("xhs", "cards", "PENDING.md"), pending);
		}
		if (stage === "video") {
			if (!project.videoScript.trim()) throw new Error("请先完成视频脚本（video/script.md）");
			const timeline = parseScriptTimeline(project.videoScript);
			const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
			const scenes = timeline.map((line, index) => ({
				index: index + 1,
				start: line.startLabel,
				end: line.endLabel,
				durationSec: Math.round(line.endSeconds - line.startSeconds),
				text: line.text,
				visual: ""
			}));
			const captions = timeline.map((line, index) => ({
				index: index + 1,
				start: line.startLabel,
				end: line.endLabel,
				text: line.text
			}));
			await atomicWriteText$1(item.location.directory, "video/scenes.json", `${JSON.stringify({
				schemaVersion: 1,
				source: "video/script.md",
				generatedAt,
				sceneCount: scenes.length,
				scenes
			}, null, 2)}\n`);
			await atomicWriteText$1(item.location.directory, "video/captions.json", `${JSON.stringify({
				schemaVersion: 1,
				source: "video/script.md",
				generatedAt,
				captionCount: captions.length,
				captions
			}, null, 2)}\n`);
			const speechStatus = settings.statuses.find((status) => status.id === "speech");
			const remotionStatus = settings.statuses.find((status) => status.id === "remotion");
			const pending = [
				"# 视频成片待执行清单",
				"",
				`> 生成时间：${generatedAt} · scenes.json / captions.json 已由 script.md 派生`,
				"",
				"- [ ] 配音：使用 speech Provider 为每个场景生成旁白（video/narration/）。",
				`      当前状态：${speechStatus?.status === "configured" ? "speech Provider 已配置" : "speech Provider 未配置（pending）"}`,
				"- [ ] 渲染：使用 remotion Provider 合成 1080×1920、30fps 成片（video/final.mp4）。",
				`      当前状态：${remotionStatus?.status === "configured" ? "remotion 已配置" : "remotion 未配置（pending）"}`,
				"- [ ] 视觉：为每个场景补充视觉提示词（scenes.json 的 visual 字段）。",
				"",
				"Provider 可用之前，不伪造 narration 音频或 final.mp4 已生成。",
				""
			].join("\n");
			await atomicWriteText$1(item.location.directory, join("video", "narration", "PENDING.md"), pending);
		}
		if (stage === "publish") {
			if (!approvals.find((record) => record.gate === "platform_variants")?.approved) throw new Error("请先批准平台变体（platform_variants）再生成发布包");
			const statusOf = (id) => settings.statuses.find((status) => status.id === id);
			const platforms = [
				{
					key: "wechat_article",
					label: "公众号",
					providerId: "wechat",
					source: "wechat/article.md"
				},
				{
					key: "xhs_graphic",
					label: "小红书",
					providerId: "xhs",
					source: "xhs/post.md"
				},
				{
					key: "douyin_video",
					label: "抖音",
					providerId: "douyin",
					source: "video/final.mp4"
				},
				{
					key: "wechat_channels_video",
					label: "视频号",
					providerId: "channels",
					source: "video/final.mp4"
				}
			].map((row) => {
				const provider = statusOf(row.providerId);
				const ready = row.key === "wechat_article" ? project.article.trim().length > 0 : row.key === "xhs_graphic" ? project.xhsCopy.trim().length > 0 : artifactReady(project, "video/final.mp4");
				return {
					key: row.key,
					label: row.label,
					source: row.source,
					assets: row.key === "xhs_graphic" ? "xhs/cards/" : void 0,
					provider: {
						id: row.providerId,
						status: provider?.status ?? "missing",
						detail: provider?.detail ?? ""
					},
					ready,
					status: "pending",
					pendingActions: pendingActionsForPlatform(row.key, ready, provider)
				};
			});
			const packageData = {
				schemaVersion: 1,
				projectId: project.id,
				title: project.title,
				generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				requiresHumanConfirmation: true,
				platforms
			};
			await atomicWriteText$1(item.location.directory, "publish/package.json", `${JSON.stringify(packageData, null, 2)}\n`);
			const pending = [
				"# 发布待执行清单",
				"",
				`> 生成时间：${(/* @__PURE__ */ new Date()).toISOString()} · 发布包不代表已发布`,
				"",
				...platforms.flatMap((row) => [`- ${row.label}（${row.key}）：${row.ready ? "素材就绪" : "素材缺失"}`, ...row.pendingActions.map((action) => `    - ${action}`)]),
				"",
				"所有平台草稿写入与最终发布都必须由用户明确批准后执行。",
				""
			].join("\n");
			await atomicWriteText$1(item.location.directory, "publish/PENDING.md", pending);
			invalidateFrom(approvals, "publish_package");
			approvalsChanged = true;
		}
		if (approvalsChanged) await atomicWriteText$1(item.location.directory, "approvals.json", `${JSON.stringify(approvals, null, 2)}\n`);
		const manifest = {
			...item.manifest,
			stage,
			status: project.blockedReason ? "blocked" : "ready",
			nextAction: project.blockedReason ? project.nextAction : deriveNextAction(stage, approvals)
		};
		await atomicWriteText$1(item.location.directory, "project.yaml", stringify(manifest));
		return clone$1((await this.find(id)).project);
	}
	async getCapabilities() {
		let configured = false;
		try {
			const info = await lstat(this.root);
			configured = info.isDirectory() && !info.isSymbolicLink();
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
		const settings = await this.getSettings();
		const stateOf = (id) => {
			const status = settings.statuses.find((item) => item.id === id);
			if (status === void 0) return "missing";
			if (status.status === "configured") return "configured";
			if (status.status === "disabled") return "disabled";
			return "missing";
		};
		return {
			dshVersion: "0.1.1-rc.2",
			repositoryMode: "file",
			contentRootConfigured: configured,
			contentRoot: configured ? this.root : "",
			imageProvider: stateOf("image"),
			speechProvider: stateOf("speech"),
			remotion: stateOf("remotion"),
			wechatDraft: stateOf("wechat"),
			browserDraft: "unavailable",
			settingsStorage: "file"
		};
	}
	async getRevision() {
		await this.ensureRoot();
		const fingerprint = [];
		for (const location of await this.locations()) {
			fingerprint.push(`${location.folder}:${(await lstat(location.directory)).mtimeMs}`);
			try {
				const entries = await readdir(location.directory, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isSymbolicLink()) continue;
					const path = join(location.directory, entry.name);
					if (entry.isFile()) {
						const info = await lstat(path);
						fingerprint.push(`${entry.name}:${info.size}:${info.mtimeMs}`);
					} else if (entry.isDirectory()) try {
						const nested = await readdir(path, { withFileTypes: true });
						for (const file of nested) {
							if (!file.isFile() || file.isSymbolicLink()) continue;
							const info = await lstat(join(path, file.name));
							fingerprint.push(`${entry.name}/${file.name}:${info.size}:${info.mtimeMs}`);
						}
					} catch {}
				}
			} catch {}
		}
		return `rev-${createHash("sha256").update(fingerprint.join("\n")).digest("hex").slice(0, 16)}`;
	}
	async getSettings() {
		const stored = await this.readSettingsFile();
		return settingsSnapshot(stored.settings, "file", true, environmentWithUserVars(), stored.updatedAt);
	}
	async saveSettings(settings) {
		await this.ensureRoot();
		const normalized = normalizeSettings(settings);
		await atomicWriteText$1(this.root, this.settingsRelativePath(), `${JSON.stringify(normalized, null, 2)}\n`);
		return this.getSettings();
	}
	async checkSettings() {
		return this.getSettings();
	}
};
//#endregion
//#region src/mockRepository.ts
const now = "2026-08-23T09:00:00+08:00";
function artifact(path, kind, label, ready, hash) {
	return {
		path,
		kind,
		label,
		ready,
		hash,
		updatedAt: now
	};
}
function initialProjects() {
	return [
		{
			id: "topic-ai-workflow",
			title: "AI 工作流如何持续产出",
			slug: "ai-workflow-continuous-output",
			month: "2026-08",
			plannedAt: "2026-08-25",
			stage: "variants",
			status: "ready",
			progress: 62,
			nextAction: "检查小红书图卡与视频首屏",
			targets: [
				"wechat_article",
				"xhs_graphic",
				"douyin_video",
				"wechat_channels_video"
			],
			approvals: [
				{
					gate: "brief_sources",
					approved: true,
					approvedAt: "2026-08-23T09:10:00+08:00",
					artifactHash: "brief-a1"
				},
				{
					gate: "approved_article",
					approved: true,
					approvedAt: "2026-08-23T10:20:00+08:00",
					artifactHash: "article-b2"
				},
				{
					gate: "platform_variants",
					approved: false,
					artifactHash: "variants-c3"
				},
				{
					gate: "publish_package",
					approved: false,
					artifactHash: "publish-d4"
				}
			],
			artifacts: [
				artifact("brief.md", "markdown", "Brief", true, "brief-a1"),
				artifact("claims.yaml", "source", "Claims 与来源", true, "claims-a2"),
				artifact("wechat/article.md", "markdown", "公众号长文", true, "article-b2"),
				artifact("xhs/cards/", "image", "小红书图卡 6 张", true, "xhs-c3"),
				artifact("video/scenes.json", "json", "视频场景", true, "video-c4"),
				artifact("video/final.mp4", "video", "视频预览", false, "video-d5")
			],
			brief: "# AI 工作流如何持续产出\n\n核心问题：如何把一次研究拆成可复用的长文、图卡和视频。\n\n目标读者：希望稳定更新、但没有专职编辑团队的独立创作者。",
			article: "# 让一次研究变成一周的内容\n\n真正可持续的内容生产，不是每天临时寻找灵感，而是把一个主题拆成可复用的事实、观点和表达。\n\n本文将从资料整理、长文写作、图卡拆分和视频脚本四个阶段说明这条链路。",
			xhsCopy: "一份研究，如何拆成一篇长文、6 张图卡和一条视频？\n\n关键不是多开几个平台，而是先建立一份可追溯的内容真源。",
			videoScript: "00:00 开场：为什么持续更新会变成体力活\n00:08 先把主题拆成事实与观点\n00:22 长文作为表达锚点\n00:38 图卡负责降低理解门槛\n00:54 视频负责建立记忆点\n01:08 结尾：一次研究，连续产出一周内容"
		},
		{
			id: "topic-creator-system",
			title: "独立创作者的内容系统",
			slug: "creator-content-system",
			month: "2026-08",
			plannedAt: "2026-08-27",
			stage: "brief",
			status: "blocked",
			progress: 18,
			nextAction: "补充 3 个一手来源，再确认选题",
			blockedReason: "来源不足：当前只有 1 个可核验来源",
			targets: [
				"wechat_article",
				"xhs_graphic",
				"douyin_video",
				"wechat_channels_video"
			],
			approvals: [
				{
					gate: "brief_sources",
					approved: false,
					artifactHash: "brief-e1"
				},
				{
					gate: "approved_article",
					approved: false,
					artifactHash: "article-e2"
				},
				{
					gate: "platform_variants",
					approved: false,
					artifactHash: "variants-e3"
				},
				{
					gate: "publish_package",
					approved: false,
					artifactHash: "publish-e4"
				}
			],
			artifacts: [
				artifact("brief.md", "markdown", "Brief", true, "brief-e1"),
				artifact("claims.yaml", "source", "Claims 与来源", false, "claims-e2"),
				artifact("wechat/article.md", "markdown", "公众号长文", false, "article-e3")
			],
			brief: "# 独立创作者的内容系统\n\n待补充：读者画像、真实案例和来源列表。",
			article: "",
			xhsCopy: "",
			videoScript: ""
		},
		{
			id: "topic-long-to-video",
			title: "从一篇长文到短视频",
			slug: "long-article-to-short-video",
			month: "2026-07",
			plannedAt: "2026-07-31",
			stage: "publish",
			status: "ready",
			progress: 92,
			nextAction: "确认公众号草稿并记录平台链接",
			targets: [
				"wechat_article",
				"xhs_graphic",
				"douyin_video",
				"wechat_channels_video"
			],
			approvals: [
				{
					gate: "brief_sources",
					approved: true,
					approvedAt: "2026-07-28T09:10:00+08:00",
					artifactHash: "brief-f1"
				},
				{
					gate: "approved_article",
					approved: true,
					approvedAt: "2026-07-29T11:20:00+08:00",
					artifactHash: "article-f2"
				},
				{
					gate: "platform_variants",
					approved: true,
					approvedAt: "2026-07-30T14:00:00+08:00",
					artifactHash: "variants-f3"
				},
				{
					gate: "publish_package",
					approved: false,
					artifactHash: "publish-f4"
				}
			],
			artifacts: [
				artifact("brief.md", "markdown", "Brief", true, "brief-f1"),
				artifact("claims.yaml", "source", "Claims 与来源", true, "claims-f2"),
				artifact("wechat/article.md", "markdown", "公众号长文", true, "article-f2"),
				artifact("xhs/cards/", "image", "小红书图卡 8 张", true, "xhs-f3"),
				artifact("video/final.mp4", "video", "视频预览", true, "video-f4"),
				artifact("publish/package.json", "json", "发布包", true, "publish-f5")
			],
			brief: "# 从一篇长文到短视频\n\n以一篇已经完成审校的长文为锚点，拆出适合短视频的单一观点。",
			article: "# 从一篇长文到短视频\n\n长文和短视频不是两套选题，而是同一份事实材料的两种表达。",
			xhsCopy: "长文不是视频脚本的废稿，而是最稳定的内容锚点。",
			videoScript: "00:00 一个主题，为什么要有两种表达\n00:12 长文负责完整解释\n00:30 视频负责单点记忆\n00:52 用同一份事实校验两种版本"
		}
	];
}
function clone(value) {
	return JSON.parse(JSON.stringify(value));
}
function hashFor(text) {
	let hash = 2166136261;
	for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
	return `mock-${(hash >>> 0).toString(16)}`;
}
var MockCreatorRepository = class {
	projects = new Map(initialProjects().map((project) => [project.id, project]));
	settings = defaultSettings();
	async listProjects(query = "") {
		const needle = query.trim().toLowerCase();
		return [...this.projects.values()].filter((project) => needle === "" || `${project.title} ${project.slug}`.toLowerCase().includes(needle)).sort((a, b) => b.plannedAt.localeCompare(a.plannedAt)).map(clone);
	}
	async createProject(draft) {
		if (!draft.title.trim() || !draft.slug || !/^[\p{L}\p{N}][\p{L}\p{N}_-]{1,80}$/u.test(draft.slug) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.plannedAt)) throw new Error("主题标题、slug 或计划日期无效");
		const id = `${draft.plannedAt.slice(0, 7)}-${draft.slug}`;
		if (this.projects.has(id)) throw new Error("同一日期和 slug 的主题已存在");
		const project = {
			id,
			title: draft.title,
			slug: draft.slug,
			month: draft.plannedAt.slice(0, 7),
			plannedAt: draft.plannedAt,
			stage: "brief",
			status: "blocked",
			progress: 0,
			nextAction: "填写 Brief 并补充可核验来源",
			blockedReason: "Brief 尚未填写",
			targets: draft.targets?.length ? [...draft.targets] : [
				"wechat_article",
				"xhs_graphic",
				"douyin_video",
				"wechat_channels_video"
			],
			approvals: [
				{
					gate: "brief_sources",
					approved: false,
					artifactHash: ""
				},
				{
					gate: "approved_article",
					approved: false,
					artifactHash: ""
				},
				{
					gate: "platform_variants",
					approved: false,
					artifactHash: ""
				},
				{
					gate: "publish_package",
					approved: false,
					artifactHash: ""
				}
			],
			artifacts: [
				artifact("brief.md", "markdown", "Brief", false, ""),
				artifact("claims.yaml", "source", "Claims 与来源", false, ""),
				artifact("wechat/article.md", "markdown", "公众号长文", false, ""),
				artifact("xhs/cards/", "image", "小红书图卡", false, ""),
				artifact("video/scenes.json", "json", "视频场景", false, ""),
				artifact("video/captions.json", "json", "视频字幕", false, ""),
				artifact("video/final.mp4", "video", "视频预览", false, ""),
				artifact("publish/package.json", "json", "发布包", false, ""),
				artifact("publish/preview.html", "json", "微信排版预览", false, "")
			],
			brief: `# ${draft.title}\n\n> 选题卡：本主题从哪个选题转正而来，服务谁、解决什么问题。\n\n- 目标读者：\n- 核心问题：\n- 边界：\n- 待验证问题：\n- 来源：\n  - \n`,
			article: "",
			xhsCopy: "",
			videoScript: ""
		};
		this.projects.set(id, project);
		this.bumpRevision();
		return clone(project);
	}
	async getProject(id) {
		const project = this.projects.get(id);
		return project ? clone(project) : null;
	}
	async updateArtifact(id, content) {
		const project = this.projects.get(id);
		if (!project) throw new Error("主题不存在");
		Object.assign(project, content);
		const hash = hashFor(content.article || content.brief || content.xhsCopy || content.videoScript);
		project.artifacts = project.artifacts.map((item) => item.label === "公众号长文" ? {
			...item,
			ready: Boolean(content.article),
			hash,
			updatedAt: now
		} : item);
		project.approvals = project.approvals.map((item) => item.gate === "approved_article" || item.gate === "platform_variants" || item.gate === "publish_package" ? {
			...item,
			approved: false,
			approvedAt: void 0,
			artifactHash: hash
		} : item);
		project.nextAction = "重新审阅已修改的产物";
		project.status = "ready";
		this.bumpRevision();
		return clone(project);
	}
	async approveGate(id, gate) {
		const project = this.projects.get(id);
		if (!project) throw new Error("主题不存在");
		const index = project.approvals.findIndex((item) => item.gate === gate);
		if (index < 0) throw new Error("审批闸门不存在");
		project.approvals[index] = {
			...project.approvals[index],
			approved: true,
			approvedAt: now
		};
		project.progress = Math.min(100, project.progress + 9);
		project.nextAction = gate === "publish_package" ? "打开各平台草稿并人工确认最终发布" : "继续准备下一个阶段";
		this.bumpRevision();
		return clone(project);
	}
	async runStage(id, stage) {
		const project = this.projects.get(id);
		if (!project) throw new Error("主题不存在");
		if (stage === "article" && (!project.brief.trim() || !project.artifacts.find((item) => item.path === "claims.yaml")?.ready)) throw new Error("请先完成 Brief 与可核验来源（brief.md、claims.yaml 或 sources/）");
		if (stage === "variants" && !project.xhsCopy.trim()) throw new Error("请先完成小红书文案（xhs/post.md）");
		if (stage === "video" && !project.videoScript.trim()) throw new Error("请先完成视频脚本（video/script.md）");
		if (stage === "publish" && !project.approvals.find((item) => item.gate === "platform_variants")?.approved) throw new Error("请先批准平台变体（platform_variants）再生成发布包");
		project.stage = stage;
		project.status = "running";
		project.nextAction = `正在运行${stage}阶段`;
		await new Promise((resolve) => setTimeout(resolve, 350));
		project.artifacts = project.artifacts.map((item) => {
			if (stage === "variants" && item.path === "xhs/cards/") return {
				...item,
				ready: project.xhsCopy.trim().length > 0,
				updatedAt: now
			};
			if (stage === "video" && (item.path === "video/scenes.json" || item.path === "video/captions.json")) return {
				...item,
				ready: project.videoScript.trim().length > 0,
				updatedAt: now
			};
			if (stage === "publish" && item.path === "publish/package.json") return {
				...item,
				ready: true,
				updatedAt: now
			};
			return item;
		});
		project.status = "ready";
		project.progress = Math.min(100, Math.max(project.progress, stage === "publish" ? 92 : project.progress + 7));
		project.nextAction = stage === "publish" ? "检查草稿并人工点击最终发布" : "等待人工审阅并批准当前产物";
		this.bumpRevision();
		return clone(project);
	}
	async getCapabilities() {
		return {
			dshVersion: "0.1.1-rc.2",
			repositoryMode: "mock",
			contentRootConfigured: false,
			contentRoot: "",
			imageProvider: "mock",
			speechProvider: "mock",
			remotion: "mock",
			wechatDraft: "mock",
			browserDraft: "unavailable",
			settingsStorage: "memory"
		};
	}
	revision = 0;
	async getRevision() {
		return `mock-${this.revision}`;
	}
	bumpRevision() {
		this.revision += 1;
	}
	async getSettings() {
		return settingsSnapshot(this.settings, "memory", false, {});
	}
	async saveSettings(settings) {
		this.settings = normalizeSettings(settings);
		this.bumpRevision();
		return this.getSettings();
	}
	async checkSettings() {
		return this.getSettings();
	}
};
function createMockRepository() {
	return new MockCreatorRepository();
}
//#endregion
//#region src/workflowPrompt.ts
const CREATOR_WORKFLOW_PROMPT = `
你正在 OriOS 内容工作台中处理一个主题。主题目录是唯一真源；先读取主题目录中的 project.yaml、brief.md、claims.yaml、sources/ 和已有产物，再开始本阶段工作。

目录契约：
- brief.md：选题、目标读者、核心问题、边界与待验证问题。
- claims.yaml + sources/：每个事实主张及其来源；没有来源的事实不能写成确定结论。
- wechat/article.md：公众号长文，是所有平台改写的表达锚点。
- xhs/post.md + xhs/cards/：小红书图文文案与图卡提示/素材。
- video/script.md + video/scenes.json + video/captions.json：抖音和视频号共用的无真人解说视频资产。
- publish/package.json：平台发布包，只能在发布包审批通过后生成或更新。
- approvals.json：四级人工闸门：brief_sources → approved_article → platform_variants → publish_package。

阶段纪律：
1. 先报告当前目录、已存在产物、缺失产物和来源风险，再执行任务。
2. 一次只推进当前阶段；不要跳过人工审批，不要把未核验推断写成事实。
3. 公众号长文先完成，再从长文拆小红书和视频；平台版本必须能追溯回同一组主张。
4. 生成图片、配音或视频时保存可复现的提示词、场景和字幕文件；Provider 不可用时只写待执行清单，不伪造已完成文件。
5. 不调用私有 DSH Agent API，不自动点击任何平台的最终发布按钮；平台草稿写入也必须在用户明确批准后进行。
6. 完成本阶段后停在下一个审批闸门，向用户报告改动文件、来源缺口、下一步和是否需要人工确认。

工作方法（融合 creator-buddy 创作工作流，详见 references/creator-buddy-standard.md）：
1. 情报先行：brief_sources 阶段先做平台情报——搜热点、挖爆款、看评论、拆竞品（复用 web 搜索与素材库）；真实数据优先，拿不到就标注「未经数据验证」，不编造互动量级。
2. 卡点路由：先判断当前卡在哪一环（定位/选题/写作/标题/封面/复盘）再选对应打法，不为走完流程硬插步骤；没定位就不做标题优化。
3. 平台专属打法：
   - 公众号：先诊断素材形态再选六种写法之一（访谈/大纲/续写/整合/破题/重写）；开头几句能独立成立；手机屏单段 ≤90 字；超 2000 字分小节；结尾只给一个动作；过 AI 腔黑名单与成稿质检。
   - 小红书：开头 3 行是生死线、段落 1-3 行、第一人称；按 7 种笔记类型写；标题按 15 法出 3-5 个候选并评分；三层标签（大词引流/中词精准/小词卡位）；功效词与绝对化表述动笔就改。
   - 视频：口播先能念再精确（拆长句、去书面连接词，判断标准=读出声）；script.md 分镜精确到秒（时间/口播/画面/呈现/转场）；动手前定平台与比例；每步产出落盘交接。
4. 复盘沉淀：发布后按六层漏斗归因（曝光→点击→完读→互动→涨粉→转化）与账号八维体检，把可复用公式回写素材库与候选池。
5. 纪律：不编造（无真实体验不写「我用了三个月」）；合规优先于爆款；只做参谋不做批量。

UI 触发约定（窗口按钮发出的任务，落盘路径固定，窗口会自动刷新）：
- 情报调研 → contentRoot/_工作台/情报/YYYY-MM-DD_赛道关键词.md（frontmatter：关键词/日期/数据源状态 real|unverified）；
- 标题候选 → 主题目录 xhs/titles.md；复盘 → 主题目录 publish/review.md（六层漏斗数据 + 归因 + 八维体检 + 可复用公式节）。
`.trim();
function buildWorkflowPrompt(runtime) {
	const lines = [
		CREATOR_WORKFLOW_PROMPT,
		"",
		"工作台工具（通过对话直接调用）："
	];
	lines.push("- creator_workflow_guide：自引导指南与实时能力状态；creator_setup：只读检查环境。");
	lines.push("- creator_list / creator_get：列出主题、查看阶段/闸门/产物链与主题目录。");
	lines.push("- creator_create：按约定建主题文件夹；creator_update_artifact：保存内容字段（与 UI 一致）。");
	lines.push("- creator_run_stage：运行阶段生成（video 派生 scenes/captions、publish 生成发布包、variants 写图卡待执行清单）。");
	lines.push("- creator_approve：批准闸门（必须用户已审阅对应产物）；creator_settings：配置 Provider。");
	lines.push("正文内容用系统文件工具读写；工作台工具只做文件做不到的事。");
	lines.push("");
	lines.push(`当前仓库：${runtime.repositoryMode === "file" ? "文件真源" : "mock 原型"}；contentRoot：${runtime.contentRootConfigured ? runtime.contentRoot || "已配置" : "未配置（需在插件配置中设置 contentRoot 或置 ORIOS_CREATOR_CONTENT_ROOT 环境变量）"}。`);
	return lines.join("\n");
}
function buildHandoffPrompt(project, stageLabel, directory) {
	return `${directory ? `主题目录：${directory}\n` : ""}请处理内容主题「${project.title}」。使用 @当前内容，先读取主题文件夹及 claims.yaml/sources/，当前阶段是「${stageLabel}」。遵守 OriOS 内容工作台的四级审批闸门：只推进当前阶段，完成后停在下一闸门，不要写入外部平台草稿或执行最终发布。`;
}
//#endregion
//#region src/wewriteCli.ts
/**
* wewrite CLI（公众号内容全流程 Skill）封装：确定性命令（score/similarity 等）。
* CLI 定位优先级：环境变量 ORIOS_WEWRITE_CLI → contentRoot/_工作台/wewrite-cli/.venv/Scripts/wewrite.exe。
* 找不到时工具层应明确报错，不伪造评分。
*/
function resolveWewriteCli(contentRoot) {
	const fromEnv = process.env.ORIOS_WEWRITE_CLI;
	if (fromEnv !== void 0 && fromEnv.trim() !== "" && existsSync(fromEnv.trim())) return fromEnv.trim();
	if (contentRoot !== void 0 && contentRoot !== "") {
		const candidates = [join(contentRoot, "_工作台", "wewrite-cli", ".venv", "Scripts", "wewrite.exe"), join(contentRoot, "_工作台", "wewrite-cli", ".venv", "bin", "wewrite")];
		for (const candidate of candidates) if (existsSync(candidate)) return candidate;
	}
	return null;
}
function runWewrite(cliPath, args) {
	const result = spawnSync(cliPath, [...args], {
		encoding: "utf8",
		timeout: 12e4,
		maxBuffer: 8388608
	});
	return {
		ok: result.status === 0 && result.error === void 0,
		stdout: String(result.stdout ?? ""),
		stderr: String(result.stderr ?? ""),
		status: result.status
	};
}
function parseWewriteJson(result) {
	if (!result.ok) return null;
	try {
		return JSON.parse(result.stdout);
	} catch {
		return null;
	}
}
//#endregion
//#region src/reviewService.ts
/**
* wewrite 质量把关服务：评分（score）与查重（similarity）。
* 逻辑同时供 Agent 工具（creator_review_score / creator_similarity_check）与
* 客户端 HTTP 端点（/creator/api/review-score、/creator/api/similarity-check）复用。
*/
async function folderPathOf$1(repository, project) {
	try {
		const capabilities = await repository.getCapabilities();
		if (capabilities.repositoryMode !== "file" || !capabilities.contentRoot) return void 0;
		return `${capabilities.contentRoot}/${project.month}/${project.plannedAt}_${project.slug}`;
	} catch {
		return;
	}
}
async function reviewArticleScore(repository, id) {
	if (id === "") throw new Error("id is required");
	const project = await repository.getProject(id);
	if (project === null) throw new Error(`content not found: ${id}`);
	const folderPath = await folderPathOf$1(repository, project);
	if (folderPath === void 0) throw new Error("mock 模式没有真实主题目录");
	const cli = resolveWewriteCli((await repository.getCapabilities()).contentRoot);
	if (cli === null) throw new Error("未找到 wewrite CLI：请安装到 内容库/_工作台/wewrite-cli（.venv/Scripts/wewrite.exe）或设置 ORIOS_WEWRITE_CLI 环境变量");
	const result = runWewrite(cli, [
		"score",
		`${folderPath}/wechat/article.md`,
		"--json"
	]);
	const parsed = parseWewriteJson(result);
	if (parsed === null) throw new Error(`wewrite score 失败（${result.status ?? "error"}）：${result.stderr.trim().slice(0, 400) || result.stdout.trim().slice(0, 400)}`);
	return {
		quality_score: parsed.quality_score ?? 0,
		composite_score: parsed.composite_score ?? 0,
		tier1: parsed.tier1,
		tier2: parsed.tier2,
		source: "wewrite score --json",
		note: "分数只提示语言节奏可能的问题；五维审稿（准确/观点/有用/合声/好读）仍是编辑判断依据。"
	};
}
async function checkVariantSimilarity(repository, id, target = "both") {
	if (id === "") throw new Error("id is required");
	const project = await repository.getProject(id);
	if (project === null) throw new Error(`content not found: ${id}`);
	const folderPath = await folderPathOf$1(repository, project);
	if (folderPath === void 0) throw new Error("mock 模式没有真实主题目录");
	const cli = resolveWewriteCli((await repository.getCapabilities()).contentRoot);
	if (cli === null) throw new Error("未找到 wewrite CLI：请安装到 内容库/_工作台/wewrite-cli（.venv/Scripts/wewrite.exe）或设置 ORIOS_WEWRITE_CLI 环境变量");
	const articlePath = `${folderPath}/wechat/article.md`;
	const targets = target === "xhs" ? ["xhs/post.md"] : target === "video" ? ["video/script.md"] : ["xhs/post.md", "video/script.md"];
	const pairs = [];
	for (const relative of targets) {
		const result = runWewrite(cli, [
			"similarity",
			articlePath,
			`${folderPath}/${relative}`,
			"--json"
		]);
		const parsed = parseWewriteJson(result);
		if (parsed === null) throw new Error(`wewrite similarity 失败（${relative}）：${result.stderr.trim().slice(0, 400) || result.stdout.trim().slice(0, 400)}`);
		pairs.push({
			source: relative,
			result: parsed
		});
	}
	return {
		pairs,
		note: "相似度是改写程度的提示信号；平台版本仍须内容级真改并追溯回同一组主张（五维审稿中的「合声/准确」把关）。"
	};
}
//#endregion
//#region src/imageGenerate.ts
async function generateImages(options) {
	const { endpoint, model, apiKey, prompt, outputDir, baseName } = options;
	if (apiKey === "") throw new Error("图像 Provider 缺少 API Key");
	if (prompt.trim() === "") throw new Error("生成图片需要提示词（prompt）");
	const count = options.count === void 0 ? 1 : Math.min(4, Math.max(1, Math.round(options.count)));
	const size = options.size ?? "1024x1024";
	const url = `${endpoint.replace(/\/+$/, "")}/images/generations`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			prompt,
			n: count,
			size
		}),
		signal: AbortSignal.timeout(12e4)
	});
	if (!response.ok) {
		const body = (await response.text()).slice(0, 500);
		throw new Error(`图像 Provider 返回 ${response.status}：${body || "无响应体"}`);
	}
	const items = (await response.json()).data ?? [];
	if (items.length === 0) throw new Error("图像 Provider 未返回任何图片");
	await mkdir(outputDir, { recursive: true });
	const saved = [];
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		let bytes;
		if (typeof item.b64_json === "string" && item.b64_json !== "") bytes = Buffer.from(item.b64_json, "base64");
		else if (typeof item.url === "string" && item.url !== "") {
			const imageResponse = await fetch(item.url, { signal: AbortSignal.timeout(6e4) });
			if (!imageResponse.ok) throw new Error(`下载生成图片失败：${imageResponse.status}`);
			bytes = Buffer.from(await imageResponse.arrayBuffer());
		} else throw new Error("图像 Provider 返回项缺少图片数据");
		if (bytes.byteLength === 0) throw new Error("图像 Provider 返回了空图片");
		const filename = `${baseName}${items.length > 1 ? `-${index + 1}` : ""}.png`;
		await writeFile(join(outputDir, filename), bytes);
		saved.push(join(outputDir, filename));
	}
	return {
		saved,
		count: saved.length
	};
}
//#endregion
//#region src/imageService.ts
async function generateTopicImage(repository, options) {
	if (options.id === "") throw new Error("id is required");
	if (typeof options.prompt !== "string" || options.prompt.trim() === "") throw new Error("prompt is required");
	const settings = await repository.getSettings();
	const imageStatus = settings.statuses.find((status) => status.id === "image");
	if (imageStatus === void 0 || imageStatus.status !== "configured") throw new Error(`图像 Provider 未配置：请先在 DSH 设置页「内容工作台」卡片配置 image（endpoint/model/credentialEnvs），并确保凭据环境变量存在（${imageStatus?.detail ?? "当前未配置"}）。未配置时不生成图片。`);
	const imageConfig = settings.settings.providers.image;
	const keyEnv = imageConfig.credentialEnvs.find((name) => resolveEnv(name) !== void 0);
	if (keyEnv === void 0) throw new Error(`图像 Provider 缺少可用密钥：${imageConfig.credentialEnvs.join("、")} 均未设置（环境变量或 Windows 用户环境）`);
	const apiKey = resolveEnv(keyEnv);
	const project = await repository.getProject(options.id);
	if (project === null) throw new Error(`content not found: ${options.id}`);
	const folderPath = await folderPathOf$1(repository, project);
	if (folderPath === void 0) throw new Error("mock 模式没有真实主题目录，无法保存图片");
	const target = options.target === "article" ? "wechat/images" : "xhs/cards";
	const baseName = typeof options.filename === "string" && options.filename.trim() !== "" ? options.filename.trim() : project.slug;
	const result = await generateImages({
		endpoint: imageConfig.endpoint,
		model: imageConfig.model,
		apiKey,
		prompt: options.prompt.trim(),
		count: typeof options.count === "number" ? options.count : 1,
		outputDir: `${folderPath}/${target}`,
		baseName
	});
	return {
		saved: result.saved,
		count: result.count
	};
}
//#endregion
//#region src/creatorTools.ts
const JSON_VALUE = { type: "json" };
const GATES = [
	"brief_sources",
	"approved_article",
	"platform_variants",
	"publish_package"
];
const STAGES = [
	"brief",
	"article",
	"variants",
	"video",
	"publish"
];
const TARGETS = [
	"wechat_article",
	"xhs_graphic",
	"douyin_video",
	"wechat_channels_video"
];
const PROVIDER_IDS = [
	"image",
	"speech",
	"remotion",
	"wechat",
	"xhs",
	"douyin",
	"channels"
];
const GATE_LABELS = {
	brief_sources: "Brief 与来源",
	approved_article: "公众号长文",
	platform_variants: "平台变体",
	publish_package: "发布包"
};
const STAGE_LABELS = {
	brief: "Brief 与来源",
	article: "公众号长文",
	variants: "平台变体",
	video: "视频成片",
	publish: "发布准备"
};
const FIELD_TRUNCATE = 6e3;
function signalOf(exec) {
	return exec.signal;
}
function compactText(title, detail) {
	return [{
		type: "text",
		text: `${title}: ${detail}`
	}];
}
function asJson(value) {
	return JSON.parse(JSON.stringify(value));
}
function present(title, rawInput) {
	return {
		card: "generic",
		title,
		kind: "other",
		rawInput
	};
}
function truncate(value) {
	if (value.length <= FIELD_TRUNCATE) return {
		text: value,
		truncated: false
	};
	return {
		text: `${value.slice(0, FIELD_TRUNCATE)}\n…（已截断，完整内容请在主题文件夹中读取）`,
		truncated: true
	};
}
function gatesOf(project) {
	return GATES.map((gate) => {
		const record = project.approvals.find((item) => item.gate === gate);
		return {
			gate,
			label: GATE_LABELS[gate],
			approved: record?.approved === true,
			approvedAt: record?.approvedAt
		};
	});
}
function summaryOf(project) {
	return {
		id: project.id,
		title: project.title,
		slug: project.slug,
		month: project.month,
		plannedAt: project.plannedAt,
		stage: project.stage,
		stageLabel: STAGE_LABELS[project.stage],
		status: project.status,
		progress: project.progress,
		nextAction: project.nextAction,
		...project.blockedReason === void 0 ? {} : { blockedReason: project.blockedReason },
		gates: gatesOf(project)
	};
}
async function folderPathOf(repository, project) {
	try {
		const capabilities = await repository.getCapabilities();
		if (capabilities.repositoryMode !== "file" || !capabilities.contentRoot) return void 0;
		return `${capabilities.contentRoot}/${project.month}/${project.plannedAt}_${project.slug}`;
	} catch {
		return;
	}
}
function registerCreatorTools(ctx, repository, workspace) {
	const disposers = [];
	const register = (tool) => {
		const stop = ctx.tools.register(tool);
		if (typeof stop === "function") disposers.push(stop);
	};
	register(defineTool({
		name: "creator_workflow_guide",
		description: "OriOS 内容工作台自引导指南。用户问这个工作台能做什么、怎么用，或你不确定下一步时调用。返回四级审批闸门工作流、主题目录契约与实时能力状态（内容根目录是否配置、Provider 状态）。",
		parameters: {},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const status = value.status;
				return compactText("Creator guide", status?.contentRootConfigured ? "内容根目录已配置" : "内容根目录未配置");
			}
		},
		presentCall: (args) => present("Creator guide", args),
		async execute(_args, exec) {
			signalOf(exec);
			const capabilities = await repository.getCapabilities();
			const settings = await repository.getSettings();
			const profile = await workspace.get();
			const candidates = await workspace.list();
			const profileConfigured = Object.keys(profile).length > 0;
			return asJson({
				guide: [
					"OriOS 内容生产工作台：以主题目录为唯一真源，按四级人工审批闸门连续生产公众号、小红书、抖音与视频号内容。",
					"闸门顺序：brief_sources（Brief 与来源）→ approved_article（公众号长文）→ platform_variants（平台变体）→ publish_package（发布包）。",
					"选题流程：素材（飞书表格/OrbitOS 知识库/本地）→ 候选选题池 _工作台/candidates.yaml（creator_candidate_add 添加）→ 用户挑选（creator_candidate_select）→ 转正建主题（creator_candidate_convert）。",
					"目录契约：project.yaml（元数据）、brief.md（选题卡）、claims.yaml+sources/（主张与来源）、wechat/article.md（长文锚点）、xhs/post.md+xhs/cards/（小红书）、video/script.md+scenes.json+captions.json（视频）、publish/package.json（发布包）、approvals.json（闸门）。",
					"正文内容用系统文件工具读写；本工作台工具负责建主题、审批、运行阶段生成、Provider 设置、选题库与状态查询。",
					"纪律：一次只推进当前阶段；没有来源的事实不能写成确定结论；Provider 不可用时只写待执行清单，不伪造产物；平台草稿写入与最终发布必须用户明确批准。",
					...profileConfigured ? [] : ["首次部署：请先调用 creator_profile 填写账号定位（定位/目标读者/语气/常用方向），据此生成简易选题筛选标准。"]
				].join("\n"),
				status: {
					repositoryMode: capabilities.repositoryMode,
					contentRootConfigured: capabilities.contentRootConfigured,
					contentRoot: capabilities.contentRoot ?? "",
					settingsStorage: capabilities.settingsStorage ?? "memory",
					profileConfigured,
					candidateCount: candidates.length,
					providers: settings.statuses.map((status) => ({
						id: status.id,
						label: status.label,
						status: status.status,
						detail: status.detail
					}))
				}
			});
		}
	}));
	register(defineTool({
		name: "creator_setup",
		description: "只读检查内容工作台：内容根目录、仓库模式（file/mock）与 Provider 状态。contentRoot 来自插件配置（cordis.patch.yml 的 contentRoot 或 ORIOS_CREATOR_CONTENT_ROOT 环境变量），改配置后需重载宿主生效；Provider 设置可通过 creator_settings 更新。",
		parameters: {},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const status = value.status;
				return compactText("Creator setup", `mode=${status?.repositoryMode ?? "unknown"}`);
			}
		},
		presentCall: (args) => present("Creator setup", args),
		async execute(_args, exec) {
			signalOf(exec);
			const capabilities = await repository.getCapabilities();
			const settings = await repository.getSettings();
			const profile = await workspace.get();
			const profileConfigured = Object.keys(profile).length > 0;
			return asJson({
				status: {
					repositoryMode: capabilities.repositoryMode,
					contentRootConfigured: capabilities.contentRootConfigured,
					contentRoot: capabilities.contentRoot ?? "",
					settingsStorage: capabilities.settingsStorage ?? "memory",
					profileConfigured,
					providers: settings.statuses.map((status) => ({
						id: status.id,
						label: status.label,
						status: status.status,
						detail: status.detail
					}))
				},
				note: profileConfigured ? "contentRoot 只能通过插件配置修改（cordis.patch.yml 或 ORIOS_CREATOR_CONTENT_ROOT），改后需重载宿主。Provider 设置用 creator_settings 更新。" : "账号画像尚未配置：请先用 creator_profile 填写账号定位/目标读者/语气，据此生成简易选题筛选标准。contentRoot 只能通过插件配置修改。"
			});
		}
	}));
	register(defineTool({
		name: "creator_settings",
		description: "读取或更新工作台的 Provider 设置（图像/配音/Remotion/微信/小红书/抖音/视频号）。省略 provider 时返回当前全部设置与状态；给出 provider 时仅合并传入的字段。密钥只存环境变量名，不存密钥值。",
		parameters: {
			provider: {
				type: "string",
				enum: PROVIDER_IDS,
				description: "要更新的 Provider id。省略则只读。"
			},
			enabled: {
				type: "boolean",
				description: "启用或停用该 Provider。"
			},
			endpoint: {
				type: "string",
				description: "HTTP(S) 接口地址。"
			},
			model: {
				type: "string",
				description: "模型/版本。"
			},
			credentialEnvs: {
				type: "array",
				items: { type: "string" },
				description: "密钥环境变量名列表。"
			},
			command: {
				type: "string",
				description: "本地命令（Remotion 等）。"
			},
			profilePath: {
				type: "string",
				description: "平台会话/Profile 路径。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				return compactText("Creator settings", value.updated === true ? "updated" : "read");
			}
		},
		presentCall: (args) => present("Creator settings", args),
		async execute(args, exec) {
			signalOf(exec);
			const current = await repository.getSettings();
			if (typeof args.provider !== "string" || !PROVIDER_IDS.includes(args.provider)) return asJson({
				settings: current.settings,
				statuses: current.statuses,
				updated: false
			});
			const id = args.provider;
			const patch = {};
			if (typeof args.enabled === "boolean") patch.enabled = args.enabled;
			if (typeof args.endpoint === "string") patch.endpoint = args.endpoint;
			if (typeof args.model === "string") patch.model = args.model;
			if (Array.isArray(args.credentialEnvs)) patch.credentialEnvs = args.credentialEnvs.filter((item) => typeof item === "string");
			if (typeof args.command === "string") patch.command = args.command;
			if (typeof args.profilePath === "string") patch.profilePath = args.profilePath;
			const next = {
				...current.settings,
				providers: {
					...current.settings.providers,
					[id]: {
						...current.settings.providers[id],
						...patch
					}
				}
			};
			const snapshot = await repository.saveSettings(next);
			return asJson({
				settings: snapshot.settings,
				statuses: snapshot.statuses,
				updated: true
			});
		}
	}));
	register(defineTool({
		name: "creator_list",
		description: "列出内容主题。可按标题/slug 关键词过滤；返回每个主题的阶段、状态、进度、下一动作与四个闸门状态。",
		parameters: { query: {
			type: "string",
			description: "关键词过滤，省略返回全部。"
		} },
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const items = value.items;
				return compactText("Creator list", `${items === void 0 ? 0 : items.length} topics`);
			}
		},
		presentCall: (args) => present("Creator list", args),
		async execute(args, exec) {
			signalOf(exec);
			return asJson({ items: (await repository.listProjects(typeof args.query === "string" ? args.query : "")).map(summaryOf) });
		}
	}));
	register(defineTool({
		name: "creator_get",
		description: "读取一个内容主题的详情：阶段、闸门、产物链与内容字段（超长字段截断）。完整正文请用系统文件工具按返回的主题目录读取；mock 模式没有真实目录。",
		parameters: { id: {
			type: "string",
			required: true,
			description: "主题 id（如 2026-08-ai-workflow）。"
		} },
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const record = value;
				return compactText("Creator topic", record.title || record.id || "");
			}
		},
		presentCall: (args) => present("Creator topic", args),
		async execute(args, exec) {
			signalOf(exec);
			if (args.id === "") throw new Error("id is required");
			const project = await repository.getProject(String(args.id));
			if (project === null) throw new Error(`content not found: ${args.id}`);
			const folderPath = await folderPathOf(repository, project);
			const brief = truncate(project.brief);
			const article = truncate(project.article);
			const xhsCopy = truncate(project.xhsCopy);
			const videoScript = truncate(project.videoScript);
			return asJson({
				...summaryOf(project),
				...folderPath === void 0 ? {} : { folderPath },
				targets: project.targets,
				artifacts: project.artifacts.map((artifact) => ({
					path: artifact.path,
					label: artifact.label,
					kind: artifact.kind,
					ready: artifact.ready
				})),
				content: {
					brief,
					article,
					xhsCopy,
					videoScript
				}
			});
		}
	}));
	register(defineTool({
		name: "creator_create",
		description: "创建新的内容主题文件夹（按 YYYY-MM/YYYY-MM-DD_slug 约定），返回主题 id。",
		parameters: {
			title: {
				type: "string",
				required: true,
				description: "主题标题（≤120 字符）。"
			},
			slug: {
				type: "string",
				description: "slug（中文、字母、数字、下划线或连字符）。省略时由标题派生。"
			},
			plannedAt: {
				type: "string",
				description: "计划日期 YYYY-MM-DD。省略用今天。"
			},
			targets: {
				type: "array",
				items: {
					type: "string",
					enum: TARGETS
				},
				description: "目标平台。省略为全部四个平台。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				return compactText("Created", value.id || "");
			}
		},
		presentCall: (args) => present("Create topic", args),
		async execute(args, exec) {
			signalOf(exec);
			if (typeof args.title !== "string" || args.title.trim() === "") throw new Error("title is required");
			const title = args.title.trim();
			const slug = typeof args.slug === "string" && args.slug.trim() !== "" ? args.slug.trim() : title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "new-topic";
			const plannedAt = typeof args.plannedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.plannedAt) ? args.plannedAt : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
			const targets = Array.isArray(args.targets) ? args.targets.filter((target) => TARGETS.includes(target)) : void 0;
			const created = await repository.createProject({
				title,
				slug,
				plannedAt,
				targets
			});
			const folderPath = await folderPathOf(repository, created);
			return asJson({
				...summaryOf(created),
				...folderPath === void 0 ? {} : { folderPath }
			});
		}
	}));
	register(defineTool({
		name: "creator_update_artifact",
		description: "保存主题的一个或多个内容字段（brief/article/xhsCopy/videoScript）。保存会按内容哈希使受影响的下游审批闸门自动失效。完整正文通常直接用系统文件工具写入，本工具用于与工作台 UI 一致的保存。",
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "主题 id。"
			},
			brief: {
				type: "string",
				description: "Brief 全文。"
			},
			article: {
				type: "string",
				description: "公众号长文全文（wechat/article.md）。"
			},
			xhsCopy: {
				type: "string",
				description: "小红书文案全文（xhs/post.md）。"
			},
			videoScript: {
				type: "string",
				description: "视频脚本全文（video/script.md）。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				return compactText("Saved", value.id || "");
			}
		},
		presentCall: (args) => present("Update artifact", args),
		async execute(args, exec) {
			signalOf(exec);
			if (args.id === "") throw new Error("id is required");
			const project = await repository.getProject(String(args.id));
			if (project === null) throw new Error(`content not found: ${args.id}`);
			const next = {
				brief: typeof args.brief === "string" ? args.brief : project.brief,
				article: typeof args.article === "string" ? args.article : project.article,
				xhsCopy: typeof args.xhsCopy === "string" ? args.xhsCopy : project.xhsCopy,
				videoScript: typeof args.videoScript === "string" ? args.videoScript : project.videoScript
			};
			const updated = await repository.updateArtifact(project.id, next);
			const folderPath = await folderPathOf(repository, updated);
			return asJson({
				...summaryOf(updated),
				...folderPath === void 0 ? {} : { folderPath }
			});
		}
	}));
	register(defineTool({
		name: "creator_approve",
		description: "批准一个审批闸门。必须按顺序推进：brief_sources → approved_article → platform_variants → publish_package；前置闸门未批准或必备产物缺失时会报错。批准是人工动作，调用前应确认用户已审阅对应产物。",
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "主题 id。"
			},
			gate: {
				type: "string",
				required: true,
				enum: GATES,
				description: "要批准的闸门。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				return compactText("Approved", value.gate || "");
			}
		},
		presentCall: (args) => present("Approve gate", args),
		async execute(args, exec) {
			signalOf(exec);
			if (args.id === "" || !GATES.includes(args.gate)) throw new Error("id and gate are required");
			return asJson({
				...summaryOf(await repository.approveGate(String(args.id), args.gate)),
				approved: true
			});
		}
	}));
	register(defineTool({
		name: "creator_run_stage",
		description: "运行一个创作阶段并生成该阶段产物：video 由 script.md 派生 scenes.json/captions.json 并写待执行清单；publish 生成含 Provider 状态与待执行动作的发布包（需平台变体已批准）；variants 写图卡待执行清单。Provider 不可用时只写 PENDING 清单，不会伪造 PNG/音频/MP4。",
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "主题 id。"
			},
			stage: {
				type: "string",
				required: true,
				enum: STAGES,
				description: "要运行的阶段。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const record = value;
				return compactText("Stage run", `${record.stage ?? ""} · ${record.nextAction ?? ""}`);
			}
		},
		presentCall: (args) => present("Run stage", args),
		async execute(args, exec) {
			signalOf(exec);
			if (args.id === "" || !STAGES.includes(args.stage)) throw new Error("id and stage are required");
			const updated = await repository.runStage(String(args.id), args.stage);
			return asJson({
				...summaryOf(updated),
				artifacts: updated.artifacts.map((artifact) => ({
					path: artifact.path,
					ready: artifact.ready
				}))
			});
		}
	}));
	register(defineTool({
		name: "creator_candidates",
		description: "列出候选选题池（_工作台/candidates.yaml）。可按状态过滤（pending/selected/converted）；素材整理后先提取候选进选题库，用户挑选后再转正为主题。",
		parameters: { status: {
			type: "string",
			enum: [
				"pending",
				"selected",
				"converted"
			],
			description: "按状态过滤，省略返回全部。"
		} },
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const items = value.items;
				return compactText("Candidates", `${items === void 0 ? 0 : items.length} items`);
			}
		},
		presentCall: (args) => present("List candidates", args),
		async execute(args, exec) {
			signalOf(exec);
			const items = await workspace.list();
			return asJson({ items: (typeof args.status === "string" && [
				"pending",
				"selected",
				"converted"
			].includes(args.status) ? items.filter((item) => item.status === args.status) : items).map((item) => ({ ...item })) });
		}
	}));
	register(defineTool({
		name: "creator_candidate_add",
		description: "向候选选题池添加一条候选选题（title/claim/source）。素材整理后逐条或批量添加；添加后向用户展示候选清单，等用户挑选（creator_candidate_select）再转正。",
		parameters: {
			title: {
				type: "string",
				required: true,
				description: "候选选题标题。"
			},
			claim: {
				type: "string",
				required: true,
				description: "一句话核心主张（可核验）。"
			},
			sourceKind: {
				type: "string",
				enum: [
					"lark-base",
					"orbitos",
					"file",
					"web"
				],
				description: "来源类型。"
			},
			sourceRef: {
				type: "string",
				required: true,
				description: "来源引用（表格记录 id / 知识库页面 / 文件路径 / 链接）。"
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "标签。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const record = value;
				return compactText("Candidate added", record.item?.title || record.item?.id || "");
			}
		},
		presentCall: (args) => present("Add candidate", args),
		async execute(args, exec) {
			signalOf(exec);
			return asJson({ item: await workspace.add({
				title: String(args.title ?? ""),
				claim: String(args.claim ?? ""),
				source: {
					kind: typeof args.sourceKind === "string" ? args.sourceKind : "file",
					ref: String(args.sourceRef ?? "")
				},
				tags: Array.isArray(args.tags) ? args.tags.filter((tag) => typeof tag === "string") : void 0
			}) });
		}
	}));
	register(defineTool({
		name: "creator_candidate_select",
		description: "把候选选题标记为 selected（用户已挑选）。用户说「选 1、3」等之后调用；之后用 creator_candidate_convert 逐条转正为主题。",
		parameters: { ids: {
			type: "array",
			items: { type: "string" },
			required: true,
			description: "候选选题 id 列表。"
		} },
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const record = value;
				return compactText("Candidates selected", `${record.selected === void 0 ? 0 : record.selected.length} items`);
			}
		},
		presentCall: (args) => present("Select candidates", args),
		async execute(args, exec) {
			signalOf(exec);
			const ids = Array.isArray(args.ids) ? args.ids.filter((id) => typeof id === "string") : [];
			return asJson({
				items: (await workspace.select(ids)).map((item) => ({ ...item })),
				selected: ids
			});
		}
	}));
	register(defineTool({
		name: "creator_candidate_convert",
		description: "把一条已挑选的候选选题转正为主题：创建主题文件夹并标记候选 converted（回填主题 id）。转正后请用系统文件工具把候选的主张与来源写入 claims.yaml/sources/，并补全 brief 选题卡字段，再推进 brief_sources 闸门。",
		parameters: { id: {
			type: "string",
			required: true,
			description: "候选选题 id（先 creator_candidates 查看）。"
		} },
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const record = value;
				return compactText("Topic created", record.topic?.title || record.topic?.id || "");
			}
		},
		presentCall: (args) => present("Convert candidate", args),
		async execute(args, exec) {
			signalOf(exec);
			if (args.id === "") throw new Error("id is required");
			const candidate = (await workspace.list()).find((item) => item.id === args.id);
			if (candidate === void 0) throw new Error(`候选选题不存在：${args.id}`);
			if (candidate.status === "converted") throw new Error(`候选选题已转正：${candidate.convertedTopic ?? candidate.id}`);
			const title = candidate.title;
			const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "new-topic";
			const plannedAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
			const created = await repository.createProject({
				title,
				slug,
				plannedAt
			});
			const next = await workspace.convert(candidate.id, created.id);
			const folderPath = await folderPathOf(repository, created);
			return asJson({
				topic: {
					...summaryOf(created),
					...folderPath === void 0 ? {} : { folderPath }
				},
				candidate: next.find((item) => item.id === candidate.id),
				note: "主题已创建。请用文件工具把候选的主张与来源写入 claims.yaml/sources/，补全 brief 选题卡字段后再批准 brief_sources。"
			});
		}
	}));
	register(defineTool({
		name: "creator_profile",
		description: "读取或更新账号创作画像（首次部署引导）：账号定位、目标读者、语气、常用选题方向与筛选标准模板。省略全部字段时只读；给出字段时合并保存。首次部署先填写定位/读者/语气，再据其生成简易筛选标准（selectionCriteria）。",
		parameters: {
			positioning: {
				type: "string",
				description: "账号定位一句话（做什么内容、给谁看）。"
			},
			targetAudience: {
				type: "string",
				description: "目标读者画像。"
			},
			tone: {
				type: "string",
				description: "语气/风格偏好。"
			},
			directions: {
				type: "array",
				items: { type: "string" },
				description: "常用选题方向。"
			},
			selectionCriteria: {
				type: "string",
				description: "选题筛选标准模板（依据定位生成）。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				return compactText("Creator profile", value.profile?.positioning ? "saved" : "read");
			}
		},
		presentCall: (args) => present("Creator profile", args),
		async execute(args, exec) {
			signalOf(exec);
			const current = await workspace.get();
			if (!(typeof args.positioning === "string" || typeof args.targetAudience === "string" || typeof args.tone === "string" || Array.isArray(args.directions) || typeof args.selectionCriteria === "string")) return asJson({
				profile: current,
				configured: Object.keys(current).length > 0
			});
			const next = {
				...current,
				...typeof args.positioning === "string" && args.positioning.trim() !== "" ? { positioning: args.positioning.trim() } : {},
				...typeof args.targetAudience === "string" && args.targetAudience.trim() !== "" ? { targetAudience: args.targetAudience.trim() } : {},
				...typeof args.tone === "string" && args.tone.trim() !== "" ? { tone: args.tone.trim() } : {},
				...Array.isArray(args.directions) ? { directions: args.directions.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean) } : {},
				...typeof args.selectionCriteria === "string" && args.selectionCriteria.trim() !== "" ? { selectionCriteria: args.selectionCriteria.trim() } : {}
			};
			const saved = await workspace.save(next);
			return asJson({
				profile: saved,
				configured: Object.keys(saved).length > 0
			});
		}
	}));
	register(defineTool({
		name: "creator_generate_image",
		description: "用图像 Provider 生成文章配图或小红书图卡（OpenAI 兼容 /images/generations）。必须先配置 image Provider（creator_settings：endpoint/model/credentialEnvs，密钥经环境变量提供）且状态为 configured；未配置时本工具直接报错，不会伪造图片。提示词描述画面内容；结果保存为主题目录下的 xhs/cards/ 或 wechat/images/。",
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "主题 id。"
			},
			prompt: {
				type: "string",
				required: true,
				description: "画面提示词（描述内容、风格、构图）。"
			},
			target: {
				type: "string",
				enum: ["cards", "article"],
				description: "保存位置：cards=xhs/cards/（图卡），article=wechat/images/（配图）。默认 cards。"
			},
			filename: {
				type: "string",
				description: "文件名基名（不含扩展名）。省略用主题 slug。"
			},
			count: {
				type: "integer",
				description: "生成数量（1–4）。默认 1。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const record = value;
				return compactText("Image generated", `${record.saved === void 0 ? 0 : record.saved.length} files`);
			}
		},
		presentCall: (args) => present("Generate image", args),
		async execute(args, exec) {
			signalOf(exec);
			return asJson(await generateTopicImage(repository, {
				id: String(args.id ?? ""),
				prompt: String(args.prompt ?? ""),
				target: args.target === "article" ? "article" : "cards",
				...typeof args.filename === "string" && args.filename !== "" ? { filename: args.filename } : {},
				...typeof args.count === "number" ? { count: args.count } : {}
			}));
		}
	}));
	register(defineTool({
		name: "creator_review_score",
		description: "用 wewrite CLI（公众号写作质量评分，0-100）给主题长文评分（wewrite score --json）。需要本机装有 wewrite CLI（默认找 内容库/_工作台/wewrite-cli，或设置 ORIOS_WEWRITE_CLI 环境变量）；找不到或评分失败时明确报错，不伪造分数。分数只提示可能的语言节奏问题，编辑判断仍以五维审稿为准。",
		parameters: { id: {
			type: "string",
			required: true,
			description: "主题 id。"
		} },
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				return compactText("Review score", `quality=${value.quality_score ?? "n/a"}`);
			}
		},
		presentCall: (args) => present("Review score", args),
		async execute(args, exec) {
			signalOf(exec);
			return asJson(await reviewArticleScore(repository, String(args.id ?? "")));
		}
	}));
	register(defineTool({
		name: "creator_similarity_check",
		description: "用 wewrite CLI 检查多平台版本与长文的相似度（字符 n-gram Jaccard，--json）。一稿多发要求「内容级真改」：平台版本只变表达、不变主张。相似度极高提示需要更多改写。需要本机装有 wewrite CLI（默认找 内容库/_工作台/wewrite-cli，或设置 ORIOS_WEWRITE_CLI）。",
		parameters: {
			id: {
				type: "string",
				required: true,
				description: "主题 id。"
			},
			target: {
				type: "string",
				enum: [
					"xhs",
					"video",
					"both"
				],
				description: "要对比的平台版本：xhs=xhs/post.md，video=video/script.md，both=两个都查。默认 both。"
			}
		},
		output: {
			schema: JSON_VALUE,
			render: (_args, value) => {
				const record = value;
				return compactText("Similarity", `${record.pairs === void 0 ? 0 : record.pairs.length} pairs`);
			}
		},
		presentCall: (args) => present("Similarity check", args),
		async execute(args, exec) {
			signalOf(exec);
			const target = args.target === "xhs" || args.target === "video" ? args.target : "both";
			return asJson(await checkVariantSimilarity(repository, String(args.id ?? ""), target));
		}
	}));
	return () => {
		for (const stop of disposers) stop();
	};
}
//#endregion
//#region src/creatorSkill.ts
const CREATOR_WORKFLOW_SKILL = {
	name: "orios-content-workflow",
	description: "在 OriOS 内容主题文件夹中，按来源、公众号长文、平台变体和发布包四级闸门连续生产公众号、小红书、抖音与视频号内容。",
	source: "runtime",
	invocation: {
		modelInvocable: true,
		userInvocable: true
	},
	content: `# OriOS 内容连续生产

仅当用户明确处理 OriOS 内容主题、主题文件夹或四个平台产物时使用本 Skill。它是文件型 Agent 的工作流契约，不是平台发布授权。

## 开始前

1. 不确定工作台状态时先调用 \`creator_workflow_guide\` 或 \`creator_setup\`，不要先向用户询问工具能查出的信息。
2. 首次部署引导：先调用 \`creator_profile\` 询问并记录账号定位/目标读者/语气/常用选题方向，据此生成简易选题筛选标准（selectionCriteria），长期使用沉淀优化。
3. 用 \`creator_list\` 列出主题，用 \`creator_get\` 查看单个主题的阶段、闸门、产物链与主题目录；完整正文用系统文件工具读取。
4. 主题目录是唯一真源。先读取 \`project.yaml\`、\`brief.md\`、\`claims.yaml\`、\`sources/\` 与已有产物，报告缺失项、来源风险和当前闸门。

## 目录契约

- brief.md：顶部是**选题卡**（目标读者/核心问题/边界/待验证问题/来源），下方自由正文。选题从素材库提取（见《选题管道工作流说明》：素材 → \`_工作台/candidates.yaml\` 候选选题池 → 用户选中 → 转正建主题回填选题卡）。
- claims.yaml + sources/：每个事实主张及其来源；没有来源的事实不能写成确定结论。
- wechat/article.md：公众号长文，是所有平台改写的表达锚点。
- xhs/post.md + xhs/cards/：小红书图文文案与图卡提示/素材。
- video/script.md + video/scenes.json + video/captions.json：抖音和视频号共用的无真人解说视频资产。
- publish/package.json：平台发布包，只能在发布包审批通过后生成或更新。
- approvals.json：四级人工闸门：brief_sources → approved_article → platform_variants → publish_package。

## 阶段路由与工具

- 正文内容（brief/长文/文案/脚本/claims）用系统文件工具写入主题目录；写完后审批状态按内容哈希自动联动失效。
- 工作台工具只做文件做不到的事：
  - \`creator_create\` 按约定建主题文件夹；
  - \`creator_update_artifact\` 与 UI 一致地保存内容字段；
  - \`creator_run_stage\` 运行阶段生成（video 派生 scenes/captions、publish 生成发布包、variants 写图卡待执行清单）；
  - \`creator_approve\` 批准闸门（人工确认后调用）；
  - \`creator_settings\` 配置 Provider；\`creator_list\`/\`creator_get\`/\`creator_workflow_guide\`/\`creator_setup\` 查询；
  - \`creator_candidates\`/\`creator_candidate_add\`/\`creator_candidate_select\`/\`creator_candidate_convert\` 选题库；
  - \`creator_profile\` 账号画像（首次部署引导）；\`creator_generate_image\` 配图/图卡生成（需图像 Provider 已配置）。

## 质量与失败处理

1. 一次只推进当前阶段，完成后停在下一个人工闸门：\`brief_sources\` → \`approved_article\` → \`platform_variants\` → \`publish_package\`。
2. 公众号写作执行标准（融合 WeWrite 方法论）：选题三维评分（热度 30%/相关度 40%/切入价值 30%，命中黑名单直接淘汰）、文章任务书（读者/交付/核心判断/边界/反方）、主张清单（fact 必须有来源，user_experience 只来自用户明确提供的材料）、编辑五维质量标准（准确/观点/有用/合声/好读，平均≥4 单项≥3 无阻断红线，revise 必须改稿复审，最多两轮）、内容增强策略（观点找新角度/痛点补行动/故事只用真实材料/对比给决策条件）。详见技能 references/wewrite-standard.md。
3. 来源不足时阻断当前阶段，列出需要补充的来源，不用常识或模型记忆填空。
4. Provider 不可用时保存提示词、场景、字幕和待执行清单，不伪造 PNG、音频或 MP4 已生成。
5. 不调用私有 DSH Agent API，不自动点击任何平台的最终发布按钮；平台草稿写入必须在用户明确批准后进行。
6. 修改长文后，平台变体和发布包审批必须重新确认；重复使用已有文件前检查其更新时间是否对应当前主张。
7. 输出结束时报告：已读文件、改动文件、未解决风险、下一审批闸门和需要用户点击的动作。`
};
function registerCreatorWorkflowSkill(ctx) {
	return ctx.skills.register(CREATOR_WORKFLOW_SKILL);
}
//#endregion
//#region src/workspace.ts
/**
* 工作台工作区存储：_工作台/ 下的非主题文件（候选选题池、账号画像）。
* 文件即真相；_ 前缀目录不参与主题扫描。
*/
const MAX_TEXT_BYTES = 2097152;
const WORKSPACE_DIR = "_工作台";
function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function textValue(value, fallback = "") {
	return typeof value === "string" ? value.trim() : fallback;
}
function isValidStatus(value) {
	return value === "pending" || value === "selected" || value === "converted";
}
function sourceFrom(value) {
	const record = isRecord(value) ? value : {};
	return {
		kind: textValue(record.kind, "file") || "file",
		ref: textValue(record.ref, "")
	};
}
function candidateFrom(value) {
	if (!isRecord(value)) return null;
	const id = textValue(value.id);
	const title = textValue(value.title);
	if (id === "" || title === "") return null;
	return {
		id,
		title,
		claim: textValue(value.claim),
		source: sourceFrom(value.source),
		tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === "string") : [],
		status: isValidStatus(value.status) ? value.status : "pending",
		...typeof value.convertedTopic === "string" && value.convertedTopic !== "" ? { convertedTopic: value.convertedTopic } : {}
	};
}
function parseCandidates(value) {
	const root = isRecord(value) ? value : {};
	return (Array.isArray(root.items) ? root.items : []).map(candidateFrom).filter((item) => item !== null);
}
function normalizeProfile(value) {
	const record = isRecord(value) ? value : {};
	return {
		...textValue(record.positioning) !== "" ? { positioning: textValue(record.positioning) } : {},
		...textValue(record.targetAudience) !== "" ? { targetAudience: textValue(record.targetAudience) } : {},
		...textValue(record.tone) !== "" ? { tone: textValue(record.tone) } : {},
		...Array.isArray(record.directions) ? { directions: record.directions.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean) } : {},
		...textValue(record.selectionCriteria) !== "" ? { selectionCriteria: textValue(record.selectionCriteria) } : {}
	};
}
function safeResolve(root, candidate) {
	const rootPath = resolve(root);
	const target = resolve(candidate);
	if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) throw new Error("文件路径越过内容根目录");
	return target;
}
async function atomicWriteText(base, relative, value) {
	const targetPath = safeResolve(base, join(base, relative));
	const parent = dirname(targetPath);
	await mkdir(parent, { recursive: true });
	const temporary = join(parent, `.${targetPath.split(sep).pop() ?? "content"}.${process.pid}.${Date.now()}.tmp`);
	await writeFile(temporary, value, {
		encoding: "utf8",
		flag: "wx"
	});
	try {
		await rename(temporary, targetPath);
	} catch (error) {
		await unlink(temporary).catch(() => void 0);
		throw error;
	}
}
async function readOptionalText(path) {
	try {
		const buffer = await readFile(path);
		if (buffer.byteLength > MAX_TEXT_BYTES) throw new Error(`文件过大（上限 ${MAX_TEXT_BYTES} 字节）：${path}`);
		return buffer.toString("utf8");
	} catch (error) {
		if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") return "";
		throw error;
	}
}
function nextCandidateId(items, now) {
	const date = now.replace(/[-:]/g, "").slice(0, 8);
	const count = items.filter((item) => item.id.startsWith(`cand-${date}`)).length + 1;
	return `cand-${date}-${String(count).padStart(3, "0")}`;
}
var FileWorkspaceStore = class {
	root;
	dir;
	constructor(contentRoot) {
		this.root = resolve(contentRoot);
		this.dir = join(this.root, WORKSPACE_DIR);
	}
	candidatesPath() {
		return join(WORKSPACE_DIR, "candidates.yaml");
	}
	profilePath() {
		return join(WORKSPACE_DIR, "creator-profile.yaml");
	}
	async list() {
		const text = await readOptionalText(safeResolve(this.root, join(this.root, this.candidatesPath())));
		if (text === "") return [];
		try {
			return parseCandidates(parse(text));
		} catch {
			return [];
		}
	}
	async writeItems(items) {
		const payload = {
			schemaVersion: 1,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			items: items.map((item) => ({
				...item,
				...item.convertedTopic === void 0 ? {} : { convertedTopic: item.convertedTopic }
			}))
		};
		await atomicWriteText(this.root, this.candidatesPath(), `${stringify(payload)}\n`);
	}
	async add(input) {
		const title = input.title.trim();
		if (title === "") throw new Error("候选选题标题不能为空");
		const claim = input.claim.trim();
		if (claim === "" || input.source.ref.trim() === "") throw new Error("候选选题需要一句话主张与来源引用");
		const items = await this.list();
		const candidate = {
			id: nextCandidateId(items, (/* @__PURE__ */ new Date()).toISOString()),
			title,
			claim,
			source: {
				kind: input.source.kind.trim() || "file",
				ref: input.source.ref.trim()
			},
			tags: input.tags === void 0 ? [] : input.tags.filter((tag) => tag.trim() !== "").map((tag) => tag.trim()),
			status: "pending"
		};
		await this.writeItems([...items, candidate]);
		return candidate;
	}
	async select(ids) {
		const wanted = new Set(ids);
		if (wanted.size === 0) return this.list();
		const next = (await this.list()).map((item) => wanted.has(item.id) ? {
			...item,
			status: "selected"
		} : item);
		await this.writeItems(next);
		return next;
	}
	async convert(id, topicId) {
		const items = await this.list();
		let found = false;
		const next = items.map((item) => {
			if (item.id !== id) return item;
			found = true;
			return {
				...item,
				status: "converted",
				convertedTopic: topicId
			};
		});
		if (!found) throw new Error(`候选选题不存在：${id}`);
		await this.writeItems(next);
		return next;
	}
	async update(items) {
		await this.writeItems(items);
		return items;
	}
	async get() {
		const text = await readOptionalText(safeResolve(this.root, join(this.root, this.profilePath())));
		if (text === "") return {};
		try {
			return normalizeProfile(parse(text));
		} catch {
			return {};
		}
	}
	async save(profile) {
		const normalized = normalizeProfile(profile);
		await atomicWriteText(this.root, this.profilePath(), `${stringify({
			schemaVersion: 1,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			...normalized
		})}\n`);
		return normalized;
	}
};
var MockWorkspaceStore = class {
	candidates = [];
	profile = {};
	async list() {
		return this.candidates.map((item) => ({
			...item,
			tags: [...item.tags]
		}));
	}
	async add(input) {
		const title = input.title.trim();
		if (title === "") throw new Error("候选选题标题不能为空");
		const claim = input.claim.trim();
		if (claim === "" || input.source.ref.trim() === "") throw new Error("候选选题需要一句话主张与来源引用");
		const candidate = {
			id: `cand-mock-${this.candidates.length + 1}`,
			title,
			claim,
			source: {
				kind: input.source.kind.trim() || "file",
				ref: input.source.ref.trim()
			},
			tags: input.tags === void 0 ? [] : [...input.tags],
			status: "pending"
		};
		this.candidates = [...this.candidates, candidate];
		return { ...candidate };
	}
	async select(ids) {
		const wanted = new Set(ids);
		if (wanted.size === 0) return this.list();
		this.candidates = this.candidates.map((item) => wanted.has(item.id) ? {
			...item,
			status: "selected"
		} : item);
		return this.list();
	}
	async convert(id, topicId) {
		let found = false;
		this.candidates = this.candidates.map((item) => {
			if (item.id !== id) return item;
			found = true;
			return {
				...item,
				status: "converted",
				convertedTopic: topicId
			};
		});
		if (!found) throw new Error(`候选选题不存在：${id}`);
		return this.list();
	}
	async update(items) {
		this.candidates = items.map((item) => ({
			...item,
			tags: [...item.tags]
		}));
		return this.list();
	}
	async get() {
		return { ...this.profile };
	}
	async save(profile) {
		this.profile = normalizeProfile(profile);
		return { ...this.profile };
	}
};
function createWorkspaceStore(mode, contentRoot) {
	return mode === "file" ? new FileWorkspaceStore(contentRoot) : new MockWorkspaceStore();
}
//#endregion
//#region src/workbench.ts
/**
* 内容创作工作台 · 项目脚手架（worktable 宿主侧）
* 把插件自带的多窗口 UI 资产（ui/）物化到一个专用项目文件夹，
* worktable 的 widget-result.json 自愈扫挂据此把四个窗口挂进工作台项目。
*/
/** worktable 项目 id（客户端注册到 sidebar.worktable.project 插槽的同一 id） */
const WORKBENCH_PROJECT_ID = "orios-content-workbench";
/** 插件包内 UI 资产目录（构建后 lib/*.mjs → ../ui） */
function uiDir() {
	return join(dirname(fileURLToPath(import.meta.url)), "..", "ui");
}
/** 工作台项目文件夹：config.workbenchFolder 优先，缺省 $DSH_HOME/projects/orios-content-workbench */
function resolveWorkbenchFolder(configured) {
	const explicit = configured?.trim();
	if (explicit) return explicit;
	const home = resolveEnv("DSH_HOME") || join(homedir(), ".dsh");
	return join(home, "projects", "orios-content-workbench");
}
const UI_FILES = [
	"creator-common.js",
	"content-workbench-widget.html",
	"creator-topbar.html",
	"creator-topic-editor.html",
	"creator-preview.html",
	"widget-result.json"
];
/**
* 把工作台 UI 资产物化到项目文件夹（幂等，写缺失不覆盖）：
* - UI 资产只在目标文件缺失时写入（用户可直接编辑文件夹里的窗口文件，不会被插件覆盖）；
*   插件升级想更新 UI 时，先删除对应文件（或把改动同步进 ui/ 后由用户决定）。
* - 内容库模板只在未配置 contentRoot 时创建（_工作台/candidates.yaml 空池）。
* 绝不删除或改动已有内容库文件。
*/
async function scaffoldWorkbench(folder, configuredContentRoot) {
	await mkdir(folder, { recursive: true });
	const source = uiDir();
	for (const file of UI_FILES) {
		const target = join(folder, file);
		try {
			await readFile(target);
			continue;
		} catch {}
		try {
			await copyFile(join(source, file), target);
		} catch {}
	}
	let contentRoot = configuredContentRoot.trim();
	if (!contentRoot) {
		contentRoot = join(folder, "内容创作");
		await mkdir(join(contentRoot, "_工作台"), { recursive: true });
		const candidatesPath = join(contentRoot, "_工作台", "candidates.yaml");
		try {
			await readFile(candidatesPath, "utf8");
		} catch {
			await writeFile(candidatesPath, "# 候选选题池（选题在前，主题在后；status: pending | selected | converted）\ncandidates: []\n", "utf8");
		}
	}
	return {
		folder,
		contentRoot,
		apiBase: "/creator/api",
		ready: true,
		projectId: WORKBENCH_PROJECT_ID
	};
}
//#endregion
//#region src/types.ts
const CREATOR_PACKAGE_NAME = "@orios/dsh-creator";
const SUPPORTED_DSH_VERSION = "0.1.1-rc.2";
//#endregion
//#region src/index.ts
const name = "orios-creator";
const inject = ["systemPrompt", "webServer"];
function createRepository(config) {
	const contentRoot = config.contentRoot?.trim() || process.env.ORIOS_CREATOR_CONTENT_ROOT?.trim() || "";
	const requested = config.mode ?? "auto";
	if (requested === "mock" || requested === "auto" && !contentRoot) return {
		repository: createMockRepository(),
		mode: "mock",
		contentRoot
	};
	return {
		repository: new FileCreatorRepository(contentRoot),
		mode: "file",
		contentRoot
	};
}
function loopback(request) {
	const address = request.socket.remoteAddress;
	if (![
		"127.0.0.1",
		"::1",
		"::ffff:127.0.0.1"
	].includes(address ?? "")) return false;
	const host = request.headers.host;
	if (!host) return false;
	try {
		const hostname = new URL(`http://${host}`).hostname;
		if (![
			"127.0.0.1",
			"localhost",
			"[::1]"
		].includes(hostname)) return false;
		if (request.headers["sec-fetch-site"] === "cross-site") return false;
		const origin = request.headers.origin;
		return !origin || new URL(origin).host === new URL(`http://${host}`).host;
	} catch {
		return false;
	}
}
async function readBody(request) {
	const chunks = [];
	let total = 0;
	for await (const chunk of request) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > 1048576) return null;
		chunks.push(buffer);
	}
	if (chunks.length === 0) return {};
	try {
		const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return value && typeof value === "object" && !Array.isArray(value) ? value : null;
	} catch {
		return null;
	}
}
function send(response, value, status = 200) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(value));
}
function apply(ctx, config = {}) {
	if (config.enabled === false) return;
	const detected = config.hostVersion || process.env.DSH_VERSION || "";
	if (detected && detected !== "0.1.1-rc.2") ctx.logger?.warn?.(`dsh-creator: 宿主 ${detected} 不在支持矩阵，请先确认工作台兼容性`);
	const selected = createRepository(config);
	const repository = selected.repository;
	const workspace = createWorkspaceStore(selected.mode, selected.contentRoot);
	const workbenchFolder = resolveWorkbenchFolder(config.workbenchFolder);
	const workflowFacts = {
		repositoryMode: selected.mode,
		contentRootConfigured: selected.mode === "file",
		contentRoot: selected.contentRoot,
		settingsStorage: selected.mode === "file" ? "file" : "memory"
	};
	const stopTools = ctx.inject?.(["tools"], (toolsCtx) => registerCreatorTools(toolsCtx, repository, workspace)) ?? (() => void 0);
	const stopSkill = ctx.inject?.(["skills"], (skillsCtx) => registerCreatorWorkflowSkill(skillsCtx)) ?? (() => void 0);
	ctx.effect(() => () => {
		stopTools();
		stopSkill();
	}, "dsh-creator: tools & skill");
	const handler = async (request, response) => {
		if (!loopback(request)) return send(response, {
			ok: false,
			error: {
				code: "forbidden",
				message: "仅允许 loopback 请求"
			}
		}, 403);
		const url = new URL(request.url ?? "/", "http://localhost");
		const parts = url.pathname.replace(/^\/creator\/?/, "").split("/").filter(Boolean);
		try {
			if (request.method === "GET" && parts.join("/") === "api/info") {
				const capabilities = await repository.getCapabilities();
				return send(response, {
					ok: true,
					data: {
						package: CREATOR_PACKAGE_NAME,
						dshVersion: SUPPORTED_DSH_VERSION,
						prototype: selected.mode === "mock",
						repositoryMode: selected.mode,
						contentRootConfigured: capabilities.contentRootConfigured,
						settingsStorage: capabilities.settingsStorage ?? (selected.mode === "file" ? "file" : "memory")
					}
				});
			}
			if (request.method === "GET" && parts.join("/") === "api/capabilities") return send(response, {
				ok: true,
				data: await repository.getCapabilities()
			});
			if (request.method === "GET" && parts.join("/") === "api/revision") return send(response, {
				ok: true,
				data: { revision: await repository.getRevision() }
			});
			if (request.method === "GET" && parts.join("/") === "api/candidates") {
				const status = url.searchParams.get("status") ?? "";
				const items = await workspace.list();
				return send(response, {
					ok: true,
					data: { items: [
						"pending",
						"selected",
						"converted"
					].includes(status) ? items.filter((item) => item.status === status) : items }
				});
			}
			if (request.method === "GET" && parts.join("/") === "api/profile") {
				const profile = await workspace.get();
				return send(response, {
					ok: true,
					data: {
						profile,
						configured: Object.keys(profile).length > 0
					}
				});
			}
			if (request.method === "GET" && parts.join("/") === "api/settings") return send(response, {
				ok: true,
				data: await repository.getSettings()
			});
			if (request.method === "GET" && parts.join("/") === "api/workbench") return send(response, {
				ok: true,
				data: await scaffoldWorkbench(workbenchFolder, selected.contentRoot)
			});
			if (request.method === "GET" && parts.join("/") === "api/projects") return send(response, {
				ok: true,
				data: await repository.listProjects(url.searchParams.get("q") ?? "")
			});
			if (request.method === "GET" && parts[0] === "api" && parts[1] === "projects" && parts[2]) return send(response, {
				ok: true,
				data: await repository.getProject(decodeURIComponent(parts[2]))
			});
			if (request.method !== "POST") return send(response, {
				ok: false,
				error: {
					code: "not_found",
					message: "路由不存在"
				}
			}, 404);
			const value = await readBody(request);
			if (value === null) return send(response, {
				ok: false,
				error: {
					code: "bad_request",
					message: "请求体必须是小于 1 MiB 的 JSON 对象"
				}
			}, 400);
			if (parts.join("/") === "api/settings/check") return send(response, {
				ok: true,
				data: await repository.checkSettings()
			});
			if (parts.join("/") === "api/settings") {
				if (!value.settings || typeof value.settings !== "object" || Array.isArray(value.settings)) return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: "settings 必须是对象"
					}
				}, 400);
				return send(response, {
					ok: true,
					data: await repository.saveSettings(value.settings)
				});
			}
			if (parts[0] === "api" && parts[1] === "projects" && parts.length === 2) {
				if (typeof value.title !== "string" || typeof value.slug !== "string" || typeof value.plannedAt !== "string") return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: "新主题需要 title、slug 和 plannedAt"
					}
				}, 400);
				const targets = Array.isArray(value.targets) ? value.targets.filter((target) => typeof target === "string") : void 0;
				return send(response, {
					ok: true,
					data: await repository.createProject({
						title: value.title,
						slug: value.slug,
						plannedAt: value.plannedAt,
						targets
					})
				});
			}
			const id = parts[2] ? decodeURIComponent(parts[2]) : "";
			if (parts[0] === "api" && parts[1] === "projects" && parts[3] === "artifacts") {
				if (![
					"brief",
					"article",
					"xhsCopy",
					"videoScript"
				].every((field) => typeof value[field] === "string")) return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: "产物字段必须是字符串"
					}
				}, 400);
				return send(response, {
					ok: true,
					data: await repository.updateArtifact(id, {
						brief: value.brief,
						article: value.article,
						xhsCopy: value.xhsCopy,
						videoScript: value.videoScript
					})
				});
			}
			if (parts[0] === "api" && parts[1] === "projects" && parts[3] === "approve") return send(response, {
				ok: true,
				data: await repository.approveGate(id, String(value.gate ?? ""))
			});
			if (parts[0] === "api" && parts[1] === "projects" && parts[3] === "stage") return send(response, {
				ok: true,
				data: await repository.runStage(id, String(value.stage ?? "brief"))
			});
			if (parts.join("/") === "api/candidates") {
				if (typeof value.title !== "string" || typeof value.claim !== "string" || typeof value.sourceRef !== "string") return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: "新增候选需要 title、claim 和 sourceRef"
					}
				}, 400);
				return send(response, {
					ok: true,
					data: { item: await workspace.add({
						title: value.title,
						claim: value.claim,
						source: {
							kind: typeof value.sourceKind === "string" && value.sourceKind !== "" ? value.sourceKind : "file",
							ref: value.sourceRef
						},
						tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === "string") : void 0
					}) }
				});
			}
			if (parts.join("/") === "api/candidates/select") {
				const ids = Array.isArray(value.ids) ? value.ids.filter((id) => typeof id === "string") : [];
				return send(response, {
					ok: true,
					data: { items: await workspace.select(ids) }
				});
			}
			if (parts.join("/") === "api/candidates/convert") {
				if (typeof value.id !== "string" || value.id === "") return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: "convert 需要候选 id"
					}
				}, 400);
				const candidate = (await workspace.list()).find((item) => item.id === value.id);
				if (candidate === void 0) return send(response, {
					ok: false,
					error: {
						code: "not_found",
						message: `候选选题不存在：${value.id}`
					}
				}, 404);
				if (candidate.status === "converted") return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: `候选选题已转正：${candidate.convertedTopic ?? candidate.id}`
					}
				}, 400);
				const title = candidate.title;
				const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "new-topic";
				const plannedAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
				const created = await repository.createProject({
					title,
					slug,
					plannedAt
				});
				return send(response, {
					ok: true,
					data: {
						topic: created,
						candidate: (await workspace.convert(candidate.id, created.id)).find((item) => item.id === candidate.id)
					}
				});
			}
			if (parts.join("/") === "api/profile") {
				const patch = {};
				if (typeof value.positioning === "string" && value.positioning.trim() !== "") patch.positioning = value.positioning.trim();
				if (typeof value.targetAudience === "string" && value.targetAudience.trim() !== "") patch.targetAudience = value.targetAudience.trim();
				if (typeof value.tone === "string" && value.tone.trim() !== "") patch.tone = value.tone.trim();
				if (Array.isArray(value.directions)) patch.directions = value.directions.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
				if (typeof value.selectionCriteria === "string" && value.selectionCriteria.trim() !== "") patch.selectionCriteria = value.selectionCriteria.trim();
				const profile = await workspace.save(patch);
				return send(response, {
					ok: true,
					data: {
						profile,
						configured: Object.keys(profile).length > 0
					}
				});
			}
			if (parts.join("/") === "api/review-score") {
				if (typeof value.id !== "string" || value.id === "") return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: "review-score 需要主题 id"
					}
				}, 400);
				return send(response, {
					ok: true,
					data: await reviewArticleScore(repository, value.id)
				});
			}
			if (parts.join("/") === "api/similarity-check") {
				if (typeof value.id !== "string" || value.id === "") return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: "similarity-check 需要主题 id"
					}
				}, 400);
				const target = value.target === "xhs" || value.target === "video" ? value.target : "both";
				return send(response, {
					ok: true,
					data: await checkVariantSimilarity(repository, value.id, target)
				});
			}
			if (parts.join("/") === "api/generate-image") {
				if (typeof value.id !== "string" || value.id === "" || typeof value.prompt !== "string" || value.prompt === "") return send(response, {
					ok: false,
					error: {
						code: "bad_request",
						message: "generate-image 需要主题 id 和 prompt"
					}
				}, 400);
				return send(response, {
					ok: true,
					data: await generateTopicImage(repository, {
						id: value.id,
						prompt: value.prompt,
						...value.target === "article" ? { target: "article" } : {},
						...typeof value.filename === "string" && value.filename !== "" ? { filename: value.filename } : {},
						...typeof value.count === "number" ? { count: value.count } : {}
					})
				});
			}
			return send(response, {
				ok: false,
				error: {
					code: "not_found",
					message: "路由不存在"
				}
			}, 404);
		} catch (error) {
			return send(response, {
				ok: false,
				error: {
					code: "creator_error",
					message: error instanceof Error ? error.message : String(error)
				}
			}, 400);
		}
	};
	const disposeRoutes = ctx.webServer.register({
		kind: "prefix",
		path: "/creator",
		handler
	});
	if (config.announceToAgent !== false) {
		const disposePrompt = ctx.systemPrompt.section({
			name: "plugin:orios-creator",
			order: 155,
			text: () => buildWorkflowPrompt(workflowFacts)
		});
		ctx.effect(() => () => disposePrompt?.(), "dsh-creator: prompt");
	}
	ctx.effect(() => () => disposeRoutes?.(), "dsh-creator: routes");
}
//#endregion
export { CREATOR_WORKFLOW_PROMPT, FileCreatorRepository, FileWorkspaceStore, MockCreatorRepository, MockWorkspaceStore, PROVIDER_DEFINITIONS, SUPPORTED_DSH_VERSION, WORKBENCH_PROJECT_ID, apply, buildHandoffPrompt, buildWorkflowPrompt, createMockRepository, createWorkspaceStore, defaultSettings, detectProviderStatuses, inject, name, normalizeSettings, registerCreatorTools, registerCreatorWorkflowSkill, resolveWorkbenchFolder, scaffoldWorkbench, settingsSnapshot };
