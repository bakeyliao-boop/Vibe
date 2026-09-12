/* Vibe's pre-build flows: one local demonstration, no platform parsing or shared server. */
(() => {
  "use strict";

  function boot() {
    const api = window.VibeMock;
    const root = document.getElementById("pinned-source-orbit");
    if (!api || !root || root.dataset.lifecycleReady) return;
    root.dataset.lifecycleReady = "true";

    const STORAGE_KEY = "vibe.mock.lifecycle.v1";
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const seeds = api.getSeedItems();
    const roleNames = { owner: "你", guest: "朋友预览", member: "小禾 · 演示" };
    const validRoles = new Set(Object.keys(roleNames));
    const blankInvite = () => ({ status: "none", generation: 0, joined: false });
    const freshState = () => ({
      version: 1,
      workspace: "sample",
      role: "owner",
      libraries: { sample: clone(seeds), own: [] },
      invitations: { sample: blankInvite(), own: blankInvite() }
    });
    let state = freshState();
    let storageIssue = "";
    let captureScenario = "normal";
    let captureDraft = null;
    let busy = false;
    let toastTimer = null;
    let returnFocus = null;
    let currentScreen = "";
    let undoRecord = null;

    const node = (tag, className, text) => {
      const result = document.createElement(tag);
      if (className) result.className = className;
      if (text !== undefined && text !== null) result.textContent = text;
      return result;
    };
    const button = (text, className, action) => {
      const result = node("button", className, text);
      result.type = "button";
      if (action) result.addEventListener("click", action);
      return result;
    };
    const note = (text) => node("p", "vibe-note", text);
    const error = (target, text) => {
      target.textContent = text;
      target.className = "vibe-status vibe-error";
      target.dataset.state = "error";
      target.hidden = false;
      requestAnimationFrame(() => {
        if (target.isConnected) target.scrollIntoView({ block: "nearest", behavior: "auto" });
      });
    };
    const statusNode = () => {
      const result = node("p", "vibe-status");
      result.setAttribute("role", "status");
      result.setAttribute("aria-live", "polite");
      result.hidden = true;
      return result;
    };
    const field = (labelText, input) => {
      const label = node("label", "vibe-field");
      label.append(node("span", "vibe-field-label", labelText), input);
      return label;
    };
    const textInput = (value = "", placeholder = "") => {
      const input = node("input");
      input.type = "text";
      input.value = value;
      input.placeholder = placeholder;
      return input;
    };
    const actorId = () => state.role === "member" ? "demo-friend" : "you";
    const actorLabel = () => roleNames[state.role];
    const canAdd = () => state.role === "owner" || state.role === "member";
    const canEdit = (item) => state.role === "owner" ||
      (state.role === "member" && item && item.createdBy === "demo-friend");
    const items = () => state.libraries[state.workspace];
    const itemById = (id) => items().find((item) => item.id === id);
    const options = () => api.getOptions();
    const placeLabel = (item) => item.placeLabel ||
      options().places.find((place) => place.key === item.place)?.label || "未定位";
    const typeLabels = (item) => (item.types || []).map((key) =>
      options().types.find((type) => type.key === key)?.label || "类型未知").join("、");
    const localDate = (date) => `${date.getMonth() + 1}月${date.getDate()}日`;
    const fullDate = (iso) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? "时间未记录" :
        `${date.getFullYear()}年${localDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    };
    const safeUrl = (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url : null;
      } catch (_) { return null; }
    };
    const noteId = (value) => {
      const url = safeUrl(value);
      if (!url || !(url.hostname === "xiaohongshu.com" || url.hostname.endsWith(".xiaohongshu.com"))) return null;
      return url.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i)?.[1].toLowerCase() || null;
    };
    const duplicate = (url) => {
      const parsed = safeUrl(url);
      const id = noteId(url);
      return items().find((item) => (id && noteId(item.url) === id) ||
        (parsed && safeUrl(item.url)?.href === parsed.href));
    };

    function validateState(value) {
      if (!value || value.version !== 1 || !["sample", "own"].includes(value.workspace) ||
        !validRoles.has(value.role) || !value.libraries || !value.invitations) return false;
      return ["sample", "own"].every((key) => {
        const library = value.libraries[key];
        const invitation = value.invitations[key];
        return Array.isArray(library) && new Set(library.map((item) => item?.id)).size === library.length &&
          library.every((item) => item && Number.isSafeInteger(item.id) && item.id > 0 && typeof item.title === "string" &&
            ["short", "author", "date", "sharer"].every((key) => typeof item[key] === "string") &&
            typeof item.place === "string" && Array.isArray(item.types) &&
            item.types.every((type) => typeof type === "string") && typeof item.person === "string" &&
            typeof item.url === "string" && !!safeUrl(item.url) &&
            (item.cover == null || typeof item.cover === "string") &&
            (item.context == null || (typeof item.context === "object" && !Array.isArray(item.context) &&
              Object.values(item.context).every((value) => typeof value === "string"))) &&
            (item.provenance == null || (typeof item.provenance === "object" && !Array.isArray(item.provenance))) &&
            (item.createdBy == null || typeof item.createdBy === "string") &&
            (item.addedAt == null || (typeof item.addedAt === "string" && Number.isFinite(Date.parse(item.addedAt))))) && invitation &&
          ["none", "active", "expired"].includes(invitation.status);
      });
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          storageIssue = "";
          return freshState();
        }
        const candidate = JSON.parse(raw);
        if (!validateState(candidate)) throw new Error("invalid local record");
        storageIssue = "";
        return candidate;
      } catch (_) {
        storageIssue = "本机记录暂时无法读取，原记录没有被覆盖。";
        return null;
      }
    }
    state = loadState() || state;

    // Every data, role and workspace change is written before updating the displayed library.
    function commit(next, renderOptions = {}) {
      if (storageIssue) throw new Error("本机记录尚未恢复。请先在页面下方处理记录，再保存；输入仍然保留。 ");
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (_) {
        throw new Error("这次没有保存成功。本浏览器的存储可能不可用或已满；输入还在，可以重试。 ");
      }
      state = next;
      api.setItems(clone(items()), renderOptions);
      updateChrome();
    }

    const header = root.querySelector(".pso-header");
    const oldIdentity = header.firstElementChild;
    const spaceTrigger = button("", "vibe-space-trigger", () => openSpace());
    while (oldIdentity.firstChild) spaceTrigger.append(oldIdentity.firstChild);
    spaceTrigger.setAttribute("aria-label", "一起留着，打开相册与成员");
    oldIdentity.replaceWith(spaceTrigger);
    spaceTrigger.querySelector(".pso-title").textContent = "一起留着";
    const headerActions = node("div", "vibe-header-actions");
    const addTrigger = button("如何收下", "vibe-add-trigger", () => {
      if (state.role === "guest") openInvitation();
      else openCapture();
    });
    headerActions.append(root.querySelector(".pso-find-trigger"), addTrigger);
    header.append(headerActions);

    const empty = node("section", "vibe-empty");
    empty.setAttribute("aria-label", "空相册");
    const emptyArt = node("div", "vibe-empty-art");
    emptyArt.setAttribute("aria-hidden", "true");
    emptyArt.append(node("span", "vibe-empty-paper", "↗"), node("span", "vibe-empty-paper", "留着"));
    const emptyTitle = node("h2", "", "从一次分享开始");
    const emptyCopy = node("p", "", "在小红书或抖音看到好东西，\n从分享入口送进这本相册。");
    const emptyActions = node("div", "vibe-empty-actions");
    const emptyAdd = button("了解如何分享", "vibe-primary", () => state.role === "guest" ? openInvitation() : openCapture());
    emptyActions.append(emptyAdd, button("先看看示例相册", "vibe-text-button", () => switchWorkspace("sample")));
    empty.append(emptyArt, emptyTitle, emptyCopy, emptyActions);
    root.querySelector(".pso-world").append(empty);

    const dockActions = node("div", "vibe-dock-actions");
    const backTrigger = button("内容背面", "vibe-text-button", () => {
      const item = api.getSelectedItem();
      if (item) openDetails(item.id);
    });
    const troubleTrigger = button("打不开？", "vibe-text-button", () => {
      const item = api.getSelectedItem();
      if (item) openRecovery(item.id);
    });
    dockActions.append(backTrigger, node("span", "", "·"), troubleTrigger);
    root.querySelector(".pso-link-state").replaceWith(dockActions);

    const memoryLine = button("", "vibe-memory-line", () => {
      const selected = api.getSelectedItem();
      if (selected && selected.place !== "unknown" && typeof api.openGroup === "function") {
        api.openGroup("place", selected.place);
      }
    });
    root.querySelector(".pso-strip-label").replaceChildren(memoryLine);

    const demoControls = node("aside", "vibe-demo-controls");
    demoControls.setAttribute("aria-label", "前端体验说明和演示场景");
    const demoText = node("span", "", "仅本机演示 · 未接入平台解析或云同步");
    demoControls.append(demoText, button("体验场景", "vibe-text-button", () => openScenes()));
    root.append(demoControls);

    const dialog = node("dialog", "vibe-sheet");
    dialog.setAttribute("aria-labelledby", "vibe-sheet-title");
    root.append(dialog);
    const toast = node("div", "vibe-toast");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.hidden = true;
    root.append(toast);

    function showToast(message, actionText, action) {
      clearTimeout(toastTimer);
      toast.replaceChildren(node("span", "", message));
      if (actionText && action) toast.append(button(actionText, "vibe-text-button", action));
      toast.hidden = false;
      if (!action) toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
    }

    function setBusy(value) {
      busy = value;
      dialog.setAttribute("aria-busy", String(value));
      dialog.querySelectorAll("button,input,textarea,select").forEach((control) => {
        if (value) {
          control.dataset.wasDisabled = String(control.disabled);
          control.disabled = true;
        } else {
          control.disabled = control.dataset.wasDisabled === "true";
          delete control.dataset.wasDisabled;
        }
      });
    }

    function closeSheet() {
      if (busy) return;
      if (dialog.open) dialog.close();
    }
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog || busy) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSheet();
    });
    dialog.addEventListener("close", () => {
      api.pauseOverlay(false);
      currentScreen = "";
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    });

    function sheet(title, kicker = "一起留着", screen = "") {
      if (!dialog.open) {
        returnFocus = document.activeElement;
        api.pauseOverlay(true);
      }
      currentScreen = screen;
      dialog.replaceChildren();
      const head = node("header", "vibe-sheet-head");
      const heading = node("div", "vibe-sheet-heading");
      const headingTitle = node("h2", "", title);
      headingTitle.id = "vibe-sheet-title";
      heading.append(node("span", "vibe-sheet-kicker", kicker), headingTitle);
      const close = button("×", "vibe-sheet-close", closeSheet);
      close.setAttribute("aria-label", "关闭");
      head.append(heading, close);
      const body = node("div", "vibe-sheet-body");
      const footer = node("footer", "vibe-sheet-footer");
      dialog.append(head, body, footer);
      if (!dialog.open) dialog.showModal();
      body.scrollTop = 0;
      return { body, footer };
    }

    function preview(item) {
      const result = node("div", "vibe-preview");
      const cover = node("div", "vibe-preview-cover");
      if (item.cover) {
        const image = node("img");
        image.src = item.cover;
        image.alt = "";
        image.addEventListener("error", () => { cover.replaceChildren(node("span", "", "封面待补")); }, { once: true });
        cover.append(image);
      } else cover.append(node("span", "", "封面待补"));
      const copy = node("div", "vibe-preview-copy");
      copy.append(node("strong", "", item.title), node("span", "", `${placeLabel(item)} · ${typeLabels(item) || "类型待补"}`));
      const url = safeUrl(item.url);
      if (url) copy.append(node("small", "", url.hostname));
      result.append(cover, copy);
      return result;
    }

    function updateChrome() {
      const identity = state.role === "owner" ? (state.workspace === "sample" ? "OUR INTERNET · 示例相册" : "OUR INTERNET · 你的相册") :
        state.role === "guest" ? "朋友预览 · 只读" : "小禾 · 成员演示";
      spaceTrigger.querySelector(".pso-kicker").textContent = identity;
      addTrigger.textContent = state.role === "guest" ? "加入" : "如何收下";
      addTrigger.setAttribute("aria-label", state.role === "guest" ? "加入这个演示相册" : "如何从原平台收下分享");
      emptyAdd.textContent = state.role === "guest" ? "加入，一起留下第一条" : "了解如何分享";
      emptyTitle.textContent = state.role === "guest" ? "这本相册，等你们一起添" : "从一次分享开始";
      emptyCopy.textContent = state.role === "guest" ? "先看看也没关系。加入后，可以带来自己的分享。" : "在小红书或抖音看到好东西，\n从分享入口送进这本相册。";
      empty.hidden = items().length > 0;
      demoText.textContent = storageIssue || `仅本机演示 · ${state.workspace === "sample" ? "示例相册" : "自己的相册"} · 未接入平台解析或云同步`;
      demoControls.classList.toggle("has-storage-issue", !!storageIssue);
      updateSelection();
    }

    function updateSelection() {
      const selected = api.getSelectedItem();
      dockActions.hidden = !selected;
      if (!selected) {
        memoryLine.textContent = "封面会慢慢浮现 · 也可以点组名";
        memoryLine.disabled = true;
        return;
      }
      const date = selected.addedAt ? localDate(new Date(selected.addedAt)) : selected.date;
      const contributor = selected.sharer && selected.person !== "missing" ? selected.sharer : "分享人未记录";
      const stamp = selected.addedAt ? `${date} · ${contributor}收下` : `${date && date !== "未知" ? date + " · " : ""}${contributor}`;
      const count = selected.place !== "unknown" ? items().filter((item) => item.place === selected.place && item.id !== selected.id).length : 0;
      const related = count > 0 ? ` · ${placeLabel(selected)}还有${count}条 ↗` : "";
      memoryLine.textContent = stamp + related;
      memoryLine.disabled = !count || typeof api.openGroup !== "function";
      memoryLine.setAttribute("aria-label", count ? `${stamp}，查看${placeLabel(selected)}全部${count + 1}条内容` : stamp);
    }

    function switchWorkspace(workspace) {
      try {
        const next = clone(state);
        next.workspace = workspace;
        next.role = "owner";
        commit(next, { resetView: true });
        closeSheet();
        toast.hidden = true;
        undoRecord = null;
        showToast(workspace === "sample" ? "已回到示例相册，你的相册另行保留。" : "这是你自己的相册，示例仍然保留。 ");
      } catch (err) { showToast(err.message); }
    }

    function setRole(role, onSuccess = closeSheet) {
      try {
        const next = clone(state);
        next.role = role;
        commit(next);
        onSuccess();
        return true;
      } catch (err) { showToast(err.message); return false; }
    }

    function sourcePayload(platform) {
      if (platform === "抖音") {
        const url = new URL(location.pathname, location.origin);
        url.searchParams.set("demo", "source-douyin");
        return { platform, title: "一条抖音分享 · 流程演示", url: url.href, fixture: null,
          isFlowDemo: true, demoSourceId: "douyin-incoming-demo-v1",
          text: "这是用于演示原平台分享入口的合成资料，不对应真实抖音作品。" };
      }
      const fixture = seeds.find((item) => item.id === 8) || seeds[0];
      return { platform: "小红书", title: fixture.title, url: fixture.url, fixture,
        isFlowDemo: false, text: `${fixture.title}\n${fixture.url}` };
    }

    function buildCapturedItem(payload, partial) {
      const now = new Date();
      const known = partial ? null : payload.fixture;
      const id = Math.max(Date.now(), ...items().map((item) => item.id + 1));
      const item = {
        id, title: payload.title, short: payload.isFlowDemo ? "抖音分享 · 演示" : payload.title.slice(0, 14),
        author: payload.isFlowDemo ? "流程演示资料" : known?.author || "原作者待补", date: localDate(now), addedAt: now.toISOString(),
        sharer: actorLabel(), person: actorId(), createdBy: actorId(),
        cover: known?.cover || null,
        place: known?.place || "unknown", types: known ? [...known.types] : ["unknown"],
        url: payload.url, platform: payload.platform,
        isFlowDemo: payload.isFlowDemo, demoSourceId: payload.demoSourceId || null,
        context: {
          place: known ? known.context.place : "地点信息待取得",
          type: known ? known.context.type : "内容类型待确认",
          person: `${actorLabel()}于${localDate(now)}从${payload.platform}分享收下（演示）`
        },
        provenance: {
          kind: payload.isFlowDemo ? "source-share-demo" : known ? "fixture" : "shared-payload-partial-demo",
          sourcePlatform: payload.platform,
          titleSource: payload.isFlowDemo ? "分享流程示意，非真实作品资料" : "示例分享载荷，未联网解析",
          originalTitle: payload.title, sharedText: payload.text
        }
      };
      if (known?.placeLabel) item.placeLabel = known.placeLabel;
      return item;
    }

    function openCapture() {
      if (!canAdd()) { openInvitation(); return; }
      const { body, footer } = sheet("看到好东西，直接分享", "如何收下", "share-guide");
      const steps = node("ol", "vibe-share-guide");
      steps.append(node("li", "", "在小红书或抖音打开分享入口"), node("li", "", "通过可用的系统分享入口选择 Vibe"), node("li", "", "收下后，继续在原平台浏览"));
      body.append(steps, note("内容由分享入口传来，不需要来 Vibe 粘贴，也不需要先填标题。接收后会给出保存结果。"));
      body.append(note("当前网页仅演示这条路径。真实 iPhone 分享扩展尚未接入，两平台的具体入口及可提供的资料待真机确认。"));
      receiverDestination(body);
      body.append(note("想试这条路径，可以从手机框下方的“体验场景”进入分享演示。"));
      footer.append(button("知道了", "vibe-primary", closeSheet));
    }

    function receiverDestination(body) {
      const destination = node("div", "vibe-share-destination");
      destination.append(node("span", "", "接收相册 · " + (state.workspace === "sample" ? "示例相册" : "自己的相册")));
      if (state.role === "owner") destination.append(button("更换", "vibe-text-button", () => {
        const { body: targetBody, footer } = sheet("收进哪一本？", "演示接收设置", "share-destination");
        targetBody.append(note("本轮是两套独立的本机演示资料。相册由你明确选择，不会自动切换。"));
        const status = statusNode(); targetBody.append(status);
        ["sample", "own"].forEach((workspace) => footer.append(button(workspace === "sample" ? "示例相册" : "自己的相册", "vibe-secondary", () => {
          try { const next = clone(state); next.workspace = workspace; commit(next, { resetView: true }); openCapture(); }
          catch (err) { error(status, err.message); }
        })));
      }));
      body.append(destination);
    }

    function openSourceDemo(platform, receipt = null) {
      const payload = sourcePayload(platform);
      const { body, footer } = sheet(platform + "里的这一刻", platform + " · 发起端流程示意", "source-app");
      const hero = node("div", "vibe-source-hero");
      if (payload.fixture?.cover) { const image = node("img"); image.src = payload.fixture.cover; image.alt = "已公开示例的封面"; hero.append(image); }
      else hero.append(node("span", "vibe-source-placeholder", "视频分享\n流程示意"));
      hero.append(node("strong", "", payload.title));
      body.append(hero, note(payload.isFlowDemo ? "这是用于说明接收过程的合成资料，不对应真实抖音作品。" : "使用已公开的金华潜水示例，资料预置、未实时读取小红书。"));
      if (receipt) {
        const result = node("div", "vibe-share-receipt");
        result.setAttribute("role", "status");
        result.append(node("strong", "", receipt.duplicate ? "这条已经收过了" : receipt.partial ? "分享已保存，资料待补齐" : "已收进 Vibe"), note("已经回到原来的浏览位置（演示）。"));
        body.prepend(result);
        footer.append(button("在 Vibe 查看", "vibe-secondary", () => { closeSheet(); api.focusItem(receipt.id); }), button("继续浏览" + platform, "vibe-primary", () => openSourceDemo(platform)));
      } else {
        body.append(note("这里展示发起分享的动作，不是原 App 的真实页面或菜单截图。"));
        const existing = payload.demoSourceId ? items().find((item) => item.demoSourceId === payload.demoSourceId) : duplicate(payload.url);
        if (existing) body.append(note("这条已在当前相册，可体验再次分享时的反馈。模拟新增可在“如何收下”里明确更换接收相册。"));
        footer.append(button("结束演示", "vibe-secondary", closeSheet), button("分享（演示）", "vibe-primary", () => openShareTargets(platform)));
      }
    }

    function openShareTargets(platform) {
      const { body, footer } = sheet("分享给…", platform + " · 分享目标示意", "share-targets");
      body.append(note("原平台通过可用的系统分享入口，把这条内容交给你选择的应用。具体入口位置与支持情况待真机确认。"));
      if (captureScenario === "unavailable") {
        body.append(note("当前场景：原平台没有提供可用的系统分享入口（演示）。尚未向 Vibe 交付内容，也没有保存记录。"));
        footer.append(button("继续浏览" + platform, "vibe-primary", () => openSourceDemo(platform)));
        return;
      }
      body.append(node("p", "vibe-note", "接收相册：" + (state.workspace === "sample" ? "示例相册" : "自己的相册")));
      const target = button("", "vibe-share-app-target", () => {
        if (!canAdd()) { openInvitation(); return; }
        captureDraft = { payload: sourcePayload(platform), failConsumed: false };
        receiveIncomingShare();
      });
      target.setAttribute("aria-label", "分享给 Vibe（演示）");
      target.append(node("span", "vibe-share-app-icon", "V"), node("strong", "", "Vibe"), node("span", "", "收进相册"));
      body.append(target);
      footer.append(button("返回" + platform, "vibe-secondary", () => openSourceDemo(platform)));
    }

    async function receiveIncomingShare() {
      if (busy || !captureDraft?.payload) return;
      const draft = captureDraft;
      const payload = draft.payload;
      const partial = captureScenario === "partial";
      const { body, footer } = sheet("Vibe 接到分享了", "来自" + payload.platform + " · 接收端演示", "share-receive");
      body.append(preview(buildCapturedItem(payload, partial)), note("收进：" + (state.workspace === "sample" ? "示例相册" : "自己的相册")));
      body.append(note("不需要粘贴或填标题。以下接收与处理是网页演示，真实分享扩展尚未接入。"));
      const status = statusNode(); body.append(status);
      const retry = button("重试保存", "vibe-primary", receiveIncomingShare);
      retry.hidden = true;
      footer.append(button("返回" + payload.platform, "vibe-secondary", () => openSourceDemo(payload.platform)), retry);
      status.hidden = false;
      status.dataset.state = "loading";
      status.textContent = "正在保留收到的分享……";
      setBusy(true);
      await new Promise((resolve) => setTimeout(resolve, 650));
      try {
        if (!canAdd()) throw new Error("当前相册为只读，分享尚未保存。加入后才能收下。");
        if (storageIssue) throw new Error(storageIssue + " 分享资料仍保留在本次演示中。");
        const existing = payload.demoSourceId ? items().find((item) => item.demoSourceId === payload.demoSourceId) || duplicate(payload.url) : duplicate(payload.url);
        if (existing) {
          setBusy(false); captureDraft = null;
          openSourceDemo(payload.platform, { id: existing.id, duplicate: true });
          return;
        }
        if (captureScenario === "failure" && !draft.failConsumed) {
          draft.failConsumed = true; captureScenario = "normal";
          throw new Error("这次没有保存成功（失败演示）。收到的分享还在，可以直接重试。");
        }
        const added = buildCapturedItem(payload, partial);
        const next = clone(state);
        next.libraries[state.workspace].push(added);
        commit(next, { preferredId: added.id });
        setBusy(false); captureDraft = null;
        openSourceDemo(payload.platform, { id: added.id, partial });
      } catch (err) {
        setBusy(false); retry.hidden = false;
        error(status, err.message);
      }
    }

    function detailLine(list, label, value) {
      list.append(node("dt", "", label), node("dd", "", value || "未记录"));
    }

    function openDetails(id) {
      const item = itemById(id);
      if (!item) { showToast("这条内容已不在当前相册里。 "); return; }
      const { body, footer } = sheet("内容的背面", "看看它从哪里来", "details");
      body.append(preview(item));
      const list = node("dl", "vibe-detail-list");
      detailLine(list, "完整标题", item.title);
      detailLine(list, "原作者", item.author);
      detailLine(list, "带入相册", item.person === "missing" ? "分享人未记录" : item.sharer);
      detailLine(list, "时间", item.addedAt ? fullDate(item.addedAt) : `${item.date || "时间未记录"} · 原样例记录`);
      detailLine(list, "地点", placeLabel(item));
      detailLine(list, "类型", typeLabels(item));
      detailLine(list, "标题来源", item.provenance?.titleSource || "原分享中的作品标题（预置样例）");
      if (item.provenance?.originalTitle && item.provenance.originalTitle !== item.title) detailLine(list, "原始标题", item.provenance.originalTitle);
      body.append(list);
      if (item.provenance?.kind === "fixture") body.append(note("这条使用了预置的示例资料，并非本次联网解析结果。"));
      if (item.isFlowDemo) body.append(note("这是抖音分享接收流程的合成演示记录，没有对应真实作品。标题更正也不会移除它的演示标识。"));
      if (canEdit(item)) {
        footer.append(button("移出相册", "vibe-danger", () => confirmRemove(id)), button("更正信息", "vibe-primary", () => openEdit(id)));
      } else {
        body.append(note(state.role === "guest" ? "朋友预览只能查看。加入后，可以收下并维护自己带来的内容。" : "这条由其他人带来。成员可查看全部内容，只能更正或移除自己带来的内容。"));
        footer.append(button("看完了", "vibe-primary", closeSheet));
      }
    }

    function openEdit(id) {
      const item = itemById(id);
      if (!item || !canEdit(item)) { showToast("当前身份只能查看这条内容。 "); return; }
      const { body, footer } = sheet("让它更好认一点", "更正信息", "edit");
      const title = textInput(item.title);
      title.maxLength = 180;
      const place = textInput(item.place === "unknown" ? "" : placeLabel(item), "还不确定，可以先空着");
      place.maxLength = 60;
      const placeList = node("datalist");
      placeList.id = "vibe-place-options";
      place.setAttribute("list", placeList.id);
      options().places.filter((entry) => entry.key !== "unknown").forEach((entry) => {
        const option = node("option"); option.value = entry.label; placeList.append(option);
      });
      body.append(field("标题", title), field("地点", place), placeList);
      const fieldset = node("fieldset", "vibe-field vibe-type-field");
      fieldset.append(node("legend", "vibe-field-label", "类型（可以选几个）"));
      const chips = node("div", "vibe-chips");
      const typeInputs = [];
      options().types.forEach((entry) => {
        const label = node("label", "vibe-chip");
        const input = node("input");
        input.type = "checkbox";
        input.value = entry.key;
        input.checked = item.types.includes(entry.key);
        input.addEventListener("change", () => {
          if (!input.checked) return;
          typeInputs.forEach((other) => {
            if (other !== input && (input.value === "unknown" || other.value === "unknown")) other.checked = false;
          });
        });
        typeInputs.push(input);
        label.append(input, node("span", "", entry.label));
        chips.append(label);
      });
      fieldset.append(chips);
      body.append(fieldset, note("更正会同步到这本相册的分组、查找和关联线索。原链接与原始出处保留。 "));
      const status = statusNode(); body.append(status);
      footer.append(button("先不改", "vibe-secondary", () => openDetails(id)), button("保存更正", "vibe-primary", () => {
        const current = itemById(id);
        if (!current || !canEdit(current)) { error(status, "当前身份无法更正这条内容，填写的信息仍然保留。 "); return; }
        const updatedTitle = title.value.trim();
        if (!updatedTitle) { error(status, "留一个认得出的标题，再保存。 "); title.focus(); return; }
        const label = place.value.trim().replace(/\s+/g, " ");
        const matched = options().places.find((entry) => entry.label === label);
        const key = !label || label === "未定位" ? "unknown" : matched?.key || `custom:${label.toLocaleLowerCase()}`;
        const types = typeInputs.filter((input) => input.checked).map((input) => input.value);
        if (!types.length) types.push("unknown");
        const changed = clone(current);
        changed.title = updatedTitle;
        changed.short = updatedTitle.slice(0, 14);
        changed.place = key;
        if (key.startsWith("custom:")) changed.placeLabel = label;
        else delete changed.placeLabel;
        changed.types = types;
        changed.context = { ...changed.context };
        if (key !== current.place || label !== placeLabel(current)) changed.context.place = key === "unknown" ? "地点尚未确认" : `${actorLabel()}更正地点为「${label}」`;
        if (types.join(",") !== current.types.join(",")) changed.context.type = `${actorLabel()}更正了内容类型`;
        if (updatedTitle !== current.title) changed.provenance = {
          ...(current.provenance || {}),
          kind: current.provenance?.kind || "edited-sample",
          originalTitle: current.provenance?.originalTitle || current.title,
          titleSource: `${actorLabel()}更正的标题`
        };
        changed.updatedAt = new Date().toISOString();
        try {
          const next = clone(state);
          next.libraries[state.workspace] = next.libraries[state.workspace].map((entry) => entry.id === id ? changed : entry);
          commit(next, { preferredId: id });
          closeSheet();
          api.focusItem(id);
          showToast("已更正，分组和查找也一起更新了。 ");
        } catch (err) { error(status, err.message); }
      }));
    }

    function confirmRemove(id) {
      const item = itemById(id);
      if (!item || !canEdit(item)) { showToast("当前身份不能移除这条内容。 "); return; }
      const { body, footer } = sheet("从这本相册移出？", "还可以撤销", "remove");
      body.append(preview(item), note("这条会从当前本机演示相册及其分类中移出，原平台的作品不会变化。移出后可以点“撤销”。"));
      const status = statusNode(); body.append(status);
      footer.append(button("留着吧", "vibe-secondary", () => openDetails(id)), button("移出相册", "vibe-primary vibe-danger", () => {
        const current = itemById(id);
        if (!current || !canEdit(current)) { error(status, "当前身份不能移除这条内容。 "); return; }
        const index = items().findIndex((entry) => entry.id === id);
        const record = { item: clone(current), index, workspace: state.workspace };
        try {
          const next = clone(state);
          next.libraries[state.workspace] = next.libraries[state.workspace].filter((entry) => entry.id !== id);
          commit(next);
          undoRecord = record;
          closeSheet();
          showToast("已从这本相册移出", "撤销", undoRemove);
        } catch (err) { error(status, err.message); }
      }));
    }

    function undoRemove() {
      const record = undoRecord;
      if (!record) return;
      if (!canEdit(record.item)) { showToast("当前身份不能恢复这条内容，请切回移除时的身份。", "撤销", undoRemove); return; }
      try {
        const next = clone(state);
        if (!next.libraries[record.workspace].some((entry) => entry.id === record.item.id)) {
          next.libraries[record.workspace].splice(Math.min(record.index, next.libraries[record.workspace].length), 0, clone(record.item));
        }
        commit(next, record.workspace === state.workspace ? { preferredId: record.item.id } : {});
        undoRecord = null;
        if (record.workspace === state.workspace) api.focusItem(record.item.id);
        showToast("已放回原来的相册。 ");
      } catch (err) { showToast(err.message, "重试撤销", undoRemove); }
    }

    async function copyText(text, target, label) {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
        target.className = "vibe-status";
        target.dataset.state = "success";
        target.hidden = false;
        target.textContent = `${label}已复制。`;
      } catch (_) {
        target.className = "vibe-status";
        target.hidden = false;
        target.replaceChildren(node("span", "", "浏览器没有允许自动复制。可以选中下面文字，手动复制："));
        const fallback = node("textarea", "vibe-copy-fallback");
        fallback.readOnly = true;
        fallback.rows = 3;
        fallback.value = text;
        fallback.setAttribute("aria-label", `手动复制${label}`);
        target.append(fallback);
        fallback.focus(); fallback.select();
      }
    }

    function openRecovery(id) {
      const item = itemById(id);
      if (!item) return;
      const { body, footer } = sheet("线索还在这里", "原内容暂时打不开时", "recovery");
      body.append(preview(item), note(item.isFlowDemo ? "这条记录只有分享流程示意，没有对应的原平台作品。下面可以重新打开本站演示。" : "跳转可能受登录、网络或平台限制影响，目前没有判定作品已删除。可以再试原链接，也可以复制标题回原平台查找。"));
      const status = statusNode();
      const actions = node("div", "vibe-row");
      actions.append(button(item.isFlowDemo ? "复制演示地址" : "复制原链接", "vibe-secondary", () => copyText(item.url, status, item.isFlowDemo ? "演示地址" : "原链接")), button(item.isFlowDemo ? "复制演示标题" : "复制标题", "vibe-secondary", () => copyText(item.title, status, item.isFlowDemo ? "演示标题" : "标题")));
      body.append(actions, status);
      const link = node("a", "vibe-primary", item.isFlowDemo ? "重新查看分享演示 ↗" : "再试一次原链接 ↗");
      link.href = safeUrl(item.url)?.href || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      footer.append(link);
    }

    function memberRow(name, role, initial) {
      const row = node("div", "vibe-member");
      row.append(node("span", "vibe-member-avatar", initial), node("span", "vibe-member-copy", name), node("span", "vibe-member-role", role));
      return row;
    }

    function openSpace() {
      const invite = state.invitations[state.workspace];
      const { body, footer } = sheet("一起留着", state.workspace === "sample" ? "示例相册" : "自己的相册", "space");
      body.append(node("p", "vibe-space-intro", `${items().length} 条生活里的灵感，想起时再回来看看。`));
      body.append(memberRow("你", "发起人", "你"));
      if (invite.joined) body.append(memberRow("小禾 · 演示", "成员", "禾"));
      body.append(note("发起人可维护全部内容；成员可以查看全部，只维护自己带来的内容。预览的朋友只能查看。"));
      if (state.workspace === "sample") body.append(note("相册里的分享人是原始样例来源；这里的成员身份用于演示，没有连接真实账号。"));
      if (state.role === "owner") {
        body.append(button(state.workspace === "sample" ? (state.libraries.own.length ? `打开自己的相册 · ${state.libraries.own.length}条` : "从空相册开始") : "回到示例相册", "vibe-space-card", () => switchWorkspace(state.workspace === "sample" ? "own" : "sample")));
        footer.append(button("继续看看", "vibe-secondary", closeSheet), button("邀请朋友", "vibe-primary", openInviteOwner));
      } else if (state.role === "guest") {
        body.append(note("当前：朋友预览。还没有加入，不能添加、更正或移除内容。"));
        footer.append(button("回到自己", "vibe-secondary", () => setRole("owner")), button("加入相册", "vibe-primary", openInvitation));
      } else {
        body.append(note("当前：小禾的成员视角（同机演示）。小禾收下的新分享会进入同一个相册。"));
        footer.append(button("回到自己", "vibe-secondary", () => setRole("owner")), button("继续看看", "vibe-primary", closeSheet));
      }
    }

    function generateInvitation(status) {
      if (state.role !== "owner") { error(status, "只有发起人可以生成邀请。 "); return false; }
      try {
        const next = clone(state);
        const invite = next.invitations[state.workspace];
        invite.status = "active";
        invite.generation = (invite.generation || 0) + 1;
        commit(next);
        return true;
      } catch (err) { error(status, err.message); return false; }
    }

    function openInviteOwner() {
      if (state.role !== "owner") { openSpace(); return; }
      const invite = state.invitations[state.workspace];
      const isActive = invite.status === "active";
      const { body, footer } = sheet(isActive ? "留个位置，等朋友来" : "邀请朋友一起留着", "邀请 · 本机演示", "invite-owner");
      body.append(node("p", "vibe-space-intro", "朋友可以先看看这本相册，再决定是否加入。"));
      body.append(note(`预览可看到当前相册全部 ${items().length} 条内容及出处。加入后可收下分享，并维护自己带来的内容。`));
      body.append(note("这一步只在当前浏览器演示邀请双方，没有发送真实邀请，也不会把本机内容同步到另一台设备。"));
      if (invite.status === "expired") body.append(note("上一份演示邀请已失效。重新生成后，可以继续体验加入流程。"));
      const status = statusNode(); body.append(status);
      footer.append(button("回到相册", "vibe-secondary", closeSheet), button(isActive ? "预览朋友收到的邀请" : "生成演示邀请", "vibe-primary", () => {
        if (isActive || generateInvitation(status)) openInvitation();
      }));
    }

    function openInvitation() {
      const invite = state.invitations[state.workspace];
      const valid = invite.status === "active";
      const { body, footer } = sheet(valid ? "一起留着，好吗？" : "这份邀请暂时用不了", "朋友收到的邀请 · 演示", "invitation");
      const invitation = node("div", "vibe-invitation");
      invitation.append(node("span", "vibe-invitation-stamp", valid ? "一起" : "稍后"), node("h3", "", valid ? "发起人邀请你加入「一起留着」" : "邀请尚未生成，或已失效"));
      body.append(invitation);
      const status = statusNode();
      if (valid) {
        body.append(note(`这里已经留着 ${items().length} 条分享。先看看可浏览全部内容；加入后，用“小禾”的演示身份添入自己的分享。`));
        body.append(note("成员只能更正和移除自己带来的内容，发起人可以维护全部内容。这是当前 Mock 的权限演示，尚未接入真实账号。"), status);
        footer.append(button("先看看相册", "vibe-secondary", () => {
          if (state.invitations[state.workspace].status !== "active") { openInvitation(); return; }
          setRole("guest");
        }), button("加入，一起留着", "vibe-primary", () => {
          if (state.invitations[state.workspace].status !== "active") { openInvitation(); return; }
          try {
            const next = clone(state);
            next.role = "member";
            next.invitations[state.workspace].joined = true;
            commit(next);
            closeSheet();
            showToast("已切到小禾的成员视角，可以收下自己的分享了。 ");
          } catch (err) { error(status, err.message); }
        }));
      } else {
        body.append(note("目前不能加入。可以回到邀请方，重新生成演示邀请；没有向任何人发送请求。"), status);
        footer.append(button("先关闭", "vibe-secondary", closeSheet), button("回到邀请方", "vibe-primary", () => setRole("owner", openInviteOwner)));
      }
    }

    function resetSamples() {
      const { body, footer } = sheet("恢复最初的示例？", "只重置示例相册", "reset-sample");
      body.append(note("示例相册会恢复为最初的 13 条。这里后来新增、更正和移除的演示记录会重置；另一本“自己的相册”保持原样。"));
      const status = statusNode(); body.append(status);
      footer.append(button("保留现状", "vibe-secondary", openScenes), button("恢复 13 条示例", "vibe-primary", () => {
        try {
          const next = clone(state);
          next.libraries.sample = clone(seeds);
          next.invitations.sample = blankInvite();
          next.workspace = "sample";
          next.role = "owner";
          commit(next, { resetView: true });
          captureDraft = null;
          undoRecord = null;
          closeSheet();
          showToast("示例已恢复，自己的相册仍然保留。 ");
        } catch (err) { error(status, err.message); }
      }));
    }

    function openStorageRecovery(confirmReset = false) {
      const { body, footer } = sheet(confirmReset ? "重置本机演示记录？" : "先照看一下本机记录", "存储状态", "storage-recovery");
      const status = statusNode();
      if (!confirmReset) {
        body.append(note("保存的记录暂时无法读取，目前只显示原始示例，没有覆盖原记录。可以先重试读取；确认不再需要旧的本机演示记录后，才选择重置。"), status);
        footer.append(button("重置记录…", "vibe-secondary", () => openStorageRecovery(true)), button("重试读取", "vibe-primary", () => {
          const recovered = loadState();
          if (!recovered) { error(status, storageIssue); return; }
          state = recovered;
          api.setItems(clone(items()), { resetView: true });
          updateChrome();
          closeSheet();
          showToast("本机记录已重新读取。 ");
        }));
      } else {
        body.append(note("这会覆盖本浏览器里 Vibe 的两本演示相册和演示身份，无法撤销。重置后回到最初 13 条示例；不会改动原平台内容。"), status);
        footer.append(button("保留记录", "vibe-secondary", () => openStorageRecovery()), button("确认重置本机记录", "vibe-primary vibe-danger", () => {
          try {
            const next = freshState();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            storageIssue = "";
            state = next;
            captureDraft = null;
            undoRecord = null;
            api.setItems(clone(items()), { resetView: true });
            updateChrome();
            closeSheet();
            showToast("本机演示已重置；原来的本机演示记录无法恢复。 ");
          } catch (_) { error(status, "本浏览器仍无法写入，原记录未被覆盖。请稍后重试。 "); }
        }));
      }
    }

    function openScenes() {
      if (storageIssue) { openStorageRecovery(); return; }
      const { body, footer } = sheet("换个时刻，试试看", "前端体验场景", "scenes");
      body.append(note("所有操作只保存在当前浏览器；两本相册分别保留。场景用于体验未接入真实服务的流程。"));
      const workspaceRow = node("div", "vibe-row");
      workspaceRow.append(button(`示例相册 · ${state.libraries.sample.length}条`, "vibe-secondary", () => switchWorkspace("sample")), button(state.libraries.own.length ? `自己的相册 · ${state.libraries.own.length}条` : "从空相册开始", "vibe-secondary", () => switchWorkspace("own")));
      body.append(workspaceRow);
      const sources = node("div", "vibe-row");
      sources.append(button("从小红书分享（演示）", "vibe-secondary", () => openSourceDemo("小红书")), button("从抖音分享（演示）", "vibe-secondary", () => openSourceDemo("抖音")));
      body.append(sources);
      const scenario = node("select");
      [["normal", "正常接收"], ["partial", "收到分享，资料不全"], ["failure", "下一次保存失败"], ["unavailable", "原平台未开放分享入口"]].forEach(([value, label]) => {
        const option = node("option", "", label); option.value = value; scenario.append(option);
      });
      scenario.value = captureScenario;
      scenario.addEventListener("change", () => {
        captureScenario = scenario.value;
        captureDraft = null;
      });
      body.append(field("下一条分享的接收场景", scenario));
      body.append(note("同一条已收过的分享会先提示重复。体验“资料不全”或“保存失败”时，请明确切到尚未收下这条示例的相册。"));
      const roles = node("div", "vibe-row");
      roles.append(button("回到自己", "vibe-secondary", () => setRole("owner")), button("朋友只读预览", "vibe-secondary", () => setRole("guest")));
      body.append(roles);
      const status = statusNode();
      body.append(button("体验邀请失效", "vibe-text-button", () => {
        try {
          const next = clone(state);
          next.invitations[state.workspace].status = "expired";
          commit(next);
          openInvitation();
        } catch (err) { error(status, err.message); }
      }), button("恢复最初 13 条示例…", "vibe-text-button", resetSamples), status);
      footer.append(button("回到相册", "vibe-primary", closeSheet));
    }

    window.addEventListener("vibe:selection", updateSelection);
    window.addEventListener("vibe:data", updateSelection);
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      // A second tab must not silently overwrite a draft or undo the user's edits.
      storageIssue = "另一个标签页更改了本机记录，请先重新读取后再继续保存。";
      updateChrome();
      showToast(storageIssue, "重新读取", () => { if (!busy) openStorageRecovery(); });
    });

    api.setItems(clone(items()), { resetView: true });
    updateChrome();
    if (new URLSearchParams(location.search).get("demo") === "source-douyin") openSourceDemo("抖音");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  window.addEventListener("vibe:ready", boot, { once: true });
})();
