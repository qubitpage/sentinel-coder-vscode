(function () {
  var vscode = acquireVsCodeApi();

  var $ = function (id) { return document.getElementById(id); };
  var chatContainer = $("chat-container");
  var userInput = $("user-input");
  var sendBtn = $("send-btn");
  var stopBtn = $("stop-btn");
  var continueBar = $("continue-bar");
  var continueBtn = $("continue-btn");
  var typingEl = $("typing");
  var statusDot = $("status-dot");
  var statusText = $("status-text");
  var modeLabel = $("mode-label");
  var modelSelect = $("model-select");
  var settingsPanel = $("settings-panel");
  var toolListEl = $("tool-list");
  var approvalBar = $("approval-bar");
  var autoModelBadge = $("auto-model-badge");
  var attachBtn = $("btn-attach");
  var pastePathBtn = $("btn-paste-path");
  var fileInput = $("file-input");
  var firewallBtn = $("btn-firewall");

  var isGenerating = false;
  var currentAssistantDiv = null;
  var currentThinkingDiv = null;
  var currentContentDiv = null;
  var currentRawText = "";
  var pendingToolCards = [];
  var needNewBlock = false;
  var currentMode = "agent";
  var currentModel = "auto";
  var currentApproval = "default";
  var currentOrchestration = "off";
  var agenticProfiles = [];
  var currentAgenticProfileId = "";
  var firewallEnabled = false;
  var pendingAttachments = [];
  var queuedInputs = [];
  var queuedInputCount = 0;
  var autoContinueCount = 0;
  var suggestedPrompts = [
    { label: "Image studio", prompt: "Use the media studio pipeline: improve this prompt for a premium web/design image, generate it with generateImage, show the in-chat preview card, and critique the result." },
    { label: "Video studio", prompt: "Ask me to choose a scenario, style, duration, and target platform first. Then craft a cinematic Sora 2 prompt, generate the video with generateVideo using azure:sora-2, show the in-chat video player, saved MP4 path, and suggest continuation shots." },
    { label: "Vision/OCR", prompt: "Analyze the latest screenshot or attached image with analyzeImage, read visible text, and diagnose UI/layout/code issues." },
    { label: "Voiceover", prompt: "Generate a short voiceover with generateSpeech and show me the saved MP3 path with a player preview." },
    { label: "Transcribe", prompt: "Transcribe the attached or latest generated audio/video with transcribeAudio and summarize the transcript." },
    { label: "Office doc", prompt: "Create a professional DOCX/XLSX/PPTX draft with createOfficeDocument and show where it was saved." },
    { label: "Inspect file", prompt: "Inspect the selected/attached file with inspectFile and summarize metadata, text, and risks." },
    { label: "Media models", prompt: "Run discoverMediaModels and tell me which image/audio/video capabilities are actually available and tested." },
    { label: "Firewall scan", prompt: "Run firewallScan on the touched files or selected path, then explain findings and fixes." },
    { label: "Web template", prompt: "Create a polished responsive web template: use tested image generation for visual direction, then generate HTML/CSS and preview it." }
  ];
  var maxAutoContinuesPerTask = 50;
  var cachedModels = [];
  var lastSkills = [];
  var editingSkillId = null;
  var dynamicContextSettings = {};

  var chatUserPinnedScroll = false;
  var chatScrollTimer = null;
  var jumpToLatestBtn = null;
  var CHAT_BOTTOM_THRESHOLD_PX = 96;

  function esc(t) {
    var d = document.createElement("div");
    d.textContent = t;
    return d["inner" + "HTML"];
  }

  function attr(t) {
    return esc(t).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function textEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text == null ? "" : String(text);
    return el;
  }

  function setStatusBadge(actions, className, text) {
    if (!actions) return;
    clearNode(actions);
    actions.appendChild(textEl("span", className, text));
  }

  function setTrustedHtml(node, html) {
    if (!node) return;
    clearNode(node);
    var range = document.createRange();
    range.selectNode(document.body || node);
    node.appendChild(range.createContextualFragment(String(html || "")));
  }

  function appendTrustedHtml(parent, html) {
    if (!parent) return;
    var template = document.createElement("template");
    // Centralized for trusted fragments that are built from static markup plus esc()/attr() encoded values.
    template.insertAdjacentHTML("afterbegin", String(html || ""));
    parent.appendChild(template.content.cloneNode(true));
  }

  function replaceTrustedHtml(parent, html) {
    if (!parent) return;
    clearNode(parent);
    appendTrustedHtml(parent, html);
  }

  function appendSingleMediaPreviewNode(parent, item) {
    item = item || {};
    var name = String(item.name || item.path || "attachment");
    var pathText = String(item.path || "");
    var uri = item.webviewUri ? String(item.webviewUri) : "";
    var kind = mediaKindFromName(item.name || item.path, item.mime, item.mediaKind || item.kind);
    var card = document.createElement("div");
    card.className = "media-preview-card media-" + kind;

    var title = document.createElement("div");
    title.className = "media-preview-title";
    title.appendChild(textEl("span", "", kind.toUpperCase()));
    title.appendChild(textEl("strong", "", name));
    card.appendChild(title);

    if (kind === "image" && uri) {
      var img = document.createElement("img");
      img.className = "media-preview-image";
      img.src = uri;
      img.alt = name;
      card.appendChild(img);
    } else if (kind === "video" && uri) {
      var video = document.createElement("video");
      video.className = "media-preview-video";
      video.controls = true;
      video.preload = "metadata";
      video.src = uri;
      card.appendChild(video);
    } else if (kind === "audio" && uri) {
      var audio = document.createElement("audio");
      audio.className = "media-preview-audio";
      audio.controls = true;
      audio.src = uri;
      card.appendChild(audio);
    } else {
      var file = document.createElement("div");
      file.className = "media-preview-file";
      file.appendChild(textEl("span", "media-preview-file-icon", kind === "document" ? "DOC" : "FILE"));
      var meta = document.createElement("div");
      meta.appendChild(textEl("strong", "", name));
      meta.appendChild(document.createElement("br"));
      meta.appendChild(textEl("small", "", pathText));
      file.appendChild(meta);
      card.appendChild(file);
    }

    if (pathText) {
      var pathWrap = document.createElement("div");
      pathWrap.className = "media-preview-path";
      pathWrap.appendChild(textEl("code", "", pathText));
      card.appendChild(pathWrap);
    }
    parent.appendChild(card);
  }

  function appendMediaPreviewNode(parent, media, fallbackContent) {
    var items = Array.isArray(media) ? media : [];
    if (items.length) {
      var grid = document.createElement("div");
      grid.className = "tool-media-grid";
      items.forEach(function (item) { appendSingleMediaPreviewNode(grid, item); });
      parent.appendChild(grid);
      return;
    }
    var preview = toolMediaPreviewHtml(fallbackContent || "");
    if (preview) {
      var wrap = document.createElement("div");
      wrap.className = "tool-media-rendered";
      // toolMediaPreviewHtml escapes all dynamic values before producing media markup.
      replaceTrustedHtml(wrap, preview);
      parent.appendChild(wrap);
    }
  }

  function isChatNearBottom() {
    if (!chatContainer) return true;
    var remaining = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
    return remaining <= CHAT_BOTTOM_THRESHOLD_PX;
  }

  function ensureJumpToLatestButton() {
    if (jumpToLatestBtn || !chatContainer) return jumpToLatestBtn;
    jumpToLatestBtn = document.createElement("button");
    jumpToLatestBtn.id = "jump-latest-btn";
    jumpToLatestBtn.className = "jump-latest-btn";
    jumpToLatestBtn.type = "button";
    jumpToLatestBtn.textContent = "New output - jump to latest";
    jumpToLatestBtn.title = "Jump to the newest Sentinel output";
    jumpToLatestBtn.style.display = "none";
    jumpToLatestBtn.addEventListener("click", function () {
      scrollChatToBottom(true);
      if (userInput) userInput.focus();
    });
    document.body.appendChild(jumpToLatestBtn);
    return jumpToLatestBtn;
  }

  function setJumpToLatestVisible(visible) {
    var btn = ensureJumpToLatestButton();
    if (btn) btn.style.display = visible ? "block" : "none";
  }

  function scrollChatToBottom(force) {
    if (!chatContainer) return;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    chatUserPinnedScroll = false;
    setJumpToLatestVisible(false);
  }

  function followChatOutput() {
    if (!chatContainer) return;
    if (!chatUserPinnedScroll || isChatNearBottom()) {
      scrollChatToBottom(false);
    } else {
      setJumpToLatestVisible(true);
    }
  }

  if (chatContainer) {
    chatContainer.addEventListener("scroll", function () {
      if (chatScrollTimer) clearTimeout(chatScrollTimer);
      chatScrollTimer = setTimeout(function () {
        chatUserPinnedScroll = !isChatNearBottom();
        if (!chatUserPinnedScroll) setJumpToLatestVisible(false);
      }, 80);
    }, { passive: true });
  }

  function renderMd(text) {
    if (!text) return "";
    var html = esc(text);
    // Code blocks with copy + create + run buttons
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      var id = "cb-" + Math.random().toString(36).substr(2, 8);
      var shellLangs = ["bash", "sh", "shell", "powershell", "ps1", "cmd", "bat", "zsh", "terminal"];
      var isShell = shellLangs.indexOf((lang || "").toLowerCase()) !== -1;
      var runBtn = isShell ? '<button class="action-btn run-btn" data-action="open-terminal" data-cmd="' + esc(code.trim()).replace(/"/g, '&quot;') + '">Run</button>' : '';
      return '<div class="code-block-wrapper">' +
        '<div class="code-block-header"><span class="code-lang">' + esc(lang || "text") + '</span>' +
        '<div class="code-actions-inline">' +
        '<button class="action-btn" data-action="copy" data-target="' + id + '">Copy</button>' +
        runBtn +
        '<button class="action-btn primary" data-action="create" data-target="' + id + '" data-lang="' + esc(lang || "text") + '">Create File</button>' +
        '</div></div>' +
        '<pre><code id="' + id + '">' + esc(code.trim()) + '</code></pre></div>';
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Headings (### h3, ## h2, # h1 — line-start only)
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Strikethrough horizontal rule
    html = html.replace(/^---$/gm, "<hr>");
    // Unordered lists (- item)
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, function (match) { return "<ul>" + match + "</ul>"; });
    // Ordered lists (1. item)
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
    // Tables (basic |col|col| format)
    html = html.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/gm, function (_, header, body) {
      var ths = header.split("|").map(function (h) { return "<th>" + h.trim() + "</th>"; }).join("");
      var rows = body.trim().split("\n").map(function (row) {
        var tds = row.replace(/^\||\|$/g, "").split("|").map(function (c) { return "<td>" + c.trim() + "</td>"; }).join("");
        return "<tr>" + tds + "</tr>";
      }).join("");
      return "<table><thead><tr>" + ths + "</tr></thead><tbody>" + rows + "</tbody></table>";
    });
    // Newlines to <br> (but not inside block elements)
    html = html.replace(/\n/g, "<br>");
    // Clean up double <br> after block elements
    html = html.replace(/<\/(h[123]|ul|ol|table|blockquote|hr)><br>/g, "</$1>");
    html = html.replace(/<br><(h[123]|ul|ol|table|blockquote|hr)/g, "<$1");
    return html;
  }

  ensureSuggestionChips();

  // ── Event delegation for chat actions ──
  chatContainer.addEventListener("click", function (e) {
    var promptChip = e.target.closest("[data-suggested-prompt]");
    if (promptChip) {
      var prompt = promptChip.getAttribute("data-suggested-prompt") || "";
      userInput.value = prompt;
      userInput.focus();
      return;
    }
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    var target = btn.getAttribute("data-target");

    switch (action) {
      case "copy": {
        var el = document.getElementById(target);
        if (el) {
          navigator.clipboard.writeText(el.textContent || "");
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = "Copy"; }, 1500);
        }
        break;
      }
      case "create": {
        var codeEl = document.getElementById(target);
        var lang = btn.getAttribute("data-lang") || "text";
        if (codeEl) vscode.postMessage({ type: "createFile", code: codeEl.textContent || "", lang: lang });
        break;
      }
      case "approve": {
        var toolName = btn.getAttribute("data-tool");
        vscode.postMessage({ type: "approveToolCall", toolName: toolName });
        var actions = btn.closest(".approval-actions");
        setStatusBadge(actions, "approved-badge", "✓ Approved");
        break;
      }
      case "deny": {
        var toolName2 = btn.getAttribute("data-tool");
        vscode.postMessage({ type: "rejectToolCall", toolName: toolName2 });
        var actions2 = btn.closest(".approval-actions");
        setStatusBadge(actions2, "denied-badge", "✗ Denied");
        break;
      }
      case "toggle-thinking": {
        var thinkBody = btn.closest(".thinking-section").querySelector(".thinking-body");
        if (thinkBody) {
          var vis = thinkBody.style.display !== "none";
          thinkBody.style.display = vis ? "none" : "block";
          btn.textContent = vis ? "Show thinking" : "Hide thinking";
        }
        break;
      }
      case "open-terminal": {
        var cmd = btn.getAttribute("data-cmd");
        if (cmd) vscode.postMessage({ type: "runInTerminal", command: cmd });
        break;
      }
      case "view-in-studio": {
        var studioPath = btn.getAttribute("data-path") || "";
        if (studioPath) vscode.postMessage({ type: "openStudioFile", path: studioPath });
        break;
      }
      case "toggle-tool": {
        var toolCard = btn.closest(".tool-result-card");
        if (toolCard) {
          var nowCollapsed = toolCard.classList.toggle("collapsed");
          toolCard.classList.toggle("expanded", !nowCollapsed);
          var chev = toolCard.querySelector(".tool-chevron");
          if (chev) chev.textContent = nowCollapsed ? "▶" : "▼";
        }
        break;
      }
      case "revert-all-checkpoints": {
        uiConfirm('Restore all agent file checkpoints?').then(function (ok) {
          if (ok) vscode.postMessage({ type: 'revertChanges' });
        });
        break;
      }
    }
  });


  function renderSuggestionChips() {
    var strip = document.createElement("div");
    strip.className = "suggestion-strip";
    strip.setAttribute("aria-label", "Suggested agent actions");
    (suggestedPrompts || []).forEach(function (item) {
      var btn = document.createElement("button");
      btn.className = "suggestion-chip";
      btn.type = "button";
      btn.dataset.suggestedPrompt = item.prompt || "";
      btn.textContent = item.label || "Suggestion";
      strip.appendChild(btn);
    });
    return strip;
  }

  function ensureSuggestionChips() {
    var existing = document.getElementById('suggestion-strip-root');
    if (existing || !suggestedPrompts || !suggestedPrompts.length) return;
    var wrap = document.createElement('div');
    wrap.id = 'suggestion-strip-root';
    wrap.appendChild(renderSuggestionChips());
    if (chatContainer && chatContainer.firstChild) chatContainer.insertBefore(wrap, chatContainer.firstChild);
    else if (chatContainer) chatContainer.appendChild(wrap);
  }

  // ── Message helpers ──
  function addMessage(role, content) {
    var div = document.createElement("div");
    div.className = "message " + role;
    if (role === "assistant") div["inner" + "HTML"] = renderMd(content);
    else if (role === "system") {
      var note = document.createElement("div");
      note.className = "system-note";
      note.textContent = content;
      div.appendChild(note);
    }
    else div.textContent = content;
    chatContainer.appendChild(div);
    followChatOutput();
    return div;
  }

  function addSystemNote(content) {
    return addMessage("system", content);
  }

  function addSystemNode(node) {
    var div = document.createElement("div");
    div.className = "message system";
    var note = document.createElement("div");
    note.className = "system-note";
    note.appendChild(node);
    div.appendChild(note);
    chatContainer.appendChild(div);
    followChatOutput();
    return div;
  }



  function looksLikeGeneratedMediaPath(text) {
    if (!text) return null;
    var m = String(text).match(/([A-Za-z]:\\[^\r\n"'<>]+\.(?:png|jpg|jpeg|webp|gif|mp3|wav|m4a|ogg|mp4|webm|mov|pdf|docx|pptx|xlsx|csv|txt))/i);
    if (m) return m[1].trim();
    var m2 = String(text).match(/((?:\.sentinel|artifacts|assets|media|outputs)[\\/][^\r\n"'<>]+\.(?:png|jpg|jpeg|webp|gif|mp3|wav|m4a|ogg|mp4|webm|mov|pdf|docx|pptx|xlsx|csv|txt))/i);
    return m2 ? m2[1].trim() : null;
  }

  function toolMediaPreviewHtml(content) {
    var mediaPath = looksLikeGeneratedMediaPath(content || "");
    if (!mediaPath) return "";
    var kind = mediaKindFromName(mediaPath, "", "");
    var safePath = esc(mediaPath);
    // Tool outputs usually contain file-system paths, not webview URIs. Show a rich, honest card and a copyable path.
    return '<div class="media-card generated ' + esc(kind) + '">' +
      '<div class="media-card-title">Generated ' + esc(kind) + '</div>' +
      '<div class="media-card-path">' + safePath + '</div>' +
      '<div class="media-card-actions">' +
      '<button class="action-btn" data-action="copy-generated-path" data-path="' + attr(mediaPath) + '">Copy path</button>' +
      '<button class="action-btn primary" data-action="view-in-studio" data-path="' + attr(mediaPath) + '">View in Studio</button>' +
      '</div>' +
      '<div class="media-card-note">Preview opens automatically when served by the extension; file path is ready for inspection/opening in Studio.</div>' +
      '</div>';
  }

  function renderAttachmentTray() {
    var existing = document.getElementById("attachment-tray");
    if (!existing) return;
    existing.textContent = "";
    if (!pendingAttachments.length) {
      existing.classList.remove("visible");
      return;
    }
    existing.classList.add("visible");
    pendingAttachments.forEach(function (a, i) {
      var chip = document.createElement("span");
      chip.className = "attachment-chip";
      chip.title = a.path || a.name || "";
      var icon = document.createElement("span");
      icon.className = "attachment-chip-icon";
      icon.textContent = a.kind === "image" ? "IMG" : "FILE";
      var name = document.createElement("span");
      name.className = "attachment-chip-name";
      name.textContent = a.name || a.path || "attachment";
      var remove = document.createElement("button");
      remove.className = "attachment-remove";
      remove.dataset.removeAttachment = String(i);
      remove.title = "Remove attachment";
      remove.textContent = "x";
      chip.appendChild(icon);
      chip.appendChild(name);
      chip.appendChild(remove);
      existing.appendChild(chip);
    });
  }

  function mediaKindFromName(name, mime, explicitKind) {
    var m = String(mime || "").toLowerCase();
    var n = String(name || "").toLowerCase();
    if (explicitKind === "image" || m.indexOf("image/") === 0 || /\.(png|jpe?g|gif|webp|svg)$/i.test(n)) return "image";
    if (explicitKind === "video" || m.indexOf("video/") === 0 || /\.(mp4|webm|mov|m4v|avi)$/i.test(n)) return "video";
    if (explicitKind === "audio" || m.indexOf("audio/") === 0 || /\.(mp3|wav|ogg|m4a|flac)$/i.test(n)) return "audio";
    if (explicitKind === "document" || /\.(pdf|docx?|xlsx?|pptx?|csv|txt|md|json)$/i.test(n) || /pdf|word|excel|spreadsheet|powerpoint|presentation|text|csv|json|markdown/i.test(m)) return "document";
    return "file";
  }

  function renderMediaPreviewCard(item) {
    var name = esc(item.name || item.path || "attachment");
    var pathText = esc(item.path || "");
    var uri = item.webviewUri ? String(item.webviewUri) : "";
    var kind = mediaKindFromName(item.name || item.path, item.mime, item.mediaKind || item.kind);
    var body = "";
    if (kind === "image" && uri) {
      body = '<img class="media-preview-image" src="' + esc(uri) + '" alt="' + name + '" />';
    } else if (kind === "video" && uri) {
      body = '<video class="media-preview-video" controls preload="metadata" src="' + esc(uri) + '"></video>';
    } else if (kind === "audio" && uri) {
      body = '<audio class="media-preview-audio" controls src="' + esc(uri) + '"></audio>';
    } else {
      var icon = kind === "document" ? "DOC" : "FILE";
      body = '<div class="media-preview-file"><span class="media-preview-file-icon">' + icon + '</span><div><strong>' + name + '</strong><br><small>' + pathText + '</small></div></div>';
    }
    return '<div class="media-preview-card media-' + esc(kind) + '">' +
      '<div class="media-preview-title"><span>' + esc(kind.toUpperCase()) + '</span><strong>' + name + '</strong></div>' +
      body +
      (pathText ? '<div class="media-preview-path"><code>' + pathText + '</code></div>' : '') +
      '</div>';
  }

  function setSendButtonQueuedState() {
    if (!sendBtn) return;
    sendBtn.textContent = isGenerating ? "Add follow-up" : "Send";
    sendBtn.title = isGenerating ? "Queue/send additional instructions without stopping the current run" : "Send message";
    sendBtn.classList.toggle("queue-active", !!isGenerating);
  }

  function createAssistantMessage() {
    var wrapper = document.createElement("div");
    wrapper.className = "message assistant";
    var thinkDiv = document.createElement("div");
    thinkDiv.className = "thinking-section";
    thinkDiv.style.display = "none";
    var thinkHeader = document.createElement("div");
    thinkHeader.className = "thinking-header";
    var toggle = document.createElement("button");
    toggle.className = "action-btn thinking-toggle";
    toggle.setAttribute("data-action", "toggle-thinking");
    toggle.type = "button";
    toggle.textContent = "Hide thinking";
    thinkHeader.appendChild(toggle);
    thinkHeader.appendChild(textEl("span", "thinking-label", "Thinking..."));
    var thinkBody = document.createElement("div");
    thinkBody.className = "thinking-body";
    thinkDiv.appendChild(thinkHeader);
    thinkDiv.appendChild(thinkBody);
    var contentDiv = document.createElement("div");
    contentDiv.className = "content-section";
    wrapper.appendChild(thinkDiv);
    wrapper.appendChild(contentDiv);
    chatContainer.appendChild(wrapper);
    followChatOutput();
    return { wrapper: wrapper, thinkDiv: thinkDiv, contentDiv: contentDiv };
  }

  // Lazily open a fresh assistant bubble after tools ran, so the model's next
  // Lazily open a fresh assistant bubble after tools ran, so the model's next
  // prose renders BELOW the tool cards (last message), never at the top.
  function ensureBlock() {
    if (!needNewBlock) return;
    needNewBlock = false;
    var m = createAssistantMessage();
    if (m.thinkDiv) m.thinkDiv.style.display = "none";
    currentAssistantDiv = m.wrapper;
    currentThinkingDiv = m.thinkDiv;
    currentContentDiv = m.contentDiv;
  }

  function addToolApprovalCard(toolName, description, args, dangerLevel) {
    var card = document.createElement("div");
    card.className = "tool-approval-card";
    var header = document.createElement("div");
    header.className = "tool-header";
    header.appendChild(textEl("span", "tool-icon", "⚙"));
    header.appendChild(textEl("span", "tool-name", toolName));
    header.appendChild(textEl("span", "danger-badge " + String(dangerLevel || ""), dangerLevel));
    card.appendChild(header);
    card.appendChild(textEl("div", "tool-desc", description));
    var argsWrap = document.createElement("div");
    argsWrap.className = "tool-args";
    argsWrap.appendChild(textEl("pre", "", JSON.stringify(args, null, 2)));
    card.appendChild(argsWrap);
    var actions = document.createElement("div");
    actions.className = "approval-actions";
    var approve = document.createElement("button");
    approve.className = "action-btn primary";
    approve.setAttribute("data-action", "approve");
    approve.setAttribute("data-tool", toolName || "");
    approve.type = "button";
    approve.textContent = "Approve";
    var deny = document.createElement("button");
    deny.className = "action-btn";
    deny.setAttribute("data-action", "deny");
    deny.setAttribute("data-tool", toolName || "");
    deny.type = "button";
    deny.textContent = "Deny";
    actions.appendChild(approve);
    actions.appendChild(deny);
    card.appendChild(actions);
    chatContainer.appendChild(card);
    followChatOutput();
  }

  // Collapsed-by-default tool card. Click the header to expand/collapse the body,
  // Collapsed-by-default tool card. Click the header to expand/collapse the body,
  // so long tool output never floods the chat (GitHub Copilot style).
  function renderToolMedia(media, fallbackContent) {
    var items = Array.isArray(media) ? media : [];
    if (items.length) return '<div class="tool-media-grid">' + items.map(renderMediaPreviewCard).join('') + '</div>';
    return toolMediaPreviewHtml(fallbackContent || "");
  }

  function addToolCard(toolName, status, content, media) {
    var card = document.createElement("div");
    card.className = "tool-result-card " + status + " collapsed";
    var icon = status === "running" ? "●" : (status === "success" ? "✓" : "✗");
    var label = status === "running" ? "Running" : (status === "success" ? "Done" : "Failed");
    var header = document.createElement("div");
    header.className = "tool-result-header";
    header.setAttribute("data-action", "toggle-tool");
    header.appendChild(textEl("span", "tool-chevron", "▶"));
    header.appendChild(textEl("span", "tool-result-icon", icon));
    header.appendChild(textEl("span", "tool-result-name", toolName));
    header.appendChild(textEl("span", "tool-result-status", label));
    var body = document.createElement("div");
    body.className = "tool-result-body";
    appendMediaPreviewNode(body, media, content || "");
    body.appendChild(textEl("pre", "", (content || "").slice(0, 3000)));
    card.appendChild(header);
    card.appendChild(body);
    chatContainer.appendChild(card);
    followChatOutput();
    return card;
  }

  function updateToolCard(card, status, content, media) {
    card.className = "tool-result-card " + status + (card.classList.contains("expanded") ? " expanded" : " collapsed");
    var icon = status === "success" ? "✓" : "✗";
    var iconEl = card.querySelector(".tool-result-icon");
    if (iconEl) iconEl.textContent = icon;
    var statusEl = card.querySelector(".tool-result-status");
    if (statusEl) statusEl.textContent = status === "success" ? "Done" : "Failed";
    var body = card.querySelector(".tool-result-body");
    if (body) {
      clearNode(body);
      appendMediaPreviewNode(body, media, content || "");
      body.appendChild(textEl("pre", "", (content || "").slice(0, 3000)));
    }
    followChatOutput();
  }

  // toolStart: open a collapsed "running" card and queue it for its result.
  // toolStart: open a collapsed "running" card and queue it for its result.
  function addToolStart(toolName) {
    var card = addToolCard(toolName, "running", "");
    pendingToolCards.push(card);
  }

  // toolResult: fill the oldest pending card, or create a fresh one.
  function addToolResult(toolName, status, content, media) {
    var card = pendingToolCards.shift();
    if (card) updateToolCard(card, status, content, media);
    else addToolCard(toolName, status, content, media);
  }

  function addSubAgentCard(task, model, result) {
    var card = document.createElement("div");
    card.className = "sub-agent-card";
    card["inner" + "HTML"] =
      '<div class="sa-header">&#x1f916; Sub-Agent: ' + esc(model) + '</div>' +
      '<div class="sa-task">' + esc(task.slice(0, 200)) + '</div>' +
      (result ? '<div class="sa-result">' + esc(result.slice(0, 3000)) + '</div>' : '<div class="sa-task" style="color:var(--warning-fg)">Working...</div>');
    chatContainer.appendChild(card);
    followChatOutput();
    return card;
  }

  function setGenerating(s) {
    isGenerating = s;
    typingEl.className = "typing-indicator" + (s ? " active" : "");
    sendBtn.className = "send-btn";
    stopBtn.className = s ? "stop-btn active" : "stop-btn";
    if (s && continueBar) continueBar.style.display = "none";
    setSendButtonQueuedState();
  }

  function showContinue(show) {
    if (continueBar) continueBar.style.display = show ? "flex" : "none";
  }

  function sendContinue(auto) {
    if (isGenerating) return;
    showContinue(false);
    addMessage("user", auto ? "continue (auto)" : "continue");
    vscode.postMessage({ type: "sendMessage", message: "continue", firewallEnabled: false });
  }

  function handleContinueAvailable() {
    // default: manual approvals + manual Continue
    // bypass: auto-approve non-dangerous tools, but still let the user press Continue
    // autopilot: auto-approve all tools and auto-continue through step ceilings
    if (currentApproval === "autopilot" && autoContinueCount < maxAutoContinuesPerTask) {
      autoContinueCount += 1;
      showContinue(false);
      setTimeout(function () { sendContinue(true); }, 350);
      return;
    }
    showContinue(true);
  }

  // ── Send/Stop ──
  function sendMessage() {
    var t = userInput.value.trim();
    var attachmentLines = pendingAttachments.map(function (a) {
      return "- " + (a.kind === "image" ? "Screenshot/image" : "Attachment") + ": " + (a.path || a.name || "pending");
    });
    if (attachmentLines.length) {
      t += (t ? "\n\n" : "") + "Attached files for this request:\n" + attachmentLines.join("\n");
    }
    if (!t) return;
    var sendPayload = t;
    if (firewallEnabled) {
      sendPayload = "[Firewall scan requested: before finalizing risky code, publishing, deploying, or committing, run firewallScan on the touched paths and fix/report findings.]\n\n" + sendPayload;
    }
    if (isGenerating) {
      queuedInputs.push(sendPayload);
      queuedInputCount += 1;
      addSystemNote("Follow-up input queued for the active run (#" + queuedInputCount + "). It will be sent safely without interrupting the current agent task.");
      vscode.postMessage({ type: "sendMessage", message: "[Additional user input while current task is running]\n" + sendPayload, firewallEnabled: !!firewallEnabled, additionalInput: true });
    } else {
      autoContinueCount = 0;
      showContinue(false);
      addMessage("user", t);
      vscode.postMessage({ type: "sendMessage", message: sendPayload, firewallEnabled: !!firewallEnabled });
    }
    pendingAttachments = [];
    renderAttachmentTray();
    userInput.value = "";
    userInput.style.height = "auto";
    setSendButtonQueuedState();
  }

  sendBtn.addEventListener("click", sendMessage);
  document.addEventListener("click", function (e) {
    var mediaCard = e.target && e.target.closest ? e.target.closest("[data-media-prompt]") : null;
    if (mediaCard) {
      userInput.value = mediaCard.getAttribute("data-media-prompt") || "";
      userInput.focus();
      setSendButtonQueuedState();
      return;
    }
    var removeBtn = e.target && e.target.closest ? e.target.closest("[data-remove-attachment]") : null;
    if (!removeBtn) return;
    var idx = Number(removeBtn.getAttribute("data-remove-attachment"));
    if (!Number.isNaN(idx)) {
      pendingAttachments.splice(idx, 1);
      renderAttachmentTray();
    }
  });
  if (continueBtn) continueBtn.addEventListener("click", function () {
    sendContinue(false);
  });
  stopBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "stopGeneration" });
    setGenerating(false);
  });
  userInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  userInput.addEventListener("input", function () {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + "px";
  });

  function appendPromptReference(label, value) {
    var prefix = userInput.value.trim() ? "\n" : "";
    userInput.value += prefix + label + ": `" + value + "`";
    userInput.dispatchEvent(new Event("input"));
    userInput.focus();
  }

  if (firewallBtn) firewallBtn.addEventListener("click", function () {
    firewallEnabled = !firewallEnabled;
    firewallBtn.textContent = firewallEnabled ? "Firewall: On" : "Firewall";
    firewallBtn.classList.toggle("active", firewallEnabled);
    firewallBtn.setAttribute("aria-pressed", firewallEnabled ? "true" : "false");
    addSystemNote("Firewall scan " + (firewallEnabled ? "enabled" : "disabled") + ".");
  });

  function appendStatusList(parent, items, renderItem) {
    var ul = document.createElement("ul");
    ul.className = "status-list";
    (items || []).forEach(function (item) {
      var li = document.createElement("li");
      renderItem(li, item);
      ul.appendChild(li);
    });
    parent.appendChild(ul);
    return ul;
  }

  function showCheckpointStatus(data) {
    var files = data.files || [];
    var card = document.createElement("div");
    card.className = "status-card";
    var title = document.createElement("div");
    title.className = "status-card-title";
    title.textContent = "Restore Checkpoints";
    card.appendChild(title);
    var meta = document.createElement("div");
    meta.className = "status-card-meta";
    meta.textContent = (data.total || 0) + " tracked file(s)" + (data.truncated ? " (showing first 80)" : "");
    card.appendChild(meta);
    if (!files.length) {
      var empty = document.createElement("div");
      empty.className = "status-card-empty";
      empty.textContent = "No file checkpoints currently tracked.";
      card.appendChild(empty);
    } else {
      appendStatusList(card, files, function (li, f) {
        var strong = document.createElement("strong");
        strong.textContent = f.action || "changed";
        var code = document.createElement("code");
        code.textContent = f.path || f.absolutePath || "";
        li.appendChild(strong);
        li.appendChild(document.createTextNode(" "));
        li.appendChild(code);
      });
    }
    var actions = document.createElement("div");
    actions.className = "status-card-actions";
    var btn = document.createElement("button");
    btn.className = "action-btn danger";
    btn.dataset.action = "revert-all-checkpoints";
    btn.textContent = "Restore these checkpoints";
    actions.appendChild(btn);
    card.appendChild(actions);
    addSystemNode(card);
  }

  function showTaskSummary(data) {
    var issues = data.issues || [];
    var messages = data.messages || [];
    var card = document.createElement("div");
    card.className = "status-card";
    var title = document.createElement("div");
    title.className = "status-card-title";
    title.textContent = "Previous Tasks / Issues";
    card.appendChild(title);
    var meta = document.createElement("div");
    meta.className = "status-card-meta";
    meta.textContent = messages.length + " recent message(s), " + issues.length + " issue-like item(s), " + (data.queued || 0) + " queued input(s), " + (data.checkpoints || 0) + " checkpoint(s)";
    card.appendChild(meta);
    if (issues.length) {
      var subtitle = document.createElement("div");
      subtitle.className = "status-subtitle";
      subtitle.textContent = "Potential issues";
      card.appendChild(subtitle);
      appendStatusList(card, issues, function (li, m) {
        var strong = document.createElement("strong");
        strong.textContent = m.role || "item";
        li.appendChild(strong);
        li.appendChild(document.createTextNode(": " + (m.preview || "")));
      });
    }
    var details = document.createElement("details");
    details.className = "status-details";
    var summary = document.createElement("summary");
    summary.textContent = "Recent task context";
    details.appendChild(summary);
    appendStatusList(details, messages, function (li, m) {
      var strong = document.createElement("strong");
      strong.textContent = m.role || "message";
      li.appendChild(strong);
      li.appendChild(document.createTextNode(": " + (m.preview || "")));
    });
    card.appendChild(details);
    addSystemNode(card);
  }

  ['btn-media-help','btn-open-studio','btn-screenshot','btn-ocr','btn-checkpoints','btn-issues','btn-revert-checkpoints'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('click', function () {
      if (id === 'btn-media-help') vscode.postMessage({ type: 'showMediaHelp' });
        if (id === 'btn-open-studio') vscode.postMessage({ type: 'openStudio' });
      if (id === 'btn-screenshot') {
        userInput.value = 'Capture a screenshot of the current screen, inspect it for UI/layout issues, OCR visible text if possible, and summarize findings. Use captureScreenshot and ocrImage.';
        sendMessage();
      }
      if (id === 'btn-ocr') {
        userInput.value = 'OCR/inspect the latest screenshot or attached image and identify UI text, layout problems, errors, or code visible in it. Use ocrImage and inspectFile.';
        sendMessage();
      }
      if (id === 'btn-checkpoints') vscode.postMessage({ type: 'getCheckpointStatus' });
      if (id === 'btn-issues') vscode.postMessage({ type: 'getTaskSummary' });
      if (id === 'btn-revert-checkpoints') {
        uiConfirm('Restore all agent file checkpoints? This reverts files captured by the current conversation.').then(function (ok) {
          if (ok) vscode.postMessage({ type: 'revertChanges' });
        });
      }
    });
  });


  function extractLocalPathsFromText(text) {
    if (!text) return [];
    var normalized = String(text).replace(/\r/g, "\n");
    var out = [];
    var seen = Object.create(null);
    function add(v) {
      if (!v) return;
      var x = String(v).trim().replace(/^file:\/\//i, "");
      try { x = decodeURIComponent(x); } catch (_) {}
      x = x.replace(/^\/+([A-Za-z]:[\\/])/, "$1").replace(/["'<>]+$/g, "");
      if (!/^[A-Za-z]:[\\/]/.test(x) && !/^\\\\[^\\]+\\[^\\]+/.test(x)) return;
      if (!seen[x]) { seen[x] = true; out.push(x); }
    }
    normalized.replace(/"([A-Za-z]:[^"]+)"/g, function (_, m) { add(m); return _; });
    normalized.replace(/'([A-Za-z]:[^']+)'/g, function (_, m) { add(m); return _; });
    normalized.replace(/\b([A-Za-z]:[\\/][^\n\r]+?)(?=\s{2,}|\n|$)/g, function (_, m) { add(m); return _; });
    normalized.replace(/(file:\/\/\/[A-Za-z]:[^\s\n\r]+)/gi, function (_, m) { add(m); return _; });
    return out;
  }

  function appendLocalPathsToInput(paths, sourceLabel) {
    if (!paths || !paths.length) return false;
    var block = paths.map(function (p) { return "[Local file path] " + p; }).join("\n");
    userInput.value = userInput.value ? (userInput.value + "\n" + block) : block;
    userInput.focus();
    addSystemNote("Path attached from " + (sourceLabel || "clipboard") + ": " + esc(paths[0]) + (paths.length > 1 ? " +" + (paths.length - 1) + " more" : ""));
    return true;
  }

  function saveAttachmentFile(file, label) {
    if (!file) return;
    var kind = file.type && file.type.indexOf("image/") === 0 ? "image" : "file";
    var localName = file.name || "attachment";
    statusText.textContent = "Saving attachment: " + localName;
    if (file.path) {
      pendingAttachments.push({ name: localName, path: file.path, kind: kind });
      renderAttachmentTray();
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      vscode.postMessage({
        type: "saveAttachment",
        name: file.name || "attachment",
        mime: file.type || "application/octet-stream",
        kind: label,
        dataUrl: String(reader.result || "")
      });
    };
    reader.onerror = function () { appendPromptReference(label, file.name || "attachment"); };
    reader.readAsDataURL(file);
  }

  if (attachBtn && fileInput) attachBtn.addEventListener("click", function () { fileInput.click(); });
  if (fileInput) fileInput.addEventListener("change", function () {
    Array.prototype.slice.call(fileInput.files || []).forEach(function (f) {
      saveAttachmentFile(f, f.type && f.type.indexOf("image/") === 0 ? "Screenshot/image" : "Attached file");
    });
    fileInput.value = "";
  });
  function isShellErrorLikeLine(line) {
    var trimmed = String(line || "").trim();
    if (!trimmed) return false;
    // Keep compiler/terminal errors visible as plain chat text instead of hiding them
    // as attachment chips. Examples:
    // /usr/bin/systemctl: /usr/bin/systemctl: cannot execute binary file
    // src/app.ts:12:3 error TS2322: ...
    // C:\path\file.txt: error message
    return /^(?:[A-Za-z]:\\|\\\\|\/|\.\/|\.\.\/)[^\r\n]{1,260}:\s+.+/.test(trimmed) ||
      /:\d+(?::\d+)?:\s*(error|warning|fatal|note|cannot|permission|invalid|not found|no such file)/i.test(trimmed) ||
      /:\s*(cannot execute binary file|permission denied|command not found|invalid option|not found|no such file|is a directory|syntax error)/i.test(trimmed);
  }

  function looksLikeLocalPath(value) {
    var v = String(value || "").trim();
    if (!v || isShellErrorLikeLine(v)) return false;
    if (/^file:\/\//i.test(v)) return true;
    if (/^(?:[a-zA-Z]:\\|\\\\)/.test(v)) return true;
    // Unix absolute paths are common in logs/errors; only auto-attach if the entire
    // line is a standalone path, not a colon-delimited error/message.
    if (/^\/[\w.\-\/ ]+$/.test(v) && v.indexOf(":") === -1) return true;
    return false;
  }

  function normalizeLocalPath(value) {
    var v = String(value || "").trim();
    if (/^file:\/\//i.test(v)) {
      v = v.replace(/^file:\/\//i, "");
      try { v = decodeURIComponent(v); } catch (_) { }
      v = v.replace(/^\/+([A-Za-z]:\/)/, "$1").replace(/\//g, "\\");
    }
    return v.replace(/[.,;)]$/, "");
  }

  function extractLocalPaths(text) {
    var src = String(text || "");
    var matches = [];
    var quoted = /["']([^"'\r\n]+)["']/g;
    var m;
    while ((m = quoted.exec(src))) {
      var quotedPath = normalizeLocalPath(m[1]);
      if (looksLikeLocalPath(quotedPath)) matches.push(quotedPath);
    }
    src.split(/\r?\n/).forEach(function (line) {
      var trimmed = normalizeLocalPath(line.trim());
      if (looksLikeLocalPath(trimmed)) matches.push(trimmed);
    });
    return Array.from(new Set(matches)).slice(0, 12);
  }

  function attachPathReference(pathText, label) {
    var clean = String(pathText || "").trim();
    if (!clean) return false;
    pendingAttachments.push({ name: clean.split(/[\\/]/).pop() || clean, path: clean, kind: /\.(png|jpe?g|gif|webp|svg)$/i.test(clean) ? "image" : "file" });
    renderAttachmentTray();
    addSystemNote((label || "Path attached") + ": <code>" + esc(clean) + "</code>");
    return true;
  }

  if (pastePathBtn) pastePathBtn.addEventListener("click", function () {
    navigator.clipboard.readText().then(function (txt) {
      var paths = extractLocalPaths(txt);
      if (paths.length) paths.forEach(function (p) { attachPathReference(p, "Clipboard path attached"); });
      else if (txt) appendPromptReference("Path/reference", txt.trim());
    });
  });
  userInput.addEventListener("paste", function (e) {
    var text = e.clipboardData && e.clipboardData.getData && e.clipboardData.getData("text/plain");
    var paths = extractLocalPaths(text);
    if (paths.length) {
      paths.forEach(function (p) { attachPathReference(p, "Pasted path attached"); });
      // Preserve pasted text in the input. Users often paste logs/errors containing
      // file paths and must be able to see/edit exactly what was pasted.
    }
    var files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) {
      Array.prototype.slice.call(files).forEach(function (f) {
        saveAttachmentFile(f, f.type && f.type.indexOf("image/") === 0 ? "Pasted screenshot/image" : "Pasted file");
      });
    }
  });
  document.body.addEventListener("dragover", function (e) { e.preventDefault(); });
  document.body.addEventListener("drop", function (e) {
    e.preventDefault();
    var text = e.dataTransfer && e.dataTransfer.getData && e.dataTransfer.getData("text/plain");
    var paths = extractLocalPaths(text);
    if (paths.length) {
      paths.forEach(function (p) { attachPathReference(p, "Dropped path attached"); });
      return;
    }
    Array.prototype.slice.call(e.dataTransfer && e.dataTransfer.files || []).forEach(function (f) {
      if (f.path) attachPathReference(f.path, "Dropped file path attached");
      else saveAttachmentFile(f, f.type && f.type.indexOf("image/") === 0 ? "Dropped screenshot/image" : "Dropped file");
    });
  });

  // Model selector
  modelSelect.addEventListener("change", function () {
    currentModel = modelSelect.value;
    vscode.postMessage({ type: "setModel", model: currentModel });
    autoModelBadge.style.display = currentModel === "auto" ? "" : "none";
  });

  // ── Top bar buttons ──
  $("btn-refresh").addEventListener("click", function () { vscode.postMessage({ type: "refreshModels" }); });
  $("btn-new-chat").addEventListener("click", function () {
    clearNode(chatContainer);
    vscode.postMessage({ type: "newSession" });
  });
  var sessionsPanel = $("sessions-panel");
  $("btn-history").addEventListener("click", function () {
    if (sessionsPanel) sessionsPanel.classList.add("active");
    vscode.postMessage({ type: "getSessions" });
  });
  if ($("btn-close-sessions")) $("btn-close-sessions").addEventListener("click", function () {
    if (sessionsPanel) sessionsPanel.classList.remove("active");
  });
  if ($("btn-session-new")) $("btn-session-new").addEventListener("click", function () {
    clearNode(chatContainer);
    vscode.postMessage({ type: "newSession" });
    if (sessionsPanel) sessionsPanel.classList.remove("active");
  });
  var sessionListEl = $("session-list");
  if (sessionListEl) sessionListEl.addEventListener("click", function (e) {
    var target = e.target;
    while (target && target !== sessionListEl && !target.getAttribute("data-action")) {
      target = target.parentElement;
    }
    if (!target || target === sessionListEl) return;
    var action = target.getAttribute("data-action");
    var id = target.getAttribute("data-id");
    if (!id) return;
    if (action === "switch-session") {
      clearNode(chatContainer);
      vscode.postMessage({ type: "switchSession", id: id });
      if (sessionsPanel) sessionsPanel.classList.remove("active");
    } else if (action === "delete-session") {
      e.stopPropagation();
      // VS Code webviews block window.confirm/prompt, so use a custom modal.
      uiConfirm("Delete this chat? This cannot be undone.", function () {
        vscode.postMessage({ type: "deleteSession", id: id });
      });
    } else if (action === "rename-session") {
      e.stopPropagation();
      var current = "";
      var titleEl = target.closest ? target.closest(".session-item") : null;
      if (titleEl) {
        var t = titleEl.querySelector(".session-title");
        if (t) current = t.textContent || "";
      }
      uiPrompt("Rename chat:", current, function (title) {
        if (title && title.trim()) {
          vscode.postMessage({ type: "renameSession", id: id, title: title.trim() });
        }
      });
    }
  });
  $("btn-settings").addEventListener("click", function () {
    settingsPanel.classList.add("active");
    vscode.postMessage({ type: "getToolConfig" });
    vscode.postMessage({ type: "getProviders" });
    vscode.postMessage({ type: "getSkills" });
    vscode.postMessage({ type: "getSettings" });
    vscode.postMessage({ type: "getAgenticProfiles" });
    vscode.postMessage({ type: "getDynamicContextSettings" });
    initSettingsTabs();
  });
  $("btn-close-settings").addEventListener("click", function () { settingsPanel.classList.remove("active"); });

  // ── MCP server controls (delegated) ──
  var mcpListEl = $("mcp-server-list");
  if (mcpListEl) mcpListEl.addEventListener("click", function (e) {
    var t = e.target;
    var action = t.getAttribute && t.getAttribute("data-mcp-action");
    if (!action) return;
    var server = t.getAttribute("data-server");
    if (action === "connect") {
      vscode.postMessage({ type: "startMcpServer", serverName: server });
      t.textContent = "Connecting…"; t.disabled = true;
    } else if (action === "stop") {
      vscode.postMessage({ type: "stopMcpServer", serverName: server });
    } else if (action === "save-env") {
      var key = t.getAttribute("data-key");
      var inp = $("mcp-env-" + server + "-" + key);
      var val = inp ? inp.value.trim() : "";
      if (!val) {
        var mr0 = $("mcp-result");
        if (mr0) {
          mr0.textContent = "";
          var err = document.createElement("span");
          err.className = "mcp-err";
          err.textContent = "ERROR Enter a value first";
          mr0.appendChild(err);
        }
        return;
      }
      vscode.postMessage({ type: "setMcpEnv", serverName: server, key: key, value: val });
    }
  });
  if ($("btn-mcp-import")) $("btn-mcp-import").addEventListener("click", function () {
    vscode.postMessage({ type: "importMcpFromVSCode" });
  });
  if ($("btn-mcp-refresh")) $("btn-mcp-refresh").addEventListener("click", function () {
    vscode.postMessage({ type: "getMcpStatus" });
  });

  // ── Mode tabs ──
  document.querySelectorAll(".mode-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".mode-tab").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      currentMode = tab.getAttribute("data-mode");
      modeLabel.textContent = tab.textContent;
      vscode.postMessage({ type: "setMode", mode: currentMode });
      approvalBar.style.display = currentMode === "agent" ? "flex" : "none";
    });
  });

  // ── Approval buttons ──
  document.querySelectorAll(".approval-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".approval-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      currentApproval = btn.getAttribute("data-approval");
      vscode.postMessage({ type: "setApprovalMode", mode: currentApproval });
    });
  });

  // ── Boss Orchestrator toggle ──
  var bossToggle = document.getElementById("boss-toggle");
  if (bossToggle) {
    bossToggle.addEventListener("click", function () {
      currentOrchestration = currentOrchestration === "boss" ? "off" : "boss";
      bossToggle.classList.toggle("active", currentOrchestration === "boss");
      vscode.postMessage({ type: "setOrchestration", value: currentOrchestration });
    });
  }

  // ── Settings tab switching ──
  var settingsInited = false;
  function initSettingsTabs() {
    if (settingsInited) return;
    settingsInited = true;

    document.querySelectorAll(".settings-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".settings-tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        var target = tab.getAttribute("data-stab");
        document.querySelectorAll(".settings-pane").forEach(function (p) { p.style.display = "none"; });
        var pane = $("settings-" + target);
        if (pane) pane.style.display = "block";
        if (target === "models") renderModelList();
        if (target === "providers") vscode.postMessage({ type: "getProviders" });
        if (target === "mcp") vscode.postMessage({ type: "getMcpStatus" });
        if (target === "skills") vscode.postMessage({ type: "getSkills" });
        if (target === "agentic") {
          vscode.postMessage({ type: "refreshModels" });
          vscode.postMessage({ type: "getAgenticProfiles" });
        }
        if (target === "context") vscode.postMessage({ type: "getDynamicContextSettings" });
        if (target === "general") vscode.postMessage({ type: "getSettings" });
      });
    });

    // Settings content delegation
    var settingsContent = $("settings-content");
    if (settingsContent) {
      settingsContent.addEventListener("click", function (e) {
        if (e.target.id === "btn-save-general") {
          var temp = parseFloat($("set-temp").value) / 100;
          var tokens = parseInt($("set-tokens").value);
          if (isNaN(tokens) || tokens < 0) tokens = 0;
          var url = $("set-url").value;
          var ctxEl = $("set-ctxbudget");
          var ctxBudget = ctxEl ? parseInt(ctxEl.value) : undefined;
          vscode.postMessage({ type: "saveSettings", temperature: temp, maxTokens: tokens, ollamaUrl: url, contextBudgetTokens: ctxBudget });
          e.target.textContent = "Saved!";
          setTimeout(function () { e.target.textContent = "Save"; }, 1500);
        }
        if (e.target.id === "btn-agentic-new") { showAgenticEditor(); }
        if (e.target.id === "btn-agentic-refresh") { vscode.postMessage({ type: "getAgenticProfiles" }); }
        if (e.target.id === "btn-agentic-cancel") { hideAgenticEditor(); }
        if (e.target.id === "btn-agentic-save") { saveAgenticProfileFromForm(); }
        if (e.target.getAttribute("data-agentic-action") === "edit") { var ep = findAgenticProfile(e.target.getAttribute("data-profile")); if (ep) showAgenticEditor(ep); }
        if (e.target.getAttribute("data-agentic-action") === "select") { vscode.postMessage({ type: "selectAgenticProfile", id: e.target.getAttribute("data-profile") }); }
        if (e.target.getAttribute("data-agentic-action") === "delete") { var dp = e.target.getAttribute("data-profile"); uiConfirm("Delete agentic profile?", function (ok) { if (ok) vscode.postMessage({ type: "deleteAgenticProfile", id: dp }); }); }
        if (e.target.id === "btn-add-model") {
          uiPrompt("Enter model name to pull (e.g. qwen3:8b):", "qwen3:8b", function (name) {
            if (name) vscode.postMessage({ type: "pullModel", model: name.trim() });
          });
        }
        if (e.target.id === "btn-refresh-models2") {
          vscode.postMessage({ type: "refreshModels" });
          setTimeout(renderModelList, 500);
        }
        if (e.target.getAttribute("data-action") === "delete-model") {
          var model = e.target.getAttribute("data-model");
          uiConfirm("Delete model " + model + "?", function (ok) {
            if (ok) vscode.postMessage({ type: "deleteModel", model: model });
          });
        }
        if (e.target.getAttribute("data-action") === "set-active") {
          var m = e.target.getAttribute("data-model");
          modelSelect.value = m;
          modelSelect.dispatchEvent(new Event("change"));
          renderModelList();
        }
        if (e.target.getAttribute("data-action") === "save-provider-key") {
          var pid = e.target.getAttribute("data-provider");
          var input = $("provider-key-" + pid);
          var val = input ? input.value.trim() : "";
          if (!val) {
            var sEl = $("prov-stat-" + pid);
            if (sEl) sEl["inner" + "HTML"] = '<span class="prov-status none">Enter a key first</span>';
            return;
          }
          vscode.postMessage({ type: "setProviderKey", providerId: pid, apiKey: val });
          e.target.textContent = "Saving…";
          var statEl = $("prov-stat-" + pid);
          if (statEl) statEl["inner" + "HTML"] = '<span class="prov-status testing">● Verifying key…</span>';
          setTimeout(function () { e.target.textContent = "Save"; }, 1500);
        }
        if (e.target.getAttribute("data-action") === "test-provider") {
          var tpid = e.target.getAttribute("data-provider");
          vscode.postMessage({ type: "testProvider", providerId: tpid });
          e.target.textContent = "Testing…";
          var tStat = $("prov-stat-" + tpid);
          if (tStat) tStat["inner" + "HTML"] = '<span class="prov-status testing">● Testing…</span>';
          var btn = e.target;
          setTimeout(function () { btn.textContent = "Test"; }, 1500);
        }
        if (e.target.getAttribute("data-action") === "toggle-provider") {
          var pid2 = e.target.getAttribute("data-provider");
          var enabled = e.target.getAttribute("data-enabled") === "true";
          vscode.postMessage({ type: "setProviderEnabled", providerId: pid2, enabled: !enabled });
        }
        if (e.target.getAttribute("data-action") === "provider-balance") {
          var bpid = e.target.getAttribute("data-provider");
          vscode.postMessage({ type: "getProviderBalance", providerId: bpid });
          var bSlot = $("prov-bal-" + bpid);
          if (bSlot) { bSlot.style.display = "block"; bSlot.textContent = "Querying balance…"; }
        }

        // ── Skills ──
        if (e.target.id === "btn-skill-new") {
          openSkillEditor(null);
        }
        if (e.target.id === "btn-skill-import") {
          vscode.postMessage({ type: "importSkills" });
          var ibtn = e.target;
          ibtn.textContent = "Importing…";
          setTimeout(function () { ibtn.textContent = "Import from workspace"; }, 1500);
        }
        if (e.target.id === "btn-skill-refresh") {
          vscode.postMessage({ type: "getSkills" });
        }
        if (e.target.id === "btn-skill-cancel") {
          closeSkillEditor();
        }
        if (e.target.id === "btn-skill-save") {
          var sName = $("skill-name").value.trim();
          var sDesc = $("skill-desc").value.trim();
          var sBody = $("skill-body").value.trim();
          if (!sName || !sBody) { return; }
          var payload = { type: "saveSkill", name: sName, description: sDesc, body: sBody };
          if (editingSkillId) payload.id = editingSkillId;
          vscode.postMessage(payload);
          closeSkillEditor();
        }
        var skAction = e.target.getAttribute && e.target.getAttribute("data-skill-action");
        if (skAction) {
          var sid = e.target.getAttribute("data-skill-id");
          if (skAction === "toggle") {
            var on = e.target.getAttribute("data-enabled") === "true";
            vscode.postMessage({ type: "toggleSkill", id: sid, enabled: !on });
          } else if (skAction === "edit") {
            var sk = (lastSkills || []).filter(function (x) { return x.id === sid; })[0];
            if (sk) openSkillEditor(sk);
          } else if (skAction === "delete") {
            uiConfirm("Delete this skill?", function (ok) {
              if (ok) vscode.postMessage({ type: "deleteSkill", id: sid });
            });
          }
        }
      });
    }

    var settingsContentChange = $("settings-content");
    if (settingsContentChange) {
      settingsContentChange.addEventListener("change", function (e) {
        if (e.target && (e.target.id === "agentic-workers" || e.target.id === "agentic-reviewers" || e.target.id === "agentic-default-worker")) {
          refreshAgenticDefaultWorkerFromSelection();
        }
      });
    }
    var tempSlider = $("set-temp");
    if (tempSlider) {
      tempSlider.addEventListener("input", function () {
        $("set-temp-val").textContent = (tempSlider.value / 100).toFixed(2);
      });
    }
  }

  function fmtCtx(n) {
    if (!n) return "";
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M";
    return Math.round(n / 1000) + "K";
  }

  function pricingLabel(pricing, provider) {
    if (pricing === "free") return "FREE";
    if (pricing === "free-tier") return "FREE TIER";
    if (pricing === "local") return "LOCAL";
    if (pricing === "subscription") {
      if (provider === "azure") return "AZURE CREDITS";
      return "SUBSCRIPTION";
    }
    if (pricing === "pay-per-use") return "PAID";
    return (pricing || "?").toString().toUpperCase();
  }

  function modalityBadges(m) {
    var badges = [];
    var name = ((m.displayName || '') + ' ' + (m.id || '')).toLowerCase();
    var provider = (m.provider || '').toLowerCase();
    var canCode = /coder|code|qwen|deepseek|gpt-5|gpt-4|claude|gemini|grok|kimi/.test(name);
    var canReason = /reason|thinking|o1|o3|gpt-5|grok|claude|gemini|deepseek-r1/.test(name);
    badges.push('<span class="feat-badge feat-text" title="Text/chat generation">Text</span>');
    if (canCode || m.supportsTools) badges.push('<span class="feat-badge feat-code" title="Coding/agentic work">Code</span>');
    if (canReason || m.supportsThinking) badges.push('<span class="feat-badge feat-reason" title="Reasoning/planning">Reason</span>');
    if (m.supportsVision) badges.push('<span class="feat-badge feat-vision" title="Image/vision input">Vision</span>');
    if (/image|dall|flux|sdxl|midjourney|imagen/.test(name)) badges.push('<span class="feat-badge feat-image" title="Image generation">Image</span>');
    if (/video|sora|runway|veo|kling|wan/.test(name)) badges.push('<span class="feat-badge feat-video" title="Video generation">Video</span>');
    if (/audio|speech|tts|whisper|music|voice/.test(name) || provider === 'speechmatics') badges.push('<span class="feat-badge feat-audio" title="Audio/speech">Audio</span>');
    return badges.join('');
  }

  function pricingBadge(pricing, note, provider) {
    var cls = "pricing-badge ";
    var label = pricingLabel(pricing, provider);
    switch (pricing) {
      case "free": cls += "pricing-free"; break;
      case "free-tier": cls += "pricing-free-tier"; break;
      case "local": cls += "pricing-local"; break;
      case "subscription": cls += "pricing-sub"; break;
      case "pay-per-use": cls += "pricing-paid"; break;
      default: cls += "pricing-paid";
    }
    return '<span class="' + cls + '" title="' + esc(note || "") + '">' + label + '</span>';
  }

  function providerCostSummary(models) {
    var flags = {};
    (models || []).forEach(function (m) { flags[pricingLabel(m.pricing, m.provider)] = true; });
    var preferred = ["FREE", "FREE TIER", "LOCAL", "AZURE CREDITS", "SUBSCRIPTION", "PAID"];
    return preferred.filter(function (x) { return flags[x]; }).join(" / ") || "UNKNOWN";
  }

  function modelCostSuffix(m) {
    var parts = [];
    if (m.contextWindow) parts.push(fmtCtx(m.contextWindow) + " ctx");
    parts.push(pricingLabel(m.pricing, m.provider));
    return " [" + parts.join(" / ") + "]";
  }

  function featureBadges(m) {
    var html = "";
    if (m.supportsTools) html += '<span class="feat-badge feat-tools" title="Function calling / tool use">Tools</span>';
    if (m.supportsThinking) html += '<span class="feat-badge feat-thinking" title="Chain-of-thought reasoning">Think</span>';
    if (m.supportsVision) html += '<span class="feat-badge feat-vision" title="Image/vision input">Vision</span>';
    if (m.supportsStreaming) html += '<span class="feat-badge feat-stream" title="Streaming output">Stream</span>';
    return html;
  }

  function renderModelList() {
    var list = $("model-list-settings");
    if (!list) return;
    clearNode(list);

    // Group by provider (alphabetical)
    var groups = {};
    var providerOrder = [];
    cachedModels.forEach(function (m) {
      if (!m.name) return;
      if (m.name === "auto") return; // handled separately
      var prov = m.provider || "unknown";
      if (!groups[prov]) { groups[prov] = []; providerOrder.push(prov); }
      groups[prov].push(m);
    });
    providerOrder.sort();

    // Auto model at top
    var autoModel = cachedModels.find(function (m) { return m.name === "auto"; });
    if (autoModel) {
      var auto = document.createElement("div");
      auto.className = "model-card auto-model-card";
      var isActiveAuto = currentModel === "auto";
      auto["inner" + "HTML"] =
        '<div class="model-card-header">' +
          '<div class="model-card-title"><strong>Auto (Best for Task)</strong>' +
          pricingBadge("free", "Automatically picks the best model", "auto") + '</div>' +
          '<div class="model-card-action">' +
          (isActiveAuto ? '<span class="active-badge">Active</span>' : '<button class="action-btn primary" data-action="set-active" data-model="auto">Use</button>') +
          '</div></div>' +
        '<div class="model-card-desc">Routes each task to the best available model based on task type.</div>';
      list.appendChild(auto);
    }

    providerOrder.forEach(function (prov) {
      var models = groups[prov];
      // Provider group header
      var header = document.createElement("div");
      header.className = "provider-group-header";
      var provName = models[0].providerType || prov;
      var displayProv = prov.charAt(0).toUpperCase() + prov.slice(1);
      var costSummary = providerCostSummary(models);
      header["inner" + "HTML"] = '<span class="provider-group-name">' + esc(displayProv) + '</span>' +
        '<span class="provider-group-count">' + models.length + ' model' + (models.length !== 1 ? 's' : '') + '</span>' +
        '<span class="meta-chip" title="Provider cost category">' + esc(costSummary) + '</span>';
      list.appendChild(header);

      models.forEach(function (m) {
        var item = document.createElement("div");
        item.className = "model-card";
        var isActive = m.name === currentModel;
        var ctxLabel = m.contextWindow ? fmtCtx(m.contextWindow) + " ctx" : "";
        var maxOutLabel = m.maxOutputTokens ? fmtCtx(m.maxOutputTokens) + " out" : "";

        item["inner" + "HTML"] =
          '<div class="model-card-header">' +
            '<div class="model-card-title">' +
              '<strong>' + esc(m.displayName || m.name) + '</strong>' +
              pricingBadge(m.pricing, m.pricingNote || "", m.provider) +
            '</div>' +
            '<div class="model-card-action">' +
            (isActive ? '<span class="active-badge">Active</span>' : '<button class="action-btn" data-action="set-active" data-model="' + attr(m.name) + '">Use</button>') +
            (m.provider === "ollama" ? ' <button class="action-btn danger" data-action="delete-model" data-model="' + attr(m.name) + '" title="Delete">&#x2715;</button>' : '') +
            '</div></div>' +
          '<div class="model-card-meta">' +
            (ctxLabel ? '<span class="meta-chip" title="Context window: ' + (m.contextWindow || 0).toLocaleString() + ' tokens">' + ctxLabel + '</span>' : '') +
            (maxOutLabel ? '<span class="meta-chip" title="Max output: ' + (m.maxOutputTokens || 0).toLocaleString() + ' tokens">' + maxOutLabel + '</span>' : '') +
            featureBadges(m) +
          '</div>' +
          (m.pricingNote ? '<div class="model-card-pricing-note">' + esc(m.pricingNote) + '</div>' : '') +
          '<div class="model-card-id">' + esc(m.name) + '</div>';
        list.appendChild(item);
      });
    });
  }

  function relTime(ts) {
    if (!ts) return "";
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.floor(h / 24);
    if (d < 7) return d + "d ago";
    return new Date(ts).toLocaleDateString();
  }

  // VS Code webviews do not support window.confirm/window.prompt — they are no-ops
  // that return undefined. These build a small in-webview modal instead.
  function uiCloseModal() {
    var m = $("ui-modal");
    if (m && m.parentElement) m.parentElement.removeChild(m);
  }
  function uiConfirm(message, onYes) {
    uiCloseModal();
    var overlay = document.createElement("div");
    overlay.id = "ui-modal";
    overlay.className = "ui-modal-overlay";
    overlay["inner" + "HTML"] =
      '<div class="ui-modal-box">' +
        '<div class="ui-modal-msg"></div>' +
        '<div class="ui-modal-actions">' +
          '<button class="ui-modal-btn" data-ui="cancel">Cancel</button>' +
          '<button class="ui-modal-btn danger" data-ui="ok">Delete</button>' +
        '</div>' +
      '</div>';
    overlay.querySelector(".ui-modal-msg").textContent = message;
    overlay.addEventListener("click", function (e) {
      var t = e.target;
      if (t === overlay || (t.getAttribute && t.getAttribute("data-ui") === "cancel")) {
        uiCloseModal();
      } else if (t.getAttribute && t.getAttribute("data-ui") === "ok") {
        uiCloseModal();
        if (onYes) onYes();
      }
    });
    document.body.appendChild(overlay);
  }
  function uiPrompt(message, defaultValue, onOk) {
    uiCloseModal();
    var overlay = document.createElement("div");
    overlay.id = "ui-modal";
    overlay.className = "ui-modal-overlay";
    overlay["inner" + "HTML"] =
      '<div class="ui-modal-box">' +
        '<div class="ui-modal-msg"></div>' +
        '<input type="text" class="ui-modal-input" />' +
        '<div class="ui-modal-actions">' +
          '<button class="ui-modal-btn" data-ui="cancel">Cancel</button>' +
          '<button class="ui-modal-btn primary" data-ui="ok">Save</button>' +
        '</div>' +
      '</div>';
    overlay.querySelector(".ui-modal-msg").textContent = message;
    var input = overlay.querySelector(".ui-modal-input");
    input.value = defaultValue || "";
    function commit() {
      var v = input.value;
      uiCloseModal();
      if (onOk) onOk(v);
    }
    overlay.addEventListener("click", function (e) {
      var t = e.target;
      if (t === overlay || (t.getAttribute && t.getAttribute("data-ui") === "cancel")) {
        uiCloseModal();
      } else if (t.getAttribute && t.getAttribute("data-ui") === "ok") {
        commit();
      }
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); uiCloseModal(); }
    });
    document.body.appendChild(overlay);
    setTimeout(function () { input.focus(); input.select(); }, 30);
  }

  function openSkillEditor(skill) {
    editingSkillId = skill ? skill.id : null;
    var ed = $("skill-editor");
    if (!ed) return;
    $("skill-name").value = skill ? (skill.name || "") : "";
    $("skill-desc").value = skill ? (skill.description || "") : "";
    $("skill-body").value = skill ? (skill.body || "") : "";
    ed.style.display = "block";
    setTimeout(function () { $("skill-name").focus(); }, 30);
  }
  function closeSkillEditor() {
    editingSkillId = null;
    var ed = $("skill-editor");
    if (ed) ed.style.display = "none";
  }
  function modelOptionValue(m) {
    return (m && (m.name || m.id)) || (typeof m === "string" ? m : "");
  }

  function modelProviderKey(m) {
    var value = modelOptionValue(m);
    var provider = (m && (m.provider || m.providerType)) || (value.indexOf(":") > 0 ? value.split(":")[0] : "configured");
    return String(provider || "configured").toLowerCase();
  }

  function providerDisplayName(provider) {
    var known = {
      auto: "Auto routing",
      agentic: "Agentic Modes",
      most: "Most used models and modes",
      configured: "Configured models",
      azure: "Azure OpenAI / Azure AI Foundry",
      openai: "OpenAI",
      anthropic: "Anthropic / Claude",
      openrouter: "OpenRouter",
      groq: "Groq",
      ollama: "Ollama / Local",
      local: "Local / self-hosted",
      mistral: "Mistral",
      deepseek: "DeepSeek",
      together: "Together AI",
      vultr: "Vultr",
      huggingface: "Hugging Face",
      featherless: "Featherless",
      moonshot: "Moonshot / Kimi",
      gemini: "Google Gemini",
      google: "Google Gemini",
      xai: "xAI / Grok",
      perplexity: "Perplexity"
    };
    provider = String(provider || "configured").toLowerCase();
    return known[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function modelCostCategory(m) {
    var value = modelOptionValue(m).toLowerCase();
    var provider = modelProviderKey(m);
    var pricingRaw = (m && m.pricing !== undefined && m.pricing !== null) ? m.pricing : "";
    var pricingText = typeof pricingRaw === "string" ? pricingRaw.toLowerCase() : "";
    var note = String((m && (m.pricingNote || m.costNote || m.pricingTier || m.priceTier)) || "").toLowerCase();
    if (provider === "ollama" || provider === "local" || pricingText === "local" || value.indexOf("local") >= 0) return { key: "0-local", label: "Local / self-hosted" };
    if (pricingText === "free" || value.indexOf(":free") >= 0 || value.indexOf("/free") >= 0 || note.indexOf("free") >= 0 && note.indexOf("tier") < 0) return { key: "1-free", label: "Free" };
    if (pricingText === "free-tier" || note.indexOf("free tier") >= 0 || note.indexOf("free quota") >= 0 || note.indexOf("quota") >= 0) return { key: "2-free-tier", label: "Free tier / quota" };
    if (provider === "groq" && !pricingText) return { key: "2-free-tier", label: "Fast / quota-based" };
    if (provider === "azure" || pricingText === "subscription") return { key: "3-subscription", label: "Subscription / credits" };
    if (pricingText === "pay-per-use" || pricingText === "paid") return { key: "4-paid", label: "Paid / metered" };
    if (pricingRaw && typeof pricingRaw === "object" && (Number(pricingRaw.inputPerMTok || pricingRaw.input || 0) > 0 || Number(pricingRaw.outputPerMTok || pricingRaw.output || 0) > 0)) return { key: "4-paid", label: "Paid / metered" };
    if (note.indexOf("paid") >= 0 || note.indexOf("meter") >= 0 || note.indexOf("$/") >= 0 || note.indexOf("$0") >= 0) return { key: "4-paid", label: "Paid / metered" };
    return { key: "5-configured", label: "Configured / unknown price" };
  }

  function modelCostSuffix(m) {
    var bits = [];
    if (!m) return "";
    var cat = modelCostCategory(m);
    if (cat && cat.label) bits.push(cat.label);
    var ctx = m.effectiveContextWindow || m.contextWindow || m.maxContextTokens;
    if (ctx) bits.push("ctx " + ctx);
    if (m.contextSource) bits.push("ctx " + m.contextSource);
    if (m.supportsTools) bits.push("tools");
    if (m.supportsVision) bits.push("vision");
    if (m.supportsThinking) bits.push("reasoning");
    return bits.length ? " (" + bits.join(" | ") + ")" : "";
  }

  function modelOptionLabel(m) {
    var value = modelOptionValue(m);
    if (value === "auto") return "Auto (best configured model for this task)";
    var label = (m && (m.displayName || m.name || m.id)) || value;
    return label + modelCostSuffix(m);
  }

  function modelSortKey(m) {
    return modelCostCategory(m).key + "|" + providerDisplayName(modelProviderKey(m)).toLowerCase() + "|" + modelOptionLabel(m).toLowerCase();
  }

  function sortedModels(models) {
    return (models || []).slice().sort(function (a, b) { return modelSortKey(a).localeCompare(modelSortKey(b)); });
  }

  function configuredChatModels(includeAuto) {
    var seen = {};
    return sortedModels((cachedModels || []).filter(function (m) {
      var value = modelOptionValue(m);
      if (!value) return false;
      if (!includeAuto && value === "auto") return false;
      if (value.indexOf("agentic:") === 0) return false;
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    }));
  }

  function createOption(value, label, selectedValues, title) {
    var opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (title) opt.title = title;
    if (selectedValues && selectedValues.indexOf(value) !== -1) opt.selected = true;
    return opt;
  }

  function appendModelOption(group, m, selectedValues) {
    var value = modelOptionValue(m);
    var title = [
      providerDisplayName(modelProviderKey(m)),
      modelCostCategory(m).label,
      (m && (m.effectiveContextWindow || m.contextWindow)) ? ("context: " + (m.effectiveContextWindow || m.contextWindow)) : "",
      (m && m.contextSource) ? ("context source: " + m.contextSource) : "",
      (m && m.supportsTools) ? "tools" : "",
      (m && m.supportsVision) ? "vision" : "",
      (m && m.supportsThinking) ? "reasoning" : "",
      (m && m.pricingNote) || ""
    ].filter(Boolean).join(" | ");
    group.appendChild(createOption(value, modelOptionLabel(m), selectedValues, title));
  }

  function appendMissingModelOption(select, value) {
    if (!select || !value) return;
    var exists = Array.prototype.some.call(select.options, function (o) { return o.value === value; });
    if (exists) return;
    select.insertBefore(createOption(value, value + " (not currently discovered/configured)", [value], "Profile keeps this model ID until the provider exposes it again."), select.firstChild);
  }

  function appendAgenticModeGroups(select, selectedValues) {
    if (!agenticProfiles || !agenticProfiles.length) return;
    var group = document.createElement("optgroup");
    group.label = "Agentic Modes - profile orchestration";
    agenticProfiles.forEach(function (p) {
      var value = "agentic:" + p.id;
      var label = (p.name || p.id) + " - " + (p.costPolicy || "balanced") + " - " + (p.description || "profile");
      group.appendChild(createOption(value, label, selectedValues, p.instructions || p.description || "Agentic profile"));
    });
    select.appendChild(group);
  }

  function appendMostUsedGroup(select, models, selectedValues, includeAgentic) {
    var preferred = [
      "agentic:profile_standard_single_model",
      "agentic:profile_provider_best_available",
      "agentic:profile_azure_cost_smart_production",
      "agentic:profile_multi_provider_council",
      "azure:gpt-5.5", "azure:gpt-4.1", "azure:grok-4.3", "openai:gpt-4.1",
      "anthropic:claude-opus-4-1", "anthropic:claude-sonnet-4", "openrouter:anthropic/claude-sonnet-4", "openrouter:qwen/qwen3-coder:free",
      "groq:openai/gpt-oss-120b", "ollama:sentinel-coder-one:latest", "auto"
    ];
    var byValue = {};
    (models || []).forEach(function (m) { byValue[modelOptionValue(m)] = m; });
    var group = document.createElement("optgroup");
    group.label = "Most used models and modes";
    var added = {};
    preferred.forEach(function (value) {
      if (!includeAgentic && value.indexOf("agentic:") === 0) return;
      if (value.indexOf("agentic:") === 0) {
        var prof = (agenticProfiles || []).find(function (p) { return "agentic:" + p.id === value; });
        if (prof) {
          group.appendChild(createOption(value, prof.name + " - Agentic mode", selectedValues, prof.description || "Agentic profile"));
          added[value] = true;
        }
        return;
      }
      var m = byValue[value];
      if (m) { appendModelOption(group, m, selectedValues); added[value] = true; }
    });
    if (group.children.length) select.appendChild(group);
  }

  function appendProviderCostGroups(select, models, selectedValues) {
    var byProvider = {};
    sortedModels(models).forEach(function (m) {
      var provider = modelProviderKey(m);
      if (!byProvider[provider]) byProvider[provider] = [];
      byProvider[provider].push(m);
    });
    Object.keys(byProvider).sort(function (a, b) { return providerDisplayName(a).localeCompare(providerDisplayName(b)); }).forEach(function (provider) {
      var byCost = {};
      byProvider[provider].forEach(function (m) {
        var cat = modelCostCategory(m);
        if (!byCost[cat.key]) byCost[cat.key] = { label: cat.label, models: [] };
        byCost[cat.key].models.push(m);
      });
      Object.keys(byCost).sort().forEach(function (costKey) {
        var group = document.createElement("optgroup");
        group.label = providerDisplayName(provider) + " - " + byCost[costKey].label + " (" + byCost[costKey].models.length + ")";
        sortedModels(byCost[costKey].models).forEach(function (m) { appendModelOption(group, m, selectedValues); });
        select.appendChild(group);
      });
    });
  }

  function renderCategorizedChatModelSelect(selected) {
    if (!modelSelect) return;
    var previous = selected || modelSelect.value || currentModel || "auto";
    var selectedValues = [previous];
    clearNode(modelSelect);
    appendAgenticModeGroups(modelSelect, selectedValues);
    appendMostUsedGroup(modelSelect, configuredChatModels(true), selectedValues, true);
    appendProviderCostGroups(modelSelect, configuredChatModels(true), selectedValues);
    appendMissingModelOption(modelSelect, previous);
    modelSelect.value = previous;
  }

  function populateAgenticModelSelect(id, selected, includeAuto) {
    var select = $(id);
    if (!select) return;
    var selectedValues = Array.isArray(selected) ? selected : (selected ? [selected] : []);
    clearNode(select);
    appendMostUsedGroup(select, configuredChatModels(includeAuto), selectedValues, false);
    appendProviderCostGroups(select, configuredChatModels(includeAuto), selectedValues);
    selectedValues.forEach(function (value) { appendMissingModelOption(select, value); });
    Array.prototype.forEach.call(select.options, function (opt) { opt.selected = selectedValues.indexOf(opt.value) !== -1; });
  }

  function selectedAgenticModels(id) {
    var select = $(id);
    if (!select) return [];
    return Array.prototype.slice.call(select.selectedOptions || []).map(function (o) { return o.value; }).filter(Boolean);
  }

  function editAgenticProfile(id) {
    var p = (agenticProfiles || []).find(function (x) { return x.id === id; });
    if (!p) return;
    var form = $("agentic-profile-form");
    if (form) form.style.display = "block";
    $("agentic-id").value = p.id || "";
    $("agentic-name").value = p.name || "";
    $("agentic-desc").value = p.description || "";
    $("agentic-cost").value = p.costPolicy || "balanced";
    $("agentic-max").value = p.maxParallelAgents || 3;
    $("agentic-premium").checked = !!p.allowPremiumWorkers;
    $("agentic-cheap-fallback").checked = !!p.allowCheapFallback;
    $("agentic-instructions").value = p.instructions || "";
    populateAgenticModelSelect("agentic-main", p.mainModel || "auto", true);
    populateAgenticModelSelect("agentic-workers", p.workerModels || [], false);
    populateAgenticModelSelect("agentic-reviewers", p.reviewerModels || [], false);
    populateAgenticModelSelect("agentic-default-worker", p.defaultWorkerModel || (p.workerModels || [])[0] || "", false);
  }

  function fillAgenticProfileForm() {
    var form = $("agentic-profile-form");
    if (form) form.style.display = "block";
    $("agentic-id").value = "";
    $("agentic-name").value = "";
    $("agentic-desc").value = "";
    $("agentic-cost").value = "balanced";
    $("agentic-max").value = 3;
    $("agentic-premium").checked = true;
    $("agentic-cheap-fallback").checked = true;
    $("agentic-instructions").value = "";
    populateAgenticModelSelect("agentic-main", currentModel && currentModel.indexOf("agentic:") !== 0 ? currentModel : "auto", true);
    populateAgenticModelSelect("agentic-workers", [], false);
    populateAgenticModelSelect("agentic-reviewers", [], false);
    populateAgenticModelSelect("agentic-default-worker", "", false);
  }

  function saveAgenticProfileFromForm() {
    var workers = selectedAgenticModels("agentic-workers");
    var reviewers = selectedAgenticModels("agentic-reviewers");
    var defaultWorker = $("agentic-default-worker").value || workers[0] || "";
    vscode.postMessage({ type: "saveAgenticProfile", profile: {
      id: $("agentic-id").value || undefined,
      name: $("agentic-name").value.trim(),
      description: $("agentic-desc").value.trim(),
      mainModel: $("agentic-main").value,
      workerModels: workers,
      reviewerModels: reviewers,
      defaultWorkerModel: defaultWorker,
      costPolicy: $("agentic-cost").value,
      maxParallelAgents: parseInt($("agentic-max").value || "3", 10),
      allowPremiumWorkers: $("agentic-premium").checked,
      allowCheapFallback: $("agentic-cheap-fallback").checked,
      instructions: $("agentic-instructions").value.trim()
    }});
  }

  function renderAgenticProfiles(profiles,currentId){
    agenticProfiles=profiles||[]; currentAgenticProfileId=currentId||currentAgenticProfileId||"";
    var list=$("agentic-profile-list"); if(!list)return;
    list.textContent="";
    if(!agenticProfiles.length){
      var empty=document.createElement("p");
      empty.style.fontSize="12px";
      empty.style.color="var(--desc-fg)";
      empty.textContent="No agentic profiles yet.";
      list.appendChild(empty);
      return;
    }
    agenticProfiles.forEach(function(p){
      var active=p.id===currentAgenticProfileId;
      var workers=(p.workerModels||[]);
      var reviewers=(p.reviewerModels||[]);
      var defaultWorker=p.defaultWorkerModel||workers[0]||"";
      var card=document.createElement("div");
      card.className="skill-card";
      var top=document.createElement("div");
      top.style.display="flex";
      top.style.justifyContent="space-between";
      top.style.gap="8px";
      var body=document.createElement("div");
      var title=document.createElement("strong");
      title.textContent=p.name||"Untitled profile";
      body.appendChild(title);
      if(active){
        body.appendChild(document.createTextNode(" "));
        var pill=document.createElement("span");
        pill.className="pill";
        pill.textContent="active";
        body.appendChild(pill);
      }
      body.appendChild(document.createElement("br"));
      var desc=document.createElement("span");
      desc.style.fontSize="11px";
      desc.style.color="var(--desc-fg)";
      desc.textContent=p.description||"";
      body.appendChild(desc);
      var actions=document.createElement("div");
      [
        ["select","Use","action-btn"],
        ["edit","Edit","action-btn"],
        ["delete","Delete","action-btn danger"]
      ].forEach(function(spec){
        var btn=document.createElement("button");
        btn.className=spec[2];
        btn.dataset.agenticAction=spec[0];
        btn.dataset.profile=p.id||"";
        btn.textContent=spec[1];
        actions.appendChild(btn);
      });
      top.appendChild(body);
      top.appendChild(actions);
      card.appendChild(top);
      var meta=document.createElement("div");
      meta.style.fontSize="11px";
      meta.style.color="var(--desc-fg)";
      meta.style.marginTop="6px";
      function appendLine(label,value,useCode){
        meta.appendChild(document.createTextNode(label));
        if(useCode){ var code=document.createElement("code"); code.textContent=value; meta.appendChild(code); }
        else { meta.appendChild(document.createTextNode(value)); }
        meta.appendChild(document.createElement("br"));
      }
      appendLine("Main/orchestrator: ",p.mainModel||"auto",true);
      appendLine("Worker agents ("+workers.length+"): ",workers.length?workers.join(", "):"none",false);
      appendLine("Default worker: ",defaultWorker||"none",!!defaultWorker);
      appendLine("Reviewer agents ("+reviewers.length+"): ",reviewers.length?reviewers.join(", "):"none",false);
      meta.appendChild(document.createTextNode("Policy: "+(p.costPolicy||"balanced")+", max parallel: "+String(p.maxParallelAgents||3)+", premium workers: "+(p.allowPremiumWorkers?"yes":"no")));
      card.appendChild(meta);
      list.appendChild(card);
    });
  }


  function renderDynamicContextSettings(settings) {
    dynamicContextSettings = settings || {};
    function setChecked(id, val) { var el = $(id); if (el) el.checked = val !== false; }
    setChecked("ctx-enabled", dynamicContextSettings.enabled);
    setChecked("ctx-active", dynamicContextSettings.includeActiveFile);
    setChecked("ctx-tabs", dynamicContextSettings.includeOpenTabs);
    setChecked("ctx-diag", dynamicContextSettings.includeDiagnostics);
    setChecked("ctx-git", dynamicContextSettings.includeGitStatus);
    setChecked("ctx-diff", dynamicContextSettings.includeRecentChanges);
    setChecked("ctx-provider", dynamicContextSettings.includeProviderMetadata);
    var max = $("ctx-maxchars"); if (max) max.value = String(dynamicContextSettings.maxChars || 12000);
  }
  function saveDynamicContextFromForm() {
    vscode.postMessage({ type: "saveDynamicContextSettings", settings: {
      enabled: $("ctx-enabled").checked,
      includeActiveFile: $("ctx-active").checked,
      includeOpenTabs: $("ctx-tabs").checked,
      includeDiagnostics: $("ctx-diag").checked,
      includeGitStatus: $("ctx-git").checked,
      includeRecentChanges: $("ctx-diff").checked,
      includeProviderMetadata: $("ctx-provider").checked,
      maxChars: parseInt($("ctx-maxchars").value || "12000", 10)
    }});
  }

  function renderSkillList(skills) {
    lastSkills = skills || [];
    var list = $("skill-list");
    if (!list) return;
    clearNode(list);
    if (!lastSkills.length) {
      var empty = textEl("div", "session-empty", "No skills yet. Click + New skill to add one, or Import from workspace to pull SKILL.md / instruction files.");
      list.appendChild(empty);
      return;
    }
    lastSkills.forEach(function (s) {
      var item = document.createElement("div");
      item.className = "skill-item" + (s.enabled ? " enabled" : "");
      var srcBadge = "";
      if (s.source === "builtin") srcBadge = '<span class="mcp-source">built-in</span>';
      else if (s.source && s.source.indexOf("import:") === 0) srcBadge = '<span class="mcp-source">' + esc(s.source.slice(7)) + '</span>';
      item["inner" + "HTML"] =
        '<div class="skill-head">' +
          '<label class="skill-toggle">' +
            '<input type="checkbox" data-skill-action="toggle" data-skill-id="' + esc(s.id) + '" data-enabled="' + (s.enabled ? "true" : "false") + '"' + (s.enabled ? " checked" : "") + '>' +
            '<span class="skill-name">' + esc(s.name) + '</span>' + srcBadge +
          '</label>' +
          '<div class="skill-actions">' +
            '<button class="icon-btn" data-skill-action="edit" data-skill-id="' + esc(s.id) + '" title="Edit">&#x270E;</button>' +
            '<button class="icon-btn" data-skill-action="delete" data-skill-id="' + esc(s.id) + '" title="Delete">&#x1F5D1;</button>' +
          '</div>' +
        '</div>' +
        (s.description ? '<div class="skill-desc">' + esc(s.description) + '</div>' : '');
      list.appendChild(item);
    });
  }

  function renderSessionList(sessions, currentId) {
    var list = $("session-list");
    if (!list) return;
    clearNode(list);
    if (!sessions.length) {
      list.appendChild(textEl("div", "session-empty", "No saved chats yet. Start a conversation to create one."));
      return;
    }
    sessions.forEach(function (s) {
      var item = document.createElement("div");
      item.className = "session-item" + (s.id === currentId ? " current" : "");
      item.setAttribute("data-id", s.id);
      item["inner" + "HTML"] =
        '<div class="session-main" data-action="switch-session" data-id="' + esc(s.id) + '">' +
          '<span class="session-title">' + esc(s.title || "Untitled chat") + '</span>' +
          '<span class="session-meta">' + relTime(s.updatedAt) + ' &middot; ' + (s.count || 0) + ' msgs' +
          (s.id === currentId ? ' &middot; <span class="session-current-badge">current</span>' : '') + '</span>' +
        '</div>' +
        '<div class="session-actions">' +
          '<button class="icon-btn" data-action="rename-session" data-id="' + esc(s.id) + '" title="Rename">&#x270E;</button>' +
          '<button class="icon-btn danger" data-action="delete-session" data-id="' + esc(s.id) + '" title="Delete">&#x1F5D1;</button>' +
        '</div>';
      list.appendChild(item);
    });
  }

  function renderProviderList(providers) {
    var list = $("provider-list");
    if (!list) return;
    clearNode(list);
    providers.forEach(function (p) {
      var item = document.createElement("div");
      item.className = "provider-item";
      item.id = "provider-item-" + p.id;
      var statusLabel;
      if (p.type === "ollama") {
        statusLabel = '<span class="prov-status ok">● Local</span>';
      } else if (p.hasKey) {
        statusLabel = '<span class="prov-status ok">● Key set' +
          (p.keyPreview ? ' (' + esc(p.keyPreview) + ')' : '') + '</span>';
      } else {
        statusLabel = '<span class="prov-status none">○ No key</span>';
      }
      var enabledLabel = p.enabled
        ? '<span class="prov-status ok" title="This provider is active">✓ Enabled</span>'
        : '<span class="prov-status off">Disabled</span>';
      item["inner" + "HTML"] =
        '<div class="provider-info">' +
        '<span class="provider-name">' + esc(p.name) + '</span>' +
        '<span class="provider-type">' + esc(p.type) + ' &middot; ' + p.modelCount + ' models</span>' +
        '<span class="provider-status" id="prov-stat-' + attr(p.id) + '">' + statusLabel + ' &middot; ' + enabledLabel + '</span></div>' +
        '<div class="provider-actions">' +
        (p.type !== "ollama" ? '<input class="provider-key-input" id="provider-key-' + attr(p.id) + '" type="password" placeholder="' + (p.hasKey ? 'Key saved — enter to replace' : 'Paste API key…') + '" value="">' +
          '<button class="action-btn primary" data-action="save-provider-key" data-provider="' + attr(p.id) + '">Save</button>' +
          (p.hasKey ? '<button class="action-btn" data-action="test-provider" data-provider="' + attr(p.id) + '">Test</button>' : '') : '') +
        (p.type !== "ollama" && p.hasKey ? '<button class="action-btn" data-action="provider-balance" data-provider="' + attr(p.id) + '">Balance</button>' : '') +
        '<button class="action-btn" data-action="toggle-provider" data-provider="' + attr(p.id) + '" data-enabled="' + attr(String(!!p.enabled)) + '">' +
        (p.enabled ? 'Disable' : 'Enable') + '</button></div>' +
        '<div class="provider-balance" id="prov-bal-' + attr(p.id) + '" style="display:none"></div>';
      list.appendChild(item);
    });
  }

  // ── Plan panel: renders the agent's live multi-step plan above the chat ──
  var planCollapsed = false;
  function renderPlan(steps) {
    var panel = document.getElementById("plan-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "plan-panel";
      panel.className = "plan-panel";
      if (chatContainer && chatContainer.parentNode) {
        chatContainer.parentNode.insertBefore(panel, chatContainer);
      } else {
        document.body.appendChild(panel);
      }
    }
    if (!steps || steps.length === 0) { panel.style.display = "none"; return; }
    var done = 0;
    var rows = "";
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i] || {};
      var st = s.status || "pending";
      if (st === "done") done++;
      var icon = st === "done" ? "✓" : (st === "in-progress" ? "▶" : "○");
      rows += '<div class="plan-step plan-' + esc(st) + '"><span class="plan-icon">' + icon +
        '</span><span class="plan-title">' + esc(s.title || "") + '</span></div>';
    }
    var caret = planCollapsed ? "▸" : "▾";
    panel["inner" + "HTML"] = '<div class="plan-head" id="plan-head-toggle" title="Click to ' +
      (planCollapsed ? "expand" : "minimise") + '"><span class="plan-caret">' + caret +
      '</span> 📋 Plan (' + done + '/' + steps.length + ')</div>' +
      '<div class="plan-body">' + rows + '</div>';
    var body = panel.querySelector(".plan-body");
    if (body) body.style.display = planCollapsed ? "none" : "block";
    var head = panel.querySelector("#plan-head-toggle");
    if (head) {
      head.addEventListener("click", function () {
        planCollapsed = !planCollapsed;
        var b = panel.querySelector(".plan-body");
        var c = panel.querySelector(".plan-caret");
        if (b) b.style.display = planCollapsed ? "none" : "block";
        if (c) c.textContent = planCollapsed ? "▸" : "▾";
        head.title = planCollapsed ? "Click to expand" : "Click to minimise";
      });
    }
    panel.style.display = "block";
  }

  // ── Message handler ──
  // Final model-selector override: keep this after legacy helpers so the runtime picker is categorized.
  // Canonical model selector helpers are defined above; stale late overrides removed.

  window.addEventListener("message", function (event) {
    var data = event.data;
    switch (data.type) {
      case "connectionStatus":
        statusDot.className = "status-dot " + (data.connected ? "connected" : "disconnected");
        statusText.textContent = data.connected ? "Connected" : "Disconnected";
        break;

      case "systemNote":
        statusText.textContent = data.content || "";
        if (data.content) addSystemNote(data.content);
        break;
      case "checkpointStatus":
        showCheckpointStatus(data);
        break;
      case "taskSummary":
        showTaskSummary(data);
        break;

      case "attachmentSaved":
        if (data.ok !== false && data.path) {
          var savedAttachment = {
            name: data.name || data.label || "attachment",
            path: data.path,
            webviewUri: data.webviewUri || "",
            mime: data.mime || "",
            mediaKind: data.mediaKind || "",
            kind: mediaKindFromName(data.name || data.path, data.mime, data.mediaKind)
          };
          pendingAttachments.push(savedAttachment);
          renderAttachmentTray();
          addSystemNote("Attachment saved and ready:<br>" + renderMediaPreviewCard(savedAttachment));
          statusText.textContent = "Attachment ready: " + data.path;
        } else {
          addSystemNote("Attachment save failed: " + esc(data.error || "Unknown error"));
          statusText.textContent = data.error || "Could not save attachment.";
        }
        break;

      case "planUpdate":
        renderPlan(data.steps || []);
        break;

      case "modelList":
        cachedModels = data.models || [];
        if (data.agenticProfiles) renderAgenticProfiles(data.agenticProfiles || [], data.currentAgenticProfileId || "");
        currentModel = data.selected || currentModel || "auto";
        refreshAgenticDropdownsFromCurrentForm();
        if ($("agentic-editor") && $("agentic-editor").style.display !== "none") refreshAgenticDropdownsFromCurrentForm();
        if (cachedModels.length === 0) {
          clearNode(modelSelect);
          var empty = document.createElement("option"); empty.value = ""; empty.textContent = "No models";
          modelSelect.appendChild(empty);
          statusDot.className = "status-dot disconnected";
          statusText.textContent = "No configured models";
        } else {
          renderCategorizedChatModelSelect();
          var normalModels = (cachedModels || []).filter(function (m) {
            var value = sentinelFinalModelValue(m);
            return value && value !== "auto" && value.indexOf("agentic:") !== 0;
          });
          statusDot.className = "status-dot connected";
          statusText.textContent = "Connected (" + normalModels.length + " models, categorized by Agentic modes, most used, provider, free/paid, context and tools)";
        }
        break;

      case "initState":
        currentMode = data.mode || "agent";
        currentModel = data.selectedModel || "auto";
        currentApproval = data.approvalMode || "default";
        currentOrchestration = data.orchestration || "off";
        document.querySelectorAll(".mode-tab").forEach(function (t) {
          t.classList.toggle("active", t.getAttribute("data-mode") === currentMode);
        });
        modeLabel.textContent = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
        approvalBar.style.display = currentMode === "agent" ? "flex" : "none";
        document.querySelectorAll(".approval-btn").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-approval") === currentApproval);
        });
        if (bossToggle) bossToggle.classList.toggle("active", currentOrchestration === "boss");
        autoModelBadge.style.display = currentModel === "auto" ? "" : "none";
        autoModelBadge.textContent = "Auto";
        break;

      case "responseStart":
        setGenerating(true);
        showContinue(false);
        currentRawText = "";
        needNewBlock = false;
        pendingToolCards = [];
        var msg = createAssistantMessage();
        currentAssistantDiv = msg.wrapper;
        currentThinkingDiv = msg.thinkDiv;
        currentContentDiv = msg.contentDiv;
        break;

      case "thinkingChunk":
        if (currentThinkingDiv) {
          currentThinkingDiv.style.display = "block";
          var body = currentThinkingDiv.querySelector(".thinking-body");
          if (body) body.textContent = data.content;
          var lbl = currentThinkingDiv.querySelector(".thinking-label");
          if (lbl) lbl.textContent = data.done ? "Thought complete" : "Thinking...";
          followChatOutput();
        }
        break;

      case "responseChunk":
        ensureBlock();
        currentRawText += data.content;
        if (currentContentDiv) {
          currentContentDiv["inner" + "HTML"] = renderMd(currentRawText);
          followChatOutput();
        }
        break;

      case "responseReplace":
        ensureBlock();
        currentRawText = data.content;
        if (currentContentDiv) {
          currentContentDiv["inner" + "HTML"] = renderMd(data.content);
          followChatOutput();
        }
        break;

      case "newResponseBlock":
        // Tools just ran; the next prose should start a NEW bubble below the tool
        // cards instead of overwriting the bubble that sits above them.
        needNewBlock = true;
        currentRawText = "";
        break;

      case "turnStats": {
        // Append a compact, real telemetry footer to the current assistant turn.
        var statTarget = currentAssistantDiv;
        if (statTarget) {
          var sf = document.createElement("div");
          sf.className = "turn-stats";
          var secs = ((data.elapsedMs || 0) / 1000).toFixed(1);
          var totT = (data.inputTokens || 0) + (data.outputTokens || 0);
          var txt = "Usage: " + totT.toLocaleString() + " tok (" + (data.inputTokens || 0).toLocaleString() +
            " in / " + (data.outputTokens || 0).toLocaleString() + " out) | " + (data.steps || 0) + " step(s)";
          if (data.toolCalls) txt += " | " + data.toolCalls + " tool call(s)";
          txt += " | " + secs + "s";
          if (typeof data.costUsd === "number") txt += " | ~$" + data.costUsd.toFixed(4);
          sf.textContent = txt;
          sf.title = "Estimated from response text (~4 chars/token). Cost shown only when the provider exposes per-token pricing.";
          statTarget.appendChild(sf);
          if (data.modelUsageSummary || (data.modelUsage && data.modelUsage.length)) {
            var mf = document.createElement("div");
            mf.className = "turn-stats turn-stats-models";
            var modelText = data.modelUsageSummary || data.modelUsage.map(function (m) {
              return (m.label || m.role || "model") + ": " + m.model + (m.calls > 1 ? " x" + m.calls : "");
            }).join("; ");
            mf.textContent = "Models used: " + modelText;
            mf.title = "Actual orchestrator/sub-agent models used in this turn.";
            statTarget.appendChild(mf);
          }
        }
        break;
      }

      case "responseDone":
        setGenerating(false);
        if (currentThinkingDiv && currentThinkingDiv.style.display !== "none") {
          var tb = currentThinkingDiv.querySelector(".thinking-body");
          if (tb) tb.style.display = "none";
          var tog = currentThinkingDiv.querySelector(".thinking-toggle");
          if (tog) tog.textContent = "Show thinking";
        }
        currentAssistantDiv = null;
        currentThinkingDiv = null;
        currentContentDiv = null;
        break;

      case "continueAvailable":
        handleContinueAvailable();
        break;

      case "response":
        if (data.done) setGenerating(false);
        addMessage("assistant", data.content);
        break;

      case "autoModelPicked":
        autoModelBadge.style.display = "";
        autoModelBadge.textContent = "Auto: " + (data.model || "").split(":").pop();
        autoModelBadge.title = "Task: " + (data.taskType || "general") + " -> " + (data.model || "");
        break;

      case "approvalModeChanged":
        currentApproval = data.mode;
        document.querySelectorAll(".approval-btn").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-approval") === data.mode);
        });
        addSystemNote("Approval mode changed to " + (data.mode || "default"));
        break;

      case "toolApproval":
        addToolApprovalCard(data.toolName, data.description, data.args, data.dangerLevel);
        break;

      case "toolStart":
        addToolStart(data.toolName);
        break;

      case "toolResult":
        addToolResult(data.toolName, data.status, data.content, data.media || []);
        break;

      case "subAgentStart":
        addSubAgentCard(data.task, data.model, null);
        break;

      case "subAgentResult":
        // Update last sub-agent card or add new one
        var lastSA = chatContainer.querySelector(".sub-agent-card:last-child");
        if (lastSA) {
          var resDiv = lastSA.querySelector(".sa-result, .sa-task:last-child");
          if (resDiv) {
            resDiv.className = "sa-result";
            resDiv.textContent = (data.result || "").slice(0, 3000);
          }
        } else {
          addSubAgentCard(data.task, data.model, data.result);
        }
        break;

      case "toolConfig":
        clearNode(toolListEl);
        var cats = {};
        (data.tools || []).forEach(function (t) {
          if (!cats[t.category]) cats[t.category] = [];
          cats[t.category].push(t);
        });
        Object.keys(cats).sort().forEach(function (cat) {
          var h = document.createElement("div");
          h.className = "tool-category-header";
          h.textContent = cat;
          toolListEl.appendChild(h);
          cats[cat].forEach(function (tool) {
            var item = document.createElement("div");
            item.className = "tool-item";
            var cb = document.createElement("input");
            cb.type = "checkbox"; cb.checked = tool.enabled; cb.id = "tool-cb-" + tool.name;
            cb.addEventListener("change", function () {
              vscode.postMessage({ type: "setToolEnabled", toolName: tool.name, enabled: cb.checked });
            });
            var lbl = document.createElement("label");
            lbl.htmlFor = cb.id;
            lbl["inner" + "HTML"] = '<span class="tool-name-label">' + esc(tool.name) + '</span><span class="tool-desc-label">' + esc(tool.description) + '</span>';
            var badge = document.createElement("span");
            badge.className = "danger-badge " + tool.dangerLevel;
            badge.textContent = tool.dangerLevel;
            item.appendChild(cb); item.appendChild(lbl); item.appendChild(badge);
            toolListEl.appendChild(item);
          });
        });
        break;

      case "providerList":
        renderProviderList(data.providers || []);
        break;

      case "providerTest": {
        var pStat = $("prov-stat-" + data.providerId);
        if (pStat) {
          if (data.pending) {
            pStat["inner" + "HTML"] = '<span class="prov-status testing">● ' + esc(data.message || "Testing…") + '</span>';
          } else if (data.ok) {
            pStat["inner" + "HTML"] = '<span class="prov-status ok">✓ ' + esc(data.message || "Key valid") + '</span>';
          } else {
            pStat["inner" + "HTML"] = '<span class="prov-status err">✗ ' + esc(data.message || "Key invalid") + '</span>';
          }
        }
        break;
      }

      case "providerBalance": {
        var balSlot = $("prov-bal-" + data.providerId);
        if (balSlot) {
          if (data.pending) {
            balSlot.style.display = "block";
            balSlot.textContent = "Querying balance…";
          } else {
            var b = data.balance || {};
            var u = data.usage || {};
            var html = "";
            if (b.supported) {
              if (typeof b.remaining === "number" && isFinite(b.remaining)) {
                var cur = b.currency || "USD";
                html += '<div class="bal-line bal-ok">💳 ' + esc(cur) + ' ' + b.remaining.toFixed(2) + ' remaining';
                if (typeof b.totalCredits === "number") {
                  html += ' &middot; used ' + (b.totalUsage || 0).toFixed(2) + ' / ' + b.totalCredits.toFixed(2);
                }
                html += '</div>';
              } else {
                html += '<div class="bal-line bal-ok">💳 ' + esc(b.message || "Balance available") + '</div>';
              }
            } else {
              html += '<div class="bal-line bal-na">ⓘ ' + esc(b.message || "No balance API") + '</div>';
            }
            // Real session usage (locally measured, this VS Code session)
            var totTok = (u.inputTokensEst || 0) + (u.outputTokensEst || 0);
            html += '<div class="bal-line bal-usage">📊 This session: ' + (u.requests || 0) + ' request(s), ~' +
              totTok.toLocaleString() + ' tokens (≈' + (u.inputTokensEst || 0).toLocaleString() + ' in / ' +
              (u.outputTokensEst || 0).toLocaleString() + ' out)</div>';
            balSlot.style.display = "block";
            balSlot["inner" + "HTML"] = html;
          }
        }
        break;
      }

      case "sessionList":
        renderSessionList(data.sessions || [], data.currentId);
        break;

      case "skillList":
        renderSkillList(data.skills || []);
        break;

      case "agenticProfileList":
        renderAgenticProfiles(data.profiles || [], data.currentId || "");
        hideAgenticEditor();
        break;

      case "dynamicContextSettings":
        renderDynamicContextSettings(data.settings || {});
        break;

      case "settingsData": {
        var st = $("set-temp"), stv = $("set-temp-val"), stk = $("set-tokens"), su = $("set-url");
        if (st && typeof data.temperature === "number") { st.value = String(Math.round(data.temperature * 100)); }
        if (stv && typeof data.temperature === "number") { stv.textContent = data.temperature.toFixed(2); }
        if (stk && typeof data.maxTokens === "number") { stk.value = String(data.maxTokens); }
        if (su && typeof data.ollamaUrl === "string") { su.value = data.ollamaUrl; }
        var scb = $("set-ctxbudget");
        if (scb && typeof data.contextBudgetTokens === "number") { scb.value = String(data.contextBudgetTokens); }
        var sth = $("set-tokens-hint");
        if (sth) {
          var mmo = typeof data.modelMaxOutput === "number" ? data.modelMaxOutput : 0;
          var mcw = typeof data.modelContextWindow === "number" ? data.modelContextWindow : 0;
          var lbl = data.modelLabel ? String(data.modelLabel).split(":").pop() : "model";
          var parts = "<strong>0 = Auto</strong> \u2014 use the selected model's full output limit so long answers are never cut off mid-response.";
          if (mmo > 0) { parts += " Current model <strong>" + esc(lbl) + "</strong>: up to <strong>" + mmo.toLocaleString() + "</strong> output tokens"; if (mcw > 0) { parts += ", <strong>" + mcw.toLocaleString() + "</strong> context window"; } parts += "."; }
          sth["inner" + "HTML"] = parts;
        }
        break;
      }

      case "restoreSession": {
        if (chatContainer) clearNode(chatContainer);
        renderPlan([]);
        (data.messages || []).forEach(function (m) {
          addMessage(m.role, m.content);
        });
        break;
      }

      case "coderqWelcome": {
        var wDiv = document.createElement("div");
        wDiv.className = "message assistant coderq-welcome";
        wDiv["inner" + "HTML"] = '<div class="coderq-avatar">\uD83D\uDC76\uD83D\uDCBB</div>' +
          '<div class="coderq-bubble">' + renderMd(data.content) + '</div>';
        chatContainer.appendChild(wDiv);
        followChatOutput();
        break;
      }

      case "clearChat":
        clearNode(chatContainer);
        renderPlan([]);
        addMessage("system", "Chat cleared");
        break;

      case "pullProgress":
        statusText.textContent = "Pulling: " + (data.progress || "...");
        break;

      case "mcpStatus":
        renderMcpServerList(data.servers || []);
        break;

      case "mcpResult": {
        var mr = $("mcp-result");
        if (mr) {
          mr.textContent = "";
          var span = document.createElement("span");
          span.className = data.ok ? "mcp-ok" : "mcp-err";
          span.textContent = (data.ok ? "OK " : "ERROR ") + (data.message || "");
          mr.appendChild(span);
          if (data.ok) setTimeout(function () { if (mr) mr.textContent = ""; }, 6000);
        }
        break;
      }
    }
  });

  function renderMcpServerList(servers) {
    var list = $("mcp-server-list");
    if (!list) return;
    if (servers.length === 0) {
      var empty = document.createElement("p");
      empty.style.fontSize = "12px";
      empty.style.color = "var(--desc-fg)";
      empty.textContent = 'No MCP servers configured. Add servers in VS Code settings (sentinelCoder.mcpServers) or click "Import from VS Code".';
      list.appendChild(empty);
      return;
    }
    servers.forEach(function (s) {
      var item = document.createElement("div");
      item.className = "mcp-server-item";
      var requires = s.requires || [];
      var envSet = s.envSet || {};

      var envHtml = "";
      requires.forEach(function (k) {
        var ok = envSet[k];
        var isSecret = /KEY|TOKEN|PASS|SECRET|CONNECTION/i.test(k);
        envHtml +=
          '<div class="mcp-env-row">' +
            '<label class="mcp-env-label">' + esc(k) +
              (ok ? ' <span class="mcp-ok">● set</span>' : ' <span class="mcp-err">● required</span>') + '</label>' +
            '<div class="mcp-env-input">' +
              '<input id="mcp-env-' + attr(s.name) + '-' + attr(k) + '" type="' + (isSecret ? 'password' : 'text') + '" placeholder="' + (ok ? 'Saved — enter to replace' : 'Enter value…') + '">' +
              '<button class="action-btn primary" data-mcp-action="save-env" data-server="' + attr(s.name) + '" data-key="' + attr(k) + '">Save</button>' +
            '</div>' +
          '</div>';
      });

      var canConnect = requires.every(function (k) { return envSet[k]; });
      var statusHtml = s.connected
        ? '<span class="connected">● Connected</span> <span class="mcp-server-tools">' + s.toolCount + ' tools</span>'
        : (s.lastError
            ? '<span class="disconnected">● Error</span>'
            : '<span class="disconnected">○ Disconnected</span>');

      item["inner" + "HTML"] =
        '<div class="mcp-server-head">' +
          '<div class="mcp-server-info">' +
            '<span class="mcp-server-name">' + esc(s.name) +
              (s.source && s.source !== "user" ? ' <span class="mcp-source">' + esc(s.source) + '</span>' : '') + '</span>' +
            '<span class="mcp-server-status">' + statusHtml + '</span>' +
          '</div>' +
          '<div class="mcp-server-actions">' +
            (s.connected
              ? '<button class="action-btn danger" data-mcp-action="stop" data-server="' + attr(s.name) + '">Stop</button>'
              : '<button class="action-btn primary" data-mcp-action="connect" data-server="' + attr(s.name) + '"' + (canConnect ? '' : ' disabled title="Fill required settings first"') + '>Connect</button>') +
          '</div>' +
        '</div>' +
        (s.description ? '<div class="mcp-server-desc">' + esc(s.description) + '</div>' : '') +
        envHtml +
        (s.lastError && !s.connected ? '<div class="mcp-server-error">' + esc(s.lastError) + '</div>' : '');
      list.appendChild(item);
    });
  }

  // Request init on load
  vscode.postMessage({ type: "requestInit" });
})();
