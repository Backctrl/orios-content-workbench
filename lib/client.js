window.__ModuleLoader__.load({
	id: "@orios/dsh-creator",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		function isRecord(value) {
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
			const input = isRecord(value) ? value : {};
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
			const input = isRecord(value) ? value : {};
			const providers = isRecord(input.providers) ? input.providers : {};
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
		//#region src/client/remoteRepository.ts
		var RemoteUnavailable = class extends Error {};
		async function request(path, init) {
			let response;
			try {
				response = await fetch(`/creator/api/${path}`, {
					...init,
					headers: {
						"content-type": "application/json",
						...init?.headers ?? {}
					}
				});
			} catch (error) {
				throw new RemoteUnavailable(error instanceof Error ? error.message : String(error));
			}
			let payload = null;
			try {
				payload = await response.json();
			} catch {
				throw new Error(`内容工作台返回了无效响应（${response.status}）`);
			}
			if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? `内容工作台请求失败（${response.status}）`);
			return payload.data;
		}
		function jsonBody(value) {
			return {
				method: "POST",
				body: JSON.stringify(value)
			};
		}
		var RemoteCreatorRepository = class {
			listProjects(query = "") {
				return request(`projects${query ? `?q=${encodeURIComponent(query)}` : ""}`);
			}
			createProject(draft) {
				return request("projects", jsonBody(draft));
			}
			getProject(id) {
				return request(`projects/${encodeURIComponent(id)}`);
			}
			updateArtifact(id, artifact) {
				return request(`projects/${encodeURIComponent(id)}/artifacts`, jsonBody(artifact));
			}
			approveGate(id, gate) {
				return request(`projects/${encodeURIComponent(id)}/approve`, jsonBody({ gate }));
			}
			runStage(id, stage) {
				return request(`projects/${encodeURIComponent(id)}/stage`, jsonBody({ stage }));
			}
			getRevision() {
				return request("revision").then((data) => data.revision);
			}
			getCapabilities() {
				return request("capabilities");
			}
			getSettings() {
				return request("settings");
			}
			saveSettings(settings) {
				return request("settings", jsonBody({ settings }));
			}
			checkSettings() {
				return request("settings/check", jsonBody({}));
			}
		};
		var ResilientCreatorRepository = class {
			remote = new RemoteCreatorRepository();
			mock = createMockRepository();
			useMock = false;
			async call(remote, fallback) {
				if (this.useMock) return fallback();
				try {
					return await remote();
				} catch (error) {
					if (!(error instanceof RemoteUnavailable)) throw error;
					this.useMock = true;
					return fallback();
				}
			}
			listProjects(query = "") {
				return this.call(() => this.remote.listProjects(query), () => this.mock.listProjects(query));
			}
			createProject(draft) {
				return this.call(() => this.remote.createProject(draft), () => this.mock.createProject(draft));
			}
			getProject(id) {
				return this.call(() => this.remote.getProject(id), () => this.mock.getProject(id));
			}
			updateArtifact(id, artifact) {
				return this.call(() => this.remote.updateArtifact(id, artifact), () => this.mock.updateArtifact(id, artifact));
			}
			approveGate(id, gate) {
				return this.call(() => this.remote.approveGate(id, gate), () => this.mock.approveGate(id, gate));
			}
			runStage(id, stage) {
				return this.call(() => this.remote.runStage(id, stage), () => this.mock.runStage(id, stage));
			}
			getRevision() {
				return this.call(() => this.remote.getRevision(), () => this.mock.getRevision());
			}
			getCapabilities() {
				return this.call(() => this.remote.getCapabilities(), () => this.mock.getCapabilities());
			}
			getSettings() {
				return this.call(() => this.remote.getSettings(), () => this.mock.getSettings());
			}
			saveSettings(settings) {
				return this.call(() => this.remote.saveSettings(settings), () => this.mock.saveSettings(settings));
			}
			checkSettings() {
				return this.call(() => this.remote.checkSettings(), () => this.mock.checkSettings());
			}
		};
		function createBrowserRepository() {
			return new ResilientCreatorRepository();
		}
		//#endregion
		//#region src/client/workspaceClient.ts
		function getProfile() {
			return request("profile");
		}
		function saveProfile(patch) {
			return request("profile", {
				method: "POST",
				body: JSON.stringify(patch)
			});
		}
		//#endregion
		//#region src/client/CreatorSettingsCard.tsx
		function statusLabel(status) {
			if (status === "configured") return "已配置";
			if (status === "disabled") return "已停用";
			if (status === "invalid") return "配置无效";
			return "待配置";
		}
		function cloneSettings(settings) {
			return JSON.parse(JSON.stringify(settings));
		}
		function CreatorSettingsCard({ credentials } = {}) {
			const repository = (0, react.useMemo)(() => createBrowserRepository(), []);
			const [open, setOpen] = (0, react.useState)(false);
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)(null);
			const [credentialViews, setCredentialViews] = (0, react.useState)({});
			const [credentialDrafts, setCredentialDrafts] = (0, react.useState)({});
			const [busy, setBusy] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)("");
			const [profile, setProfile] = (0, react.useState)(null);
			const [profileDraft, setProfileDraft] = (0, react.useState)({});
			const [profileBusy, setProfileBusy] = (0, react.useState)(false);
			const [profileMessage, setProfileMessage] = (0, react.useState)("");
			const credentialRefs = (0, react.useMemo)(() => draft ? [...new Set(Object.values(draft.providers).flatMap((provider) => provider.credentialEnvs))] : [], [draft]);
			const loadProfile = async () => {
				setProfileBusy(true);
				try {
					const result = await getProfile();
					setProfile(result.profile);
					setProfileDraft(result.profile);
				} catch (error) {
					setProfileMessage(error instanceof Error ? error.message : String(error));
				} finally {
					setProfileBusy(false);
				}
			};
			const saveProfileDraft = async () => {
				setProfileBusy(true);
				setProfileMessage("");
				try {
					const result = await saveProfile(profileDraft);
					setProfile(result.profile);
					setProfileDraft(result.profile);
					setProfileMessage("画像已保存；Agent 会据此生成选题筛选标准。");
				} catch (error) {
					setProfileMessage(error instanceof Error ? error.message : String(error));
				} finally {
					setProfileBusy(false);
				}
			};
			const patchProfile = (patch) => {
				setProfileDraft((current) => ({
					...current,
					...patch
				}));
			};
			const load = async (check = false) => {
				setBusy(true);
				try {
					const next = check ? await repository.checkSettings() : await repository.getSettings();
					setSnapshot(next);
					setDraft(cloneSettings(next.settings));
					setMessage(check ? "已重新检测，未调用外部平台接口。" : "");
				} catch (error) {
					setMessage(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy(false);
				}
			};
			(0, react.useEffect)(() => {
				load();
			}, []);
			(0, react.useEffect)(() => {
				loadProfile();
			}, []);
			(0, react.useEffect)(() => {
				if (!open || !credentials || credentialRefs.length === 0) return;
				let cancelled = false;
				credentials.describe({ refs: credentialRefs }).then((response) => {
					if (cancelled) return;
					if (!response.result.ok || response.result.value === void 0) {
						setMessage("无法读取 DSH 凭据状态，请稍后重试。");
						return;
					}
					setCredentialViews(response.result.value.credentials);
				}).catch(() => {
					if (!cancelled) setMessage("无法读取 DSH 凭据状态，请稍后重试。");
				});
				return () => {
					cancelled = true;
				};
			}, [
				open,
				credentials,
				credentialRefs
			]);
			const updateProvider = (id, patch) => {
				setDraft((current) => current ? {
					...current,
					providers: {
						...current.providers,
						[id]: {
							...current.providers[id],
							...patch
						}
					}
				} : current);
			};
			const save = async () => {
				if (!draft) return;
				const pendingCredentials = Object.entries(credentialDrafts).filter(([, value]) => value.trim() !== "");
				if (pendingCredentials.length > 0 && !credentials) {
					setMessage("当前宿主没有提供 DSH 凭据服务，密钥不会写入工作台设置文件。");
					return;
				}
				setBusy(true);
				try {
					const next = await repository.saveSettings(draft);
					for (const [ref, value] of pendingCredentials) if (!(await credentials.set({
						ref,
						value: value.trim()
					})).result.ok) throw new Error(`凭据 ${ref} 保存失败`);
					if (credentials && pendingCredentials.length > 0) {
						const described = await credentials.describe({ refs: credentialRefs });
						if (described.result.ok && described.result.value !== void 0) setCredentialViews(described.result.value.credentials);
					}
					setSnapshot(next);
					setDraft(cloneSettings(next.settings));
					setCredentialDrafts({});
					setMessage("设置已保存。");
				} catch (error) {
					setMessage(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy(false);
				}
			};
			const configuredCount = snapshot?.statuses.filter((item) => item.status === "configured").length ?? 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: `orios-creator-settings-card${open ? " is-open" : ""}`,
				"data-plugin": "orios-creator",
				"data-surface": "settings-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "orios-creator-settings-header",
					"aria-expanded": open,
					onClick: () => setOpen((current) => !current),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "内容工作台" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "内容目录、Provider 与平台接口" })] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "orios-creator-settings-count",
							children: [
								configuredCount,
								"/",
								snapshot?.statuses.length ?? 7
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "orios-creator-settings-chevron",
							children: open ? "⌃" : "⌄"
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "orios-creator-settings-body",
					children: [
						snapshot && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "orios-creator-settings-summary",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["存储：", snapshot.storage === "file" ? "工作台文件" : "当前会话"] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["contentRoot：", snapshot.contentRootConfigured ? "已配置" : "未配置"] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void load(true),
									disabled: busy,
									children: "重新检测"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "orios-creator-settings-note",
							children: "接口配置与密钥入口集中在这里。密钥输入只通过 DSH 凭据服务写入，页面和工作台设置文件都不会回显或保存密钥值。"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "orios-creator-settings-provider",
							"data-surface": "profile",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "账号画像" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "定位 / 目标读者 / 语气 / 选题方向 · 首次部署引导，用于生成简易选题筛选标准" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", {
									className: `is-${profile && Object.keys(profile).length > 0 ? "configured" : "missing"}`,
									children: profile && Object.keys(profile).length > 0 ? "已配置" : "未配置"
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "orios-creator-settings-fields",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["账号定位（做什么内容、给谁看）", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: profileDraft.positioning ?? "",
											placeholder: "例如：AI 工作流科普，面向独立创作者",
											onChange: (event) => patchProfile({ positioning: event.target.value })
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["目标读者", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: profileDraft.targetAudience ?? "",
											placeholder: "例如：希望稳定更新的独立创作者",
											onChange: (event) => patchProfile({ targetAudience: event.target.value })
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["语气/风格", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: profileDraft.tone ?? "",
											placeholder: "例如：务实、口语化、少术语",
											onChange: (event) => patchProfile({ tone: event.target.value })
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["常用选题方向", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: (profileDraft.directions ?? []).join("、"),
											placeholder: "逗号分隔，例如：AI 工具、创作方法论",
											onChange: (event) => patchProfile({ directions: event.target.value.split(/[、,]/).map((item) => item.trim()).filter(Boolean) })
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["选题筛选标准（可选，Agent 据定位生成）", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											rows: 3,
											value: profileDraft.selectionCriteria ?? "",
											placeholder: "留空时 Agent 会依据上方字段生成简易模板",
											onChange: (event) => patchProfile({ selectionCriteria: event.target.value }),
											style: {
												width: "100%",
												boxSizing: "border-box"
											}
										})] })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "orios-creator-settings-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										role: "status",
										children: profileMessage
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										disabled: profileBusy,
										onClick: () => void saveProfileDraft(),
										children: profileBusy ? "保存中…" : "保存画像"
									})]
								})
							]
						}),
						draft && PROVIDER_DEFINITIONS.map((definition) => {
							const config = draft.providers[definition.id];
							const status = snapshot?.statuses.find((item) => item.id === definition.id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
								className: "orios-creator-settings-provider",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: definition.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
										definition.group === "platform" ? "平台接口" : "内容 Provider",
										" · ",
										definition.description
									] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", {
										className: `is-${status?.status ?? "missing"}`,
										children: statusLabel(status?.status ?? "missing")
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "orios-creator-settings-fields",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["启用", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												value: config.enabled ? "enabled" : "disabled",
												onChange: (event) => updateProvider(definition.id, { enabled: event.target.value === "enabled" }),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "enabled",
													children: "启用"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "disabled",
													children: "停用"
												})]
											})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["Endpoint", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: config.endpoint,
												onChange: (event) => updateProvider(definition.id, { endpoint: event.target.value }),
												placeholder: "可留空"
											})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["模型/版本", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: config.model,
												onChange: (event) => updateProvider(definition.id, { model: event.target.value }),
												placeholder: "可留空"
											})] }),
											(definition.defaultCredentialEnvs.length > 0 || config.credentialEnvs.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [definition.credentialHint, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: config.credentialEnvs.join(", "),
												onChange: (event) => updateProvider(definition.id, { credentialEnvs: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }),
												placeholder: "例如 OPENAI_API_KEY"
											})] }),
											(definition.requiresCommand || config.command) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["本地命令", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: config.command,
												onChange: (event) => updateProvider(definition.id, { command: event.target.value }),
												placeholder: "例如 npx remotion"
											})] }),
											definition.group === "platform" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["会话/Profile 路径", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: config.profilePath,
												onChange: (event) => updateProvider(definition.id, { profilePath: event.target.value }),
												placeholder: "可选，本地路径"
											})] })
										]
									}),
									config.credentialEnvs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "orios-creator-settings-fields",
										children: config.credentialEnvs.map((ref) => {
											const view = credentialViews[ref];
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
												"DSH 凭据 · ",
												ref,
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "password",
													autoComplete: "off",
													value: credentialDrafts[ref] ?? "",
													disabled: view?.writable === false || !credentials,
													onChange: (event) => setCredentialDrafts((current) => ({
														...current,
														[ref]: event.target.value
													})),
													placeholder: view?.configured ? "已配置；留空保持不变" : credentials ? "输入后点击保存设置" : "由宿主环境变量提供"
												})
											] }, ref);
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "orios-creator-settings-detail",
										children: [
											status?.detail ?? "尚未检测",
											" · ",
											credentials ? config.credentialEnvs.map((ref) => credentialViews[ref]?.configured ? `${ref} 已配置${credentialViews[ref]?.source ? `（${credentialViews[ref]?.source}）` : ""}` : `${ref} 未配置`).join("；") || "无需凭据" : "当前宿主未提供凭据服务，检测只检查环境变量名",
											" · 不会在检测时调用外部平台"
										]
									})
								]
							}, definition.id);
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "orios-creator-settings-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								role: "status",
								children: message
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => void save(),
								disabled: busy || !draft,
								children: "保存设置"
							})]
						})
					]
				})]
			});
		}
		`
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
		//#endregion
		//#region src/client/styles.ts
		const creatorStyles = `
.orios-creator-settings-card{margin:0 0 10px;padding:0;border:1px solid var(--dsw-alias-border-subtle,rgba(0,0,0,.1));border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-elevated,#202226);list-style:none}.orios-creator-settings-header{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.orios-creator-settings-header>span:first-child{display:grid;flex:1;min-width:0;gap:3px}.orios-creator-settings-header strong{font-size:13px}.orios-creator-settings-header small{color:var(--dsw-alias-fg-muted,#9da3ad);font-size:11px}.orios-creator-settings-count{color:var(--dsw-alias-fg-muted,#9da3ad);font-size:11px}.orios-creator-settings-chevron{font-size:16px;color:var(--dsw-alias-fg-muted,#9da3ad)}.orios-creator-settings-body{padding:0 14px 14px;border-top:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.1))}.orios-creator-settings-summary{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 0;color:var(--dsw-alias-fg-muted,#9da3ad);font-size:11px}.orios-creator-settings-summary span{padding-right:9px;border-right:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.1))}.orios-creator-settings-summary button,.orios-creator-settings-actions button{border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.16));border-radius:7px;padding:6px 9px;background:transparent;color:inherit;cursor:pointer;font-size:11px}.orios-creator-settings-note{margin:0 0 10px;color:var(--dsw-alias-fg-muted,#9da3ad);font-size:10px;line-height:1.5}.orios-creator-settings-provider{margin:7px 0;border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.1));border-radius:8px;background:rgba(255,255,255,.025)}.orios-creator-settings-provider summary{display:flex;align-items:center;gap:8px;padding:9px;cursor:pointer;list-style:none}.orios-creator-settings-provider summary::-webkit-details-marker{display:none}.orios-creator-settings-provider summary>span{display:grid;flex:1;min-width:0;gap:2px}.orios-creator-settings-provider summary strong{font-size:12px}.orios-creator-settings-provider summary small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-fg-muted,#9da3ad);font-size:10px}.orios-creator-settings-provider summary em{font-style:normal;font-size:10px}.orios-creator-settings-provider summary em.is-configured{color:#73d6a3}.orios-creator-settings-provider summary em.is-missing{color:#f0bd75}.orios-creator-settings-provider summary em.is-invalid{color:#ef9da5}.orios-creator-settings-provider summary em.is-disabled{color:var(--dsw-alias-fg-muted,#9da3ad)}.orios-creator-settings-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 9px 9px}.orios-creator-settings-fields label{display:grid;gap:4px;min-width:0;color:var(--dsw-alias-fg-muted,#9da3ad);font-size:10px}.orios-creator-settings-fields input,.orios-creator-settings-fields select{width:100%;min-width:0;padding:7px 8px;border:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.12));border-radius:7px;background:var(--dsw-alias-bg-base,#17181b);color:inherit;outline:none;font:11px/1.3 inherit}.orios-creator-settings-fields input:focus,.orios-creator-settings-fields select:focus{border-color:var(--dsw-alias-accent,#7c8cff)}.orios-creator-settings-detail{margin:0;padding:0 9px 9px;color:var(--dsw-alias-fg-muted,#9da3ad);font-size:10px;overflow-wrap:anywhere}.orios-creator-settings-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px}.orios-creator-settings-actions span{color:#73d6a3;font-size:10px}.orios-creator-settings-actions button{background:var(--dsw-alias-accent,#7c8cff);border-color:transparent;color:#11131a;font-weight:700}
@media (max-width:760px){.orios-creator-settings-fields{grid-template-columns:1fr}}
`;
		//#endregion
		//#region src/client/workbenchProject.tsx
		/**
		* 内容创作工作台 · worktable 项目注册
		* 1) 把项目写进 dsh-worktable 的 projects store（localStorage，幂等合并）：
		*    folders[id] = 项目文件夹（widget-result.json 自愈扫挂据此挂载四窗）；
		*    views[id]   = 顶栏 + 三列 + 右侧对话 布局（点击卡片由工作台引擎打开）。
		* 2) 注册 sidebar.worktable.project 插槽卡片，让项目出现在工作台侧栏。
		* 3) 写入后派发 dsh:worktable.reload 事件，让工作台即时重载 projects store。
		*/
		const WORKBENCH_PROJECT_ID = "orios-content-workbench";
		const PROJECTS_KEY = "dsh.worktable.projects.v1";
		const PROJECT_NAME = "内容创作工作台";
		const PROJECT_ICON = "✍️";
		/** 顶栏 + 三列 + 右侧对话 布局（与 dsh-worktable tb3 预设同构；窗口编号与 widget-result.json 对应） */
		function tb3Spec() {
			return {
				id: WORKBENCH_PROJECT_ID,
				title: PROJECT_NAME,
				left: null,
				top: [{
					id: "p-top",
					title: "顶部栏 · 设置与发布",
					min: 120,
					content: null
				}],
				main: [
					{
						id: "p-overview",
						title: "总览与选题库",
						min: 200,
						content: null
					},
					{
						id: "p-editor",
						title: "内容编辑与修改",
						min: 200,
						content: null
					},
					{
						id: "p-preview",
						title: "配图及视频预览",
						min: 200,
						content: null
					}
				],
				leftWidth: {
					default: 260,
					min: 160,
					max: 480
				},
				chatWidth: {
					default: 360,
					min: 240,
					max: 600
				},
				topHeight: {
					default: 120,
					min: 120,
					max: 320
				},
				topHeightRatio: .2,
				chatSide: "right",
				chatFullHeight: true
			};
		}
		function readProjects() {
			try {
				const raw = localStorage.getItem(PROJECTS_KEY);
				return raw ? JSON.parse(raw) : null;
			} catch {
				return null;
			}
		}
		function writeProjects(next) {
			try {
				localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
			} catch {}
		}
		/** 幂等合并：只补缺，绝不覆盖用户已有条目 */
		function seedWorktableProject(folder) {
			const prev = readProjects() ?? {};
			const order = Array.isArray(prev.order) ? prev.order : [];
			const folders = prev.folders ?? {};
			const views = prev.views ?? {};
			const hidden = Array.isArray(prev.hidden) ? prev.hidden.filter((id) => id !== WORKBENCH_PROJECT_ID) : [];
			const removed = Array.isArray(prev.removed) ? prev.removed.filter((id) => id !== WORKBENCH_PROJECT_ID) : [];
			writeProjects({
				...prev,
				order: order.includes("orios-content-workbench") ? order : [...order, WORKBENCH_PROJECT_ID],
				hidden,
				removed,
				folders: folders["orios-content-workbench"] ? folders : {
					...folders,
					[WORKBENCH_PROJECT_ID]: folder
				},
				views: views["orios-content-workbench"] ? views : {
					...views,
					[WORKBENCH_PROJECT_ID]: tb3Spec()
				}
			});
		}
		/** 通知 worktable 重载 projects store（自愈扫挂随后把四窗挂进项目） */
		function notifyWorktableReload() {
			try {
				window.dispatchEvent(new CustomEvent("dsh:worktable.reload"));
				window.dispatchEvent(new StorageEvent("storage", {
					key: PROJECTS_KEY,
					newValue: localStorage.getItem(PROJECTS_KEY)
				}));
			} catch {}
		}
		/** 拉取宿主脚手架信息并写入 worktable projects store（幂等；宿主路由未就绪时重试） */
		async function syncWorkbenchProject(retries = 3) {
			for (let attempt = 0; attempt <= retries; attempt++) try {
				const body = await (await fetch("/creator/api/workbench", { cache: "no-store" })).json().catch(() => null);
				const info = body?.ok ? body.data : null;
				if (!info || typeof info.folder !== "string" || info.folder === "") return;
				seedWorktableProject(info.folder);
				notifyWorktableReload();
				return;
			} catch {
				if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 1200));
			}
		}
		/** 工作台侧栏项目卡片（结构遵循 worktable 入驻卡片约定：图标 / 名称+描述 / ›） */
		function WorkbenchCard(props) {
			const { openSplit, reportMeta } = props;
			(0, react.useEffect)(() => {
				try {
					reportMeta?.({
						id: WORKBENCH_PROJECT_ID,
						name: PROJECT_NAME,
						icon: PROJECT_ICON
					});
				} catch {}
				syncWorkbenchProject().catch(() => void 0);
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				"data-orios-workbench-card": "true",
				title: PROJECT_NAME,
				onClick: () => {
					syncWorkbenchProject().catch(() => void 0);
					try {
						openSplit?.(tb3Spec());
					} catch {}
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: PROJECT_ICON
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: PROJECT_NAME }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "选题 → 长文 → 变体 → 发布" })] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: "›"
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		let applied = false;
		function installStyles() {
			const style = document.createElement("style");
			style.dataset.oriosCreatorStyles = "";
			style.textContent = creatorStyles;
			document.head.appendChild(style);
			return style;
		}
		function mountNativeSurface(ctx) {
			const context = ctx;
			const slots = context.get?.("slots") ?? context.slots;
			if (!slots?.inject || !slots?.register) return null;
			const safeInject = (name, factory) => {
				try {
					const stop = slots.inject(name, factory);
					return typeof stop === "function" ? stop : () => void 0;
				} catch {
					return null;
				}
			};
			const credentialsOf = () => {
				try {
					return context.get?.("connection")?.api?.credentials;
				} catch {
					return;
				}
			};
			const settingsStop = safeInject("settings.plugin.item", () => slots.register({
				name: "settings.plugin.item",
				key: "orios-creator",
				id: "orios-creator",
				order: 40,
				inject: () => ({ credentials: credentialsOf() })
			}, CreatorSettingsCard));
			const workbenchProjectStop = safeInject("sidebar.worktable.project", () => slots.register({
				name: "sidebar.worktable.project",
				id: WORKBENCH_PROJECT_ID,
				order: 10
			}, WorkbenchCard));
			if (!settingsStop && !workbenchProjectStop) return null;
			return () => {
				settingsStop?.();
				workbenchProjectStop?.();
			};
		}
		const inject = [
			"slots",
			"inputTriggers",
			"workspaces",
			"layout",
			"connection"
		];
		function apply(ctx) {
			if (applied) return;
			applied = true;
			const style = installStyles();
			const slotCleanup = mountNativeSurface(ctx);
			syncWorkbenchProject().catch(() => void 0);
			ctx.effect(() => () => {
				slotCleanup?.();
				style.remove();
				applied = false;
			}, "dsh-creator: client workbench");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map