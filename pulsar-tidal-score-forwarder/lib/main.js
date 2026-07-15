"use strict";

const http = require("http");
const https = require("https");
const { CompositeDisposable } = require("atom");

module.exports = {
  subscriptions: null,
  saveSubscriptions: null,
  changeSubscriptions: null,
  changeTimers: null,
  evaluationSyncTimer: null,

  activate() {
    this.subscriptions = new CompositeDisposable();
    this.saveSubscriptions = new CompositeDisposable();
    this.changeSubscriptions = new CompositeDisposable();
    this.changeTimers = new WeakMap();

    this.subscriptions.add(
      atom.commands.add("atom-workspace", {
        "tidal-verovio-forwarder:send-active-editor": () => this.sendActiveEditor(),
        "tidal-verovio-forwarder:send-selection-or-line": () => this.sendSelectionOrLine(),
        "tidal-verovio-forwarder:sync-score-clock": () => this.syncScoreClock()
      })
    );

    this.subscriptions.add(
      atom.config.observe("tidal-verovio-forwarder.autoSendOnSave", () => this.configureAutoSendOnSave())
    );
    this.subscriptions.add(
      atom.config.observe("tidal-verovio-forwarder.autoSendOnChange", () => this.configureAutoSendOnChange())
    );
    this.subscriptions.add(
      atom.config.observe("tidal-verovio-forwarder.autoSendDebounceMs", () => this.configureAutoSendOnChange())
    );
    this.subscriptions.add(
      atom.commands.onDidDispatch((event) => this.handleCommandDispatch(event))
    );
  },

  deactivate() {
    if (this.subscriptions) this.subscriptions.dispose();
    if (this.saveSubscriptions) this.saveSubscriptions.dispose();
    if (this.changeSubscriptions) this.changeSubscriptions.dispose();
    if (this.evaluationSyncTimer) clearTimeout(this.evaluationSyncTimer);
  },

  configureAutoSendOnSave() {
    if (this.saveSubscriptions) this.saveSubscriptions.dispose();
    this.saveSubscriptions = new CompositeDisposable();

    if (!atom.config.get("tidal-verovio-forwarder.autoSendOnSave")) return;

    this.saveSubscriptions.add(
      atom.workspace.observeTextEditors((editor) => {
        const buffer = editor.getBuffer();
        const disposable = buffer.onDidSave(() => {
          if (isTidalEditor(editor)) this.sendEditor(editor, { quiet: true });
        });
        this.saveSubscriptions.add(disposable);
      })
    );
  },

  configureAutoSendOnChange() {
    if (this.changeSubscriptions) this.changeSubscriptions.dispose();
    this.changeSubscriptions = new CompositeDisposable();
    this.changeTimers = new WeakMap();

    if (!atom.config.get("tidal-verovio-forwarder.autoSendOnChange")) return;

    this.changeSubscriptions.add(
      atom.workspace.observeTextEditors((editor) => {
        const buffer = editor.getBuffer();
        const disposable = buffer.onDidChange(() => {
          if (!isTidalEditor(editor)) return;
          this.debounceSendEditor(editor);
        });
        this.changeSubscriptions.add(disposable);
      })
    );
  },

  debounceSendEditor(editor) {
    const existing = this.changeTimers.get(editor);
    if (existing) clearTimeout(existing);

    const delay = Math.max(50, Number(atom.config.get("tidal-verovio-forwarder.autoSendDebounceMs") || 250));
    const timer = setTimeout(() => {
      this.changeTimers.delete(editor);
      if (editor.isDestroyed && editor.isDestroyed()) return;
      this.sendEditor(editor, { quiet: true }).catch(() => {});
    }, delay);

    this.changeTimers.set(editor, timer);
  },

  async sendActiveEditor() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      notify("warning", "No active editor to send.");
      return;
    }

    await this.sendEditor(editor);
  },

  async sendSelectionOrLine() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      notify("warning", "No active editor to send.");
      return;
    }

    const selectedText = editor.getSelectedText().trim();
    const raw = selectedText || editor.lineTextForBufferRow(editor.getCursorBufferPosition().row).trim();
    if (!raw) {
      notify("warning", "No selected text or current line to send.");
      return;
    }

    const pattern = extractPatternFromLine(raw);
    if (!pattern) {
      notify("warning", "The selection/current line does not look like a supported Tidal pattern.");
      return;
    }

    await postBridge("/pattern", {
      line: pattern.line,
      kind: pattern.kind,
      pattern: pattern.pattern,
      raw
    });

    notify("success", `Sent ${pattern.line} to score bridge.`);
  },

  async syncScoreClock() {
    await this.sendSyncMessage();

    notify("success", "Synced score clock to cycle 0.");
  },

  async sendEditor(editor, options = {}) {
    const source = editor.getText();
    const selectedLine = options.selectedLine || firstFlaggedLine(source);

    await postBridge("/source", {
      source,
      selectedLine,
      // The full text of the line the performer just evaluated — lets the score
      // page pick the right pattern when an orbit appears on several lines, and
      // recognise mutes (`dN silence`, `_dN …`, `hush`). Empty on plain typing.
      selectedLineText: options.selectedLineText || ""
    });

    if (!options.quiet) {
      notify("success", selectedLine ? `Sent active editor; selected ${selectedLine}.` : "Sent active editor to score bridge.");
    }
  },

  handleCommandDispatch(event) {
    if (!atom.config.get("tidal-verovio-forwarder.syncOnTidalEvaluation")) return;
    if (!event || !event.type) return;
    if (/^tidal-verovio-forwarder:/.test(event.type)) return;
    // Cmd+. and the like fire `tidalcycles:hush` — a panic that mutes every
    // orbit regardless of the cursor line. Handle it before the evaluation path.
    const isHush = isHushCommand(event.type);
    if (!isHush && !isLikelyTidalEvaluationCommand(event.type)) return;

    const editor = atom.workspace.getActiveTextEditor();
    if (!editor || !isTidalEditor(editor)) return;

    if (this.evaluationSyncTimer) clearTimeout(this.evaluationSyncTimer);
    const delay = Math.max(0, Number(atom.config.get("tidal-verovio-forwarder.syncAfterEvaluationDelayMs") || 80));

    this.evaluationSyncTimer = setTimeout(async () => {
      this.evaluationSyncTimer = null;
      try {
        if (isHush) {
          // Panic: tell the score to blank everything, not to read the cursor line.
          await this.sendEditor(editor, { quiet: true, selectedLine: "all", selectedLineText: "hush" });
        } else {
          const selectedLineText = rawEvaluatedLine(editor);
          const evaluatedPattern = extractSelectedOrCurrentPattern(editor);
          await this.sendEditor(editor, {
            quiet: true,
            selectedLine: evaluatedPattern ? evaluatedPattern.line : orbitFromRawLine(selectedLineText),
            selectedLineText
          });
        }
        await this.sendSyncMessage();
      } catch {
        // postBridge already reports the connection problem.
      }
    }, delay);
  },

  async sendSyncMessage() {
    await postBridge("/sync", {
      cycle: 0,
      play: true
    });
  }
};

function isTidalEditor(editor) {
  const path = editor.getPath && editor.getPath();
  if (path && /\.tidal$/i.test(path)) return true;
  const grammar = editor.getGrammar && editor.getGrammar();
  return Boolean(grammar && /tidal/i.test(grammar.name || grammar.scopeName || ""));
}

function firstFlaggedLine(source) {
  const lines = source.split(/\r?\n/);
  let pendingScore = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/@score/.test(trimmed)) {
      pendingScore = true;
      continue;
    }

    const pattern = extractPatternFromLine(trimmed);
    if (pattern && (pendingScore || /@score/.test(trimmed))) return pattern.line;
    pendingScore = false;
  }

  return "";
}

function extractSelectedOrCurrentPattern(editor) {
  const selectedText = editor.getSelectedText && editor.getSelectedText().trim();
  if (selectedText) {
    const selectedPattern = extractPatternFromLine(selectedText);
    if (selectedPattern) return selectedPattern;
  }

  const cursor = editor.getCursorBufferPosition && editor.getCursorBufferPosition();
  if (!cursor) return null;

  const currentLine = editor.lineTextForBufferRow(cursor.row).trim();
  return extractPatternFromLine(currentLine);
}

// The raw text of the line the performer just evaluated (selection's first line,
// else the cursor's line) — pattern OR mute (`dN silence`, `_dN …`, `hush`).
function rawEvaluatedLine(editor) {
  const selectedText = editor.getSelectedText && editor.getSelectedText().trim();
  if (selectedText) return selectedText.split(/\r?\n/)[0].trim();
  const cursor = editor.getCursorBufferPosition && editor.getCursorBufferPosition();
  if (!cursor) return "";
  return editor.lineTextForBufferRow(cursor.row).trim();
}

// Orbit an evaluated line targets: `dN …`/`_dN …`/`dN silence` → "dN"; `hush` →
// "all" (mutes everything); otherwise "".
function orbitFromRawLine(raw) {
  const s = String(raw || "").trim();
  if (/^hush\b/.test(s)) return "all";
  const m = s.match(/^_?(d\d+)\b/);
  return m ? m[1] : "";
}

function extractPatternFromLine(raw) {
  const match = raw.match(/\b(d\d+)\b.*?\b(sound|s|note|n)\s+(?:\([^"]*"([^"]+)"|"([^"]+)")/);
  if (!match) return null;
  return {
    line: match[1],
    kind: match[2],
    pattern: match[3] || match[4]
  };
}

// Panic / stop-all commands: `tidalcycles:hush` (Cmd+.), plus any command whose
// name ends in `hush`/`panic`. These mute every orbit regardless of the cursor.
function isHushCommand(commandName) {
  return /(?::|-|\b)(hush|panic)$/i.test(String(commandName || ""));
}

function isLikelyTidalEvaluationCommand(commandName) {
  const pattern = atom.config.get("tidal-verovio-forwarder.tidalEvaluationCommandPattern") || "";
  try {
    return new RegExp(pattern, "i").test(commandName);
  } catch {
    return /tidal|tidalcycles|tidal-cycles|haskell-ghci/i.test(commandName);
  }
}

function postBridge(path, payload) {
  const base = atom.config.get("tidal-verovio-forwarder.bridgeUrl") || "http://127.0.0.1:8766";
  const url = new URL(path, base);
  const body = JSON.stringify(payload);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Bridge returned ${response.statusCode}: ${data}`));
        }
      });
    });

    request.on("error", (error) => {
      reject(new Error(`Could not reach score bridge at ${url.origin}: ${error.message}`));
    });
    request.write(body);
    request.end();
  }).catch((error) => {
    notify("error", error.message);
    throw error;
  });
}

function notify(type, message) {
  const manager = atom.notifications;
  if (!manager) return;

  if (type === "success") manager.addSuccess(message);
  else if (type === "warning") manager.addWarning(message);
  else manager.addError(message);
}
