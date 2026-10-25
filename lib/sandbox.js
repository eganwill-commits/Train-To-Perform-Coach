/*
  "View as athlete" sandbox.

  The coach's preview renders the real athlete app so it looks and behaves exactly as the
  athlete sees it: every button works, numbers can be typed, sessions marked, messages
  sent. None of it may reach the athlete's real data, so while the sandbox is on:

  - supabase reads go through untouched (the preview shows the athlete's real program,
    logs and messages);
  - supabase writes (insert / upsert / update / delete / rpc) and storage uploads resolve
    as if they succeeded, echoing back the rows that would have been written, but nothing
    is sent;
  - POSTs to /api/push and /api/voice are answered locally, so no notification goes out
    and no audio is generated.

  The app keeps the echoed rows in component state, so changes stay on screen until the
  coach exits the preview, then disappear.
*/

let on = false;
let realFetch = null;

export const isSandbox = () => on;

export function setSandbox(value) {
  const next = !!value;
  if (next === on) return;
  on = next;
  if (typeof window === "undefined") return;
  if (on) {
    realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      if (method !== "GET" && (path.startsWith("/api/push") || path.startsWith("/api/voice"))) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, sandbox: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return realFetch(input, init);
    };
  } else if (realFetch) {
    window.fetch = realFetch;
    realFetch = null;
  }
}

const WRITES = new Set(["insert", "upsert", "update", "delete"]);

const newId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// A chainable stand-in for a write query: every filter/modifier returns the chain, and
// awaiting it yields { data, error: null } shaped like the real response.
function fakeWrite(op, args) {
  const now = new Date().toISOString();
  const filters = {};
  let rows;
  if (op === "insert" || op === "upsert") {
    const input = Array.isArray(args[0]) ? args[0] : [args[0] || {}];
    rows = input.map(r => ({ id: newId(), created_at: now, ...r }));
  } else if (op === "update") {
    rows = [{ ...(args[0] || {}) }];
  } else {
    rows = [];
  }
  let single = false;
  let wantRows = op !== "delete";
  const result = () => {
    const merged = rows.map(r => ({ ...filters, ...r }));
    const data = !wantRows ? null : single ? (merged[0] ?? null) : merged;
    return { data, error: null, status: op === "insert" ? 201 : 200, statusText: "OK", count: merged.length };
  };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (res, rej) => Promise.resolve(result()).then(res, rej);
      if (prop === "catch") return (rej) => Promise.resolve(result()).catch(rej);
      if (prop === "finally") return (fn) => Promise.resolve(result()).finally(fn);
      return (...a) => {
        if (prop === "single" || prop === "maybeSingle") single = true;
        if (prop === "select") wantRows = true;
        // Remember simple equality filters so an update echoes the row's id.
        if (prop === "eq" && typeof a[0] === "string") filters[a[0]] = a[1];
        return chain;
      };
    },
  });
  return chain;
}

function wrapTable(builder) {
  return new Proxy(builder, {
    get(target, prop) {
      if (on && WRITES.has(prop)) return (...args) => fakeWrite(prop, args);
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

function wrapBucket(bucket) {
  return new Proxy(bucket, {
    get(target, prop) {
      if (on && (prop === "upload" || prop === "update" || prop === "uploadToSignedUrl")) {
        return async (path) => ({ data: { path, id: newId(), fullPath: path }, error: null });
      }
      if (on && (prop === "remove" || prop === "move" || prop === "copy")) {
        return async () => ({ data: [], error: null });
      }
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

// Wraps a supabase-js client. With the sandbox off it is the client, unchanged.
export function sandboxed(client) {
  const storage = new Proxy(client.storage, {
    get(target, prop) {
      if (prop === "from") return (bucket) => (on ? wrapBucket(target.from(bucket)) : target.from(bucket));
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "from") return (table) => (on ? wrapTable(target.from(table)) : target.from(table));
      if (prop === "storage") return on ? storage : target.storage;
      if (prop === "rpc" && on) return async () => ({ data: null, error: null });
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
