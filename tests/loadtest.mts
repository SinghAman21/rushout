import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import os from "node:os";

type Args = {
  url: string;
  clients: number;
  roomSize: number;
  durationSec: number;
  inputMs: number;
  joinIntervalMs: number;
  serverPid?: number;
  json?: string;
  help: boolean;
};

type GameFrame = {
  serverTick?: number;
  players?: Array<{
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    isIt: boolean;
    alive: boolean;
    lastProcessedTick?: number;
  }>;
};

type SimClient = {
  client: any;
  room: any;
  roomIndex: number;
  label: string;
  startedAt: number;
  frames: number;
  statePatches: number;
  lastTick: number;
  lastFrameAt: number;
  latestFrame?: GameFrame;
  frameIntervals: number[];
  tickJumps: number[];
  ackTimes: number[];
  sentInputs: Map<number, number>;
  nextClientTick: number;
  sendTimer?: NodeJS.Timeout;
};

type RoomMetrics = {
  index: number;
  code: string;
  clients: SimClient[];
  tickReceipts: Map<number, { signature: string; receivedAt: number[] }>;
  signatureMismatches: number;
  maxSameTickDeliverySkewMs: number;
  crossClientTickSkews: number[];
  playerPositionSpreads: number[];
};

const require = createRequire(new URL("../client/package.json", import.meta.url));
const { Client } = require("colyseus.js");

function parseArgs(argv: string[]): Args {
  const result: Args = {
    url: process.env.RUSHOUT_SERVER_URL ?? "ws://127.0.0.1:2567",
    clients: 26,
    roomSize: 13,
    durationSec: 60,
    inputMs: 33,
    joinIntervalMs: 0,
    help: false,
  };
  const numeric: Record<string, keyof Args> = {
    "--clients": "clients",
    "--room-size": "roomSize",
    "--duration": "durationSec",
    "--input-ms": "inputMs",
    "--join-interval-ms": "joinIntervalMs",
    "--server-pid": "serverPid",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--url") result.url = argv[++i] ?? result.url;
    else if (arg === "--json") result.json = argv[++i];
    else if (numeric[arg]) {
      const key = numeric[arg]!;
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) throw new Error(`Invalid number for ${arg}`);
      (result as any)[key] = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!result.help) {
    if (!Number.isInteger(result.clients) || result.clients < 2) throw new Error("--clients must be an integer of at least 2");
    if (!Number.isInteger(result.roomSize) || result.roomSize < 2 || result.roomSize > 13) throw new Error("--room-size must be an integer between 2 and 13");
    if (!Number.isInteger(result.durationSec) || result.durationSec < 1 || result.durationSec > 170) throw new Error("--duration must be 1–170 seconds (the test round is capped at 180 seconds)");
    if (!Number.isInteger(result.inputMs) || result.inputMs < 16) throw new Error("--input-ms must be an integer of at least 16");
    if (!Number.isInteger(result.joinIntervalMs) || result.joinIntervalMs < 0) throw new Error("--join-interval-ms cannot be negative");
    if (result.serverPid !== undefined && (!Number.isInteger(result.serverPid) || result.serverPid <= 0)) throw new Error("--server-pid must be a positive process id");
  }
  return result;
}

function printHelp() {
  console.log(`Rushout multiplayer load and sync test

Usage:
  npm run loadtest -- [options]

Options:
  --url URL               Colyseus WebSocket URL (default ws://127.0.0.1:2567)
  --clients N             Simulated players (default 26)
  --room-size N           Players per room, 2–13 (default 13)
  --duration N            Gameplay measurement time in seconds, 1–170 (default 60)
  --input-ms N            Input cadence in milliseconds (default 33, matching the client)
  --join-interval-ms N    Delay between joins within each room (default 0)
  --server-pid PID        Also sample Linux /proc CPU and RSS for the local server process
  --json PATH             Write the full report as JSON
  --help                  Show this help

Example:
  npm run loadtest -- --clients 52 --room-size 13 --duration 90 --server-pid 12345 --json load-report.json`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)].toFixed(2));
}

function distribution(values: number[]) {
  return {
    samples: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Number(Math.max(...values).toFixed(2)) : null,
  };
}

function positionSignature(frame: GameFrame): string {
  return JSON.stringify((frame.players ?? []).map(p => [p.id, p.x, p.y, p.vx, p.vy, p.isIt, p.alive]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "R");
}

function allocateGroups(total: number, roomSize: number): number[] {
  const groups = Math.ceil(total / roomSize);
  const base = Math.floor(total / groups);
  const extra = total % groups;
  return Array.from({ length: groups }, (_, index) => base + (index < extra ? 1 : 0));
}

async function readServerSample(pid: number) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    const endCommand = stat.lastIndexOf(")");
    const fields = stat.slice(endCommand + 2).trim().split(/\s+/);
    const ticks = Number(fields[11]) + Number(fields[12]); // utime + stime (fields 14 + 15)
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const rssKb = Number(status.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1] ?? 0);
    return { ticks, rssMb: Number((rssKb / 1024).toFixed(1)), ticksPerSecond: 100 };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, description: string) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const groupSizes = allocateGroups(args.clients, args.roomSize);
const rooms: RoomMetrics[] = [];
const allClients: SimClient[] = [];
const setupErrors: Array<{ room: number; player: string; error: string }> = [];
const clientConnectTimes: number[] = [];
const startWallTime = Date.now();
const cpuStart = process.cpuUsage();
const serverStart = args.serverPid ? await readServerSample(args.serverPid) : undefined;

function trackRoomClient(client: any, room: any, roomIndex: number, label: string): SimClient {
  const sim: SimClient = {
    client,
    room,
    roomIndex,
    label,
    startedAt: Date.now(),
    frames: 0,
    statePatches: 0,
    lastTick: 0,
    lastFrameAt: 0,
    frameIntervals: [],
    tickJumps: [],
    ackTimes: [],
    sentInputs: new Map(),
    nextClientTick: 0,
  };
  allClients.push(sim);
  rooms[roomIndex]!.clients.push(sim);

  room.onMessage("*", () => {});
  room.onStateChange(() => { sim.statePatches++; });
  room.onMessage("gameFrame", (frame: GameFrame) => {
    sim.latestFrame = frame;
    const receivedAt = Date.now();
    sim.frames++;
    if (sim.lastFrameAt) sim.frameIntervals.push(receivedAt - sim.lastFrameAt);
    sim.lastFrameAt = receivedAt;

    if (typeof frame.serverTick === "number") {
      if (sim.lastTick && frame.serverTick > sim.lastTick) sim.tickJumps.push(frame.serverTick - sim.lastTick);
      sim.lastTick = frame.serverTick;
      const signature = positionSignature(frame);
      let receipt = rooms[roomIndex]!.tickReceipts.get(frame.serverTick);
      if (!receipt) {
        receipt = { signature, receivedAt: [] };
        rooms[roomIndex]!.tickReceipts.set(frame.serverTick, receipt);
      } else if (receipt.signature !== signature) {
        rooms[roomIndex]!.signatureMismatches++;
      }
      receipt.receivedAt.push(receivedAt);
      if (receipt.receivedAt.length > 1) {
        const skew = Math.max(...receipt.receivedAt) - Math.min(...receipt.receivedAt);
        rooms[roomIndex]!.maxSameTickDeliverySkewMs = Math.max(rooms[roomIndex]!.maxSameTickDeliverySkewMs, skew);
      }
      const oldestTick = frame.serverTick - 1200;
      for (const tick of rooms[roomIndex]!.tickReceipts.keys()) {
        if (tick < oldestTick) rooms[roomIndex]!.tickReceipts.delete(tick);
      }
    }

    const ownPlayer = frame.players?.find(player => player.id === room.sessionId);
    const ack = ownPlayer?.lastProcessedTick;
    if (typeof ack === "number" && ack > 0) {
      const sentAt = sim.sentInputs.get(ack);
      if (sentAt !== undefined) sim.ackTimes.push(receivedAt - sentAt);
      for (const tick of sim.sentInputs.keys()) if (tick <= ack) sim.sentInputs.delete(tick);
    }
  });
  return sim;
}

async function connectPlayer(roomIndex: number, name: string, host: boolean, roomCode?: string) {
  const client = new Client(args.url);
  const startedAt = Date.now();
  try {
    const room = host
      ? await client.create("tag_room", {
          roomCode,
          hostKey: `loadtest-${roomCode}`,
          name,
          config: { roundLength: 180, mapName: "small_arena", powerUpsEnabled: true },
        })
      : await client.join("tag_room", { roomCode, name });
    clientConnectTimes.push(Date.now() - startedAt);
    return trackRoomClient(client, room, roomIndex, name);
  } catch (error) {
    setupErrors.push({ room: roomIndex + 1, player: name, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function beginInput(sim: SimClient, phaseOrigin: number) {
  sim.sendTimer = setInterval(() => {
    const elapsed = Date.now() - phaseOrigin;
    const phase = Math.floor((elapsed + allClients.indexOf(sim) * 173) / 900);
    const direction = (phase % 4) as 0 | 1 | 2 | 3;
    const masks = [8, 4, 9, 5]; // move right, left, jump+right, jump+left
    const jump = elapsed % 1400 < args.inputMs;
    const clientTick = ++sim.nextClientTick;
    sim.sentInputs.set(clientTick, Date.now());
    sim.room.send("input", { clientTick, mask: masks[direction], jump });
    // An overloaded/offline peer should not grow an unbounded local ack queue.
    while (sim.sentInputs.size > 250) sim.sentInputs.delete(sim.sentInputs.keys().next().value!);
  }, args.inputMs);
}

function sampleCrossClientSync() {
  for (const group of rooms) {
    const snapshots = group.clients
      .filter(client => client.lastTick > 0)
      .map(client => ({ tick: client.lastTick, frame: client.latestFrame }))
      .filter(entry => entry.frame);
    if (snapshots.length < 2) continue;
    const ticks = snapshots.map(entry => entry.tick);
    group.crossClientTickSkews.push(Math.max(...ticks) - Math.min(...ticks));

    const playerPositions = new Map<string, Array<{ x: number; y: number }>>();
    for (const snapshot of snapshots) {
      snapshot.frame.players?.forEach((player, key) => {
        const id = player.id || String(key);
        const positions = playerPositions.get(id) ?? [];
        positions.push({ x: player.x, y: player.y });
        playerPositions.set(id, positions);
      });
    }
    let maxSpread = 0;
    for (const positions of playerPositions.values()) {
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          maxSpread = Math.max(maxSpread, Math.hypot(positions[i]!.x - positions[j]!.x, positions[i]!.y - positions[j]!.y));
        }
      }
    }
    group.playerPositionSpreads.push(maxSpread);
  }
}

function resetMeasurementCounters(sim: SimClient) {
  sim.frames = 0;
  sim.statePatches = 0;
  sim.lastTick = 0;
  sim.lastFrameAt = 0;
  sim.latestFrame = undefined;
  sim.frameIntervals = [];
  sim.tickJumps = [];
  sim.ackTimes = [];
  sim.sentInputs.clear();
}

async function main() {
  console.log(`Rushout load test → ${args.url}`);
  console.log(`Preparing ${args.clients} clients across ${groupSizes.length} room(s): ${groupSizes.join(", ")} players; ${args.durationSec}s gameplay; ${args.inputMs}ms input cadence.`);

  for (let index = 0; index < groupSizes.length; index++) {
    const code = createRoomCode();
    rooms.push({ index, code, clients: [], tickReceipts: new Map(), signatureMismatches: 0, maxSameTickDeliverySkewMs: 0, crossClientTickSkews: [], playerPositionSpreads: [] });
    const host = await connectPlayer(index, `Load-${index + 1}-Host`, true, code);
    if (!host) continue;

    const joins = Array.from({ length: groupSizes[index]! - 1 }, (_, guestIndex) => async () => {
      const guest = await connectPlayer(index, `Load-${index + 1}-${guestIndex + 2}`, false, code);
      if (guest && args.joinIntervalMs) await sleep(args.joinIntervalMs);
    });
    // A small burst of concurrent joins models a room invite wave while keeping
    // the default load bounded and repeatable.
    const concurrency = Math.min(4, joins.length);
    let nextJoin = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (nextJoin < joins.length) {
        const join = joins[nextJoin++]!;
        await join();
      }
    }));
  }

  const playableRooms = rooms.filter(group => group.clients.length >= 2);
  for (const group of playableRooms) {
    for (const sim of group.clients.slice(1)) sim.room.send("ready");
  }
  await sleep(300);
  for (const group of playableRooms) {
    group.clients[0]?.room.send("startGame");
  }

  await waitUntil(() => playableRooms.every(group => group.clients[0]?.room.state.gameStarted), 5000, "all load-test rooms to start");
  await sleep(3400); // Let the server's visible 3-second countdown finish before measuring movement.
  for (const sim of allClients) resetMeasurementCounters(sim);
  for (const group of rooms) {
    group.tickReceipts.clear();
    group.signatureMismatches = 0;
    group.maxSameTickDeliverySkewMs = 0;
    group.crossClientTickSkews = [];
    group.playerPositionSpreads = [];
  }
  const measureStart = Date.now();
  for (const sim of allClients) beginInput(sim, measureStart);
  const samplingTimer = setInterval(sampleCrossClientSync, 100);
  const memoryStart = process.memoryUsage().rss;
  await sleep(args.durationSec * 1000);
  clearInterval(samplingTimer);
  for (const sim of allClients) if (sim.sendTimer) clearInterval(sim.sendTimer);
  const measurementMs = Date.now() - measureStart;
  const cpu = process.cpuUsage(cpuStart);
  const serverEnd = args.serverPid ? await readServerSample(args.serverPid) : undefined;
  const elapsedSec = (Date.now() - startWallTime) / 1000;
  const serverCpu = serverStart && serverEnd && "ticks" in serverStart && "ticks" in serverEnd
    ? Number((((serverEnd.ticks - serverStart.ticks) / serverStart.ticksPerSecond / elapsedSec / os.cpus().length) * 100).toFixed(1))
    : null;
  const serverCpuOneCore = serverStart && serverEnd && "ticks" in serverStart && "ticks" in serverEnd
    ? Number((((serverEnd.ticks - serverStart.ticks) / serverStart.ticksPerSecond / elapsedSec) * 100).toFixed(1))
    : null;

  const allFrameIntervals = allClients.flatMap(client => client.frameIntervals);
  const allInputAcks = allClients.flatMap(client => client.ackTimes);
  const frameRates = allClients.map(client => client.frames / (measurementMs / 1000));
  const patchRates = allClients.map(client => client.statePatches / (measurementMs / 1000));
  const tickJumps = allClients.flatMap(client => client.tickJumps);
  const estimatedMissedFrames = tickJumps.reduce((sum, jump) => sum + Math.max(0, Math.floor((jump - 2) / 2)), 0);
  const roomReports = rooms.map(group => ({
    room: group.index + 1,
    roomCode: group.code,
    joinedClients: group.clients.length,
    framesPerClient: group.clients.map(client => client.frames),
    sameTickSnapshotMismatches: group.signatureMismatches,
    maxSameTickDeliverySkewMs: group.maxSameTickDeliverySkewMs,
    crossClientTickSkew: distribution(group.crossClientTickSkews),
    maxObservedPlayerPositionSpreadPx: group.playerPositionSpreads.length ? Number(Math.max(...group.playerPositionSpreads).toFixed(1)) : null,
    p95ObservedPlayerPositionSpreadPx: percentile(group.playerPositionSpreads, 95),
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    target: args.url,
    configuration: { requestedClients: args.clients, roomSizes: groupSizes, inputIntervalMs: args.inputMs, measurementSeconds: Number((measurementMs / 1000).toFixed(2)), joinIntervalMs: args.joinIntervalMs },
    connections: { joined: allClients.length, failed: setupErrors.length, joinTimeMs: distribution(clientConnectTimes), errors: setupErrors },
    sync: {
      expectedGameFrameRateHz: 30,
      observedGameFramesPerClientHz: distribution(frameRates),
      expectedStatePatchRateHz: 20,
      observedStatePatchRatePerClientHz: distribution(patchRates),
      frameArrivalIntervalMs: distribution(allFrameIntervals),
      inputToAuthoritativeAckMs: distribution(allInputAcks),
      estimatedMissedFrameCount: estimatedMissedFrames,
      maxObservedServerTickJump: tickJumps.length ? Math.max(...tickJumps) : null,
      sameTickSnapshotMismatches: rooms.reduce((sum, group) => sum + group.signatureMismatches, 0),
      maxSameTickDeliverySkewMs: rooms.length ? Math.max(...rooms.map(group => group.maxSameTickDeliverySkewMs)) : 0,
      roomReports,
    },
    process: {
      loadHarnessCpuMs: { user: Math.round(cpu.user / 1000), system: Math.round(cpu.system / 1000) },
      loadHarnessRssDeltaMb: Number(((process.memoryUsage().rss - memoryStart) / 1024 / 1024).toFixed(1)),
      localServerCpuPercentOfMachine: serverCpu,
      localServerCpuPercentOfOneCore: serverCpuOneCore,
      localServerRssMb: serverEnd && "rssMb" in serverEnd ? serverEnd.rssMb : null,
      serverProcessSampleError: serverEnd && "error" in serverEnd ? serverEnd.error : null,
    },
    notes: [
      "Input ack is measured from client send until a gameFrame acknowledges that clientTick; it includes server processing and network return time.",
      "Same-tick consistency compares the exact authoritative player snapshot delivered to multiple clients.",
      "Position spread and tick skew compare clients' most recently received snapshots and expose observer disagreement.",
      "Server CPU/RSS is reported only when --server-pid points to a local Linux process. Harness CPU is always reported.",
      "Estimated missed frames infer 30 Hz frame skips from 60 Hz serverTick gaps; treat this as an approximation.",
    ],
  };

  console.log("\n=== Rushout sync and load report ===");
  console.log(`Clients joined: ${allClients.length}/${args.clients} across ${rooms.length} room(s)`);
  console.log(`Join time: p50 ${report.connections.joinTimeMs.p50 ?? "—"}ms · p95 ${report.connections.joinTimeMs.p95 ?? "—"}ms`);
  console.log(`Game frames/client: p50 ${report.sync.observedGameFramesPerClientHz.p50 ?? "—"}Hz · p95 ${report.sync.observedGameFramesPerClientHz.p95 ?? "—"}Hz (target 30Hz)`);
  console.log(`State patches/client: p50 ${report.sync.observedStatePatchRatePerClientHz.p50 ?? "—"}Hz · p95 ${report.sync.observedStatePatchRatePerClientHz.p95 ?? "—"}Hz (target 20Hz)`);
  console.log(`Input-to-authoritative-ack: p50 ${report.sync.inputToAuthoritativeAckMs.p50 ?? "—"}ms · p95 ${report.sync.inputToAuthoritativeAckMs.p95 ?? "—"}ms`);
  console.log(`Frame arrival interval: p50 ${report.sync.frameArrivalIntervalMs.p50 ?? "—"}ms · p95 ${report.sync.frameArrivalIntervalMs.p95 ?? "—"}ms`);
  console.log(`Same-tick state mismatches: ${report.sync.sameTickSnapshotMismatches} · max same-frame delivery skew: ${report.sync.maxSameTickDeliverySkewMs}ms`);
  console.log(`Estimated missed frames: ${estimatedMissedFrames} · max server tick jump: ${report.sync.maxObservedServerTickJump ?? "—"}`);
  console.log(`Harness CPU: ${report.process.loadHarnessCpuMs.user + report.process.loadHarnessCpuMs.system}ms · RSS change: ${report.process.loadHarnessRssDeltaMb}MB`);
  if (serverCpu !== null) console.log(`Local server CPU: ${serverCpuOneCore}% of one core (${serverCpu}% of machine) · RSS: ${report.process.localServerRssMb ?? "—"}MB`);
  for (const room of roomReports) {
    console.log(`Room ${room.room}: ${room.joinedClients} clients · tick skew p95 ${room.crossClientTickSkew.p95 ?? "—"} · position spread p95 ${room.p95ObservedPlayerPositionSpreadPx ?? "—"}px`);
  }
  if (setupErrors.length) console.log(`\nJoin failures: ${setupErrors.length} (see JSON for details)`);
  if (args.json) {
    await mkdir(dirname(resolve(args.json)), { recursive: true });
    await writeFile(args.json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`JSON report written to ${args.json}`);
  }
  return setupErrors.length > 0 ? 1 : 0;
}

let exitCode = 0;
try {
  exitCode = await main();
} catch (error) {
  console.error(`Load test failed: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  await Promise.allSettled(allClients.map(async sim => {
    if (sim.sendTimer) clearInterval(sim.sendTimer);
    await sim.room.leave();
  }));
}
process.exitCode = exitCode;
