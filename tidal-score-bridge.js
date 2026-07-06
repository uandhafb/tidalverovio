#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const dgram = require("dgram");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(readArg("--port") || process.env.TIDAL_SCORE_PORT || 8766);
const HOST = readArg("--host") || process.env.TIDAL_SCORE_HOST || "127.0.0.1";
const OSC_PORT = Number(readArg("--osc-port") || process.env.TIDAL_SCORE_OSC_PORT || 6011);
const DISABLE_OSC = process.argv.includes("--no-osc");
const WATCH_FILE = readArg("--watch");
const ROOT = __dirname;
const clients = new Set();

let lastSource = "";

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      writeCors(res, 204);
      res.end();
      return;
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      serveFile(res, path.join(ROOT, "index.html"), "text/html; charset=utf-8");
      return;
    }

    // The locally-bundled Verovio engine — index.html loads it from here,
    // so the whole system runs with no internet.
    if (req.method === "GET" && req.url === "/verovio-toolkit-wasm.js") {
      serveFile(res, path.join(ROOT, "verovio-toolkit-wasm.js"), "application/javascript; charset=utf-8");
      return;
    }

    // Performer Window 2 — the growing organism score.
    if (req.method === "GET" && req.url === "/performer2.html") {
      serveFile(res, path.join(ROOT, "performer2.html"), "text/html; charset=utf-8");
      return;
    }
    if (req.method === "GET" && req.url === "/leaflet.js") {
      serveFile(res, path.join(ROOT, "leaflet.js"), "application/javascript; charset=utf-8");
      return;
    }
    if (req.method === "GET" && req.url === "/leaflet.css") {
      serveFile(res, path.join(ROOT, "leaflet.css"), "text/css; charset=utf-8");
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      writeJson(res, 200, { ok: true, clients: clients.size, watch: WATCH_FILE || null });
      return;
    }

    if (req.method === "POST" && req.url === "/pattern") {
      const body = await readJson(req);
      const message = {
        type: "pattern-update",
        line: body.line,
        pattern: body.pattern,
        kind: body.kind || "s",
        raw: body.raw
      };
      broadcast(message);
      writeJson(res, 200, { ok: true, sent: message });
      return;
    }

    if (req.method === "POST" && req.url === "/source") {
      const body = await readJson(req);
      const message = {
        type: "source-update",
        source: String(body.source || ""),
        selectedLine: body.selectedLine || body.line || ""
      };
      broadcast(message);
      writeJson(res, 200, { ok: true, sent: { type: message.type, selectedLine: message.selectedLine } });
      return;
    }

    if (req.method === "POST" && req.url === "/cycle") {
      const body = await readJson(req);
      const message = { type: "cycle", cycle: Number(body.cycle || 0) };
      broadcast(message);
      writeJson(res, 200, { ok: true, sent: message });
      return;
    }

    if (req.method === "POST" && req.url === "/clock") {
      const body = await readJson(req);
      const message = {
        type: "clock",
        source: "http",
        cycle: Number(body.cycle || 0),
        cps: Number(body.cps || 0)
      };
      broadcast(message);
      writeJson(res, 200, { ok: true, sent: message });
      return;
    }

    if (req.method === "POST" && req.url === "/sync") {
      const body = await readJson(req);
      const message = {
        type: "sync",
        cycle: Number(body.cycle || 0),
        play: body.play !== false
      };
      broadcast(message);
      writeJson(res, 200, { ok: true, sent: message });
      return;
    }

    if (req.method === "POST" && req.url === "/message") {
      const body = await readJson(req);
      broadcast(body);
      writeJson(res, 200, { ok: true, sent: body });
      return;
    }

    writeJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    writeJson(res, 400, { ok: false, error: error.message });
  }
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  socket.on("data", () => {});

  send(socket, { type: "bridge-status", ok: true, clients: clients.size });
  if (lastSource) {
    send(socket, { type: "source-update", source: lastSource, selectedLine: firstFlaggedLine(lastSource) });
  }
});

server.on("error", (error) => {
  console.error(`Bridge failed to start on ${HOST}:${PORT}: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Tidal score bridge listening on http://${HOST}:${PORT}`);
  console.log(`Performer page: http://${HOST}:${PORT}/index.html`);
  console.log(`WebSocket URL: ws://${HOST}:${PORT}`);
  if (WATCH_FILE) startWatching(WATCH_FILE);
  if (!DISABLE_OSC) startOscClockReceiver();
});

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      writeJson(res, 404, { ok: false, error: error.message });
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function writeCors(res, status) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
}

function writeJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const socket of [...clients]) {
    try {
      sendRaw(socket, payload);
    } catch {
      clients.delete(socket);
    }
  }
}

function send(socket, message) {
  sendRaw(socket, JSON.stringify(message));
}

function sendRaw(socket, payload) {
  if (socket.destroyed) return;
  const data = Buffer.from(payload);
  let header;

  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }

  socket.write(Buffer.concat([header, data]));
}

function startWatching(filePath) {
  const absolute = path.resolve(filePath);
  console.log(`Watching ${absolute}`);
  publishWatchedFile(absolute);

  fs.watchFile(absolute, { interval: 250 }, () => {
    publishWatchedFile(absolute);
  });
}

function publishWatchedFile(filePath) {
  fs.readFile(filePath, "utf8", (error, source) => {
    if (error) {
      console.error(`Watch read failed: ${error.message}`);
      return;
    }

    if (source === lastSource) return;
    lastSource = source;
    const selectedLine = firstFlaggedLine(source);
    broadcast({ type: "source-update", source, selectedLine });
    console.log(`Sent source update${selectedLine ? ` for ${selectedLine}` : ""}.`);
  });
}

function firstFlaggedLine(source) {
  const lines = source.split(/\r?\n/);
  let pendingScore = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/@score/.test(trimmed)) {
      pendingScore = true;
      continue;
    }
    const match = trimmed.match(/\b(d\d+)\b.*?(?:sound|s|note|n)\s+"([^"]+)"/);
    if (match && (pendingScore || /@score/.test(trimmed))) return match[1];
    pendingScore = false;
  }
  return "";
}

function startOscClockReceiver() {
  const udp = dgram.createSocket("udp4");

  udp.on("message", (buffer) => {
    for (const message of parseOscPacket(buffer)) {
      const event = oscMessageToEvent(message);
      if (!event) continue;
      broadcast(event);
      broadcast({
        type: "clock",
        source: event.source,
        address: event.address,
        cps: event.cps,
        cycle: event.cycle,
        receivedAt: event.receivedAt
      });
    }
  });

  udp.on("error", (error) => {
    console.error(`OSC clock receiver failed on ${HOST}:${OSC_PORT}: ${error.message}`);
    udp.close();
  });

  udp.bind(OSC_PORT, HOST, () => {
    console.log(`OSC clock receiver: udp://${HOST}:${OSC_PORT}`);
  });
}

function parseOscPacket(buffer, start = 0, end = buffer.length) {
  const first = readOscString(buffer, start);
  if (!first) return [];

  if (first.value === "#bundle") {
    let offset = first.next + 8;
    const messages = [];
    while (offset + 4 <= end) {
      const size = buffer.readInt32BE(offset);
      offset += 4;
      if (size <= 0 || offset + size > end) break;
      messages.push(...parseOscPacket(buffer, offset, offset + size));
      offset += size;
    }
    return messages;
  }

  const address = first.value;
  const typeTags = readOscString(buffer, first.next);
  if (!typeTags || !typeTags.value.startsWith(",")) return [];

  let offset = typeTags.next;
  const args = [];
  for (const tag of typeTags.value.slice(1)) {
    if (tag === "s") {
      const read = readOscString(buffer, offset);
      if (!read) break;
      args.push(read.value);
      offset = read.next;
    } else if (tag === "i") {
      args.push(buffer.readInt32BE(offset));
      offset += 4;
    } else if (tag === "f") {
      args.push(buffer.readFloatBE(offset));
      offset += 4;
    } else if (tag === "d") {
      args.push(buffer.readDoubleBE(offset));
      offset += 8;
    } else if (tag === "T") {
      args.push(true);
    } else if (tag === "F") {
      args.push(false);
    } else {
      break;
    }
  }

  return [{ address, args }];
}

function readOscString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  if (end >= buffer.length) return null;
  const value = buffer.toString("utf8", offset, end);
  return { value, next: align4(end + 1) };
}

function align4(value) {
  return value + ((4 - (value % 4)) % 4);
}

function oscMessageToEvent(message) {
  const data = {};
  for (let i = 0; i < message.args.length - 1; i += 2) {
    if (typeof message.args[i] === "string") data[message.args[i]] = message.args[i + 1];
  }

  const cps = numberFrom(data.cps);
  const cycle = numberFrom(data.cycle ?? data.cyc ?? data.c);
  const delta = numberFrom(data.delta);
  if (!Number.isFinite(cps) || !Number.isFinite(cycle) || !Number.isFinite(delta)) {
    console.warn(`Ignoring OSC message missing cps/cycle/delta on ${message.address}:`, data);
    return null;
  }

  const { orbit, note, n, s, gain, cps: _cps, cycle: _cycle, cyc: _cyc, c: _c, delta: _delta, ...params } = data;

  return {
    type: "tidal-event",
    source: "tidal-osc",
    address: message.address,
    cps,
    cycle,
    delta,
    orbit,
    note,
    n,
    s,
    gain,
    params,
    receivedAt: Date.now()
  };
}

function numberFrom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}
