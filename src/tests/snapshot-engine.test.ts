import {
  SnapshotEngine,
  SNAPSHOT_ENGINE_VERSION,
} from "@/runtime/snapshot-engine";

const engine = new SnapshotEngine();
const snapshot = engine.capture();

// Metadata
console.assert(snapshot.version === SNAPSHOT_ENGINE_VERSION, "version tag");
console.assert(
  typeof snapshot.generatedAt === "string" &&
    !Number.isNaN(Date.parse(snapshot.generatedAt)),
  "generatedAt is an ISO timestamp"
);

// Git
console.assert(typeof snapshot.git.branch === "string", "git.branch is string");
console.assert(typeof snapshot.git.commit === "string", "git.commit is string");
console.assert(Array.isArray(snapshot.git.status), "git.status is array");

// Inventories are present and self-referential where expected.
console.assert(Array.isArray(snapshot.runtime), "runtime inventory is array");
console.assert(
  snapshot.runtime.includes("src/runtime/snapshot-engine.ts"),
  "runtime inventory includes the engine itself"
);
console.assert(
  snapshot.providers.includes("src/providers/provider-port.ts"),
  "provider inventory includes provider-port"
);
console.assert(
  snapshot.missions.every(m => m.endsWith(".json")),
  "missions inventory holds .json contracts"
);

// Commits + TODOs
console.assert(Array.isArray(snapshot.recentCommits), "recentCommits is array");
console.assert(Array.isArray(snapshot.todos), "todos is array");
console.assert(
  snapshot.todos.every(
    t =>
      typeof t.file === "string" &&
      typeof t.line === "number" &&
      typeof t.text === "string"
  ),
  "todo entries are well-formed"
);

// Render produces the ODG snapshot layout.
const md = engine.render(snapshot);
console.assert(md.startsWith("# ODG Snapshot"), "render has snapshot header");
console.assert(md.includes("## Runtime"), "render has Runtime section");
console.assert(md.includes("## TODO/FIXME"), "render has TODO/FIXME section");

// Missing directories degrade gracefully to empty inventories.
const empty = new SnapshotEngine({
  runtimeDir: "does/not/exist",
  providersDir: "does/not/exist",
  missionsDir: "does/not/exist",
  todoScanPaths: ["does/not/exist"],
}).capture();
console.assert(empty.runtime.length === 0, "missing runtime dir -> []");
console.assert(empty.providers.length === 0, "missing providers dir -> []");
console.assert(empty.missions.length === 0, "missing missions dir -> []");
console.assert(empty.todos.length === 0, "missing todo scan paths -> []");

console.log("Snapshot Engine OK");
