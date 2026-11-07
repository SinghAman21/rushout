# Multiplayer load and sync testing

Rushout includes a Colyseus client load harness at `tests/loadtest.mts`. It creates real rooms, connects simulated players, starts gameplay, sends movement and jump inputs, samples received game frames, and leaves every room when the run ends.

## Run a quick check

Start the server in one terminal:

```bash
npm run dev:server
```

Run a small load in another terminal:

```bash
npm run loadtest -- --clients 8 --room-size 8 --duration 15
```

## Stress a local server

Each room supports at most 13 players. The default run connects 26 clients to two rooms and simulates a 33 ms input cadence for 60 seconds:

```bash
npm run loadtest
```

For a larger local run, pass the server process ID to sample its CPU and resident memory on Linux:

```bash
npm run dev:server
# In another terminal, find the Node server PID, then:
npm run loadtest -- --clients 104 --room-size 13 --duration 90 --server-pid 12345 --json artifacts/load-report.json
```

Use gradual connection waves when measuring server join pressure:

```bash
npm run loadtest -- --clients 52 --room-size 13 --duration 60 --join-interval-ms 100
```

The script accepts `--url`, `--clients`, `--room-size`, `--duration`, `--input-ms`, `--join-interval-ms`, `--server-pid`, and `--json`. Run `npm run loadtest -- --help` for defaults and validation limits. It caps a measurement at 170 seconds because the simulated round is configured for 180 seconds.

## What the report measures

- **Join time:** time from starting each create/join request until the client receives a room.
- **Game frame and state patch rates:** client-observed `gameFrame` frequency (30 Hz target) and Colyseus state patch frequency (20 Hz target), plus frame arrival intervals.
- **Input-to-authoritative-ack:** time from sending a numbered input until a game frame reports that exact input sequence as processed. This includes server processing and the return network path; it is not a pure network RTT.
- **Same-tick snapshot mismatches:** authoritative player snapshots delivered to clients for the same server tick should match. Any mismatch is reported.
- **Tick skew and position spread:** compare each room’s clients’ most recently received state to estimate how far behind peers are observing. These are client-observed sync indicators, not server-side truth.
- **Estimated missed frames:** approximated from gaps in the server’s 60 Hz simulation tick carried by 30 Hz game frames.
- **Harness CPU and memory:** resource use of the load generator itself. When `--server-pid` is supplied on Linux, the report also samples local server CPU and RSS from `/proc`.

Run the same client count, duration, input cadence, and server machine configuration before and after a networking change. Compare p50/p95 values and missed frame counts; do not interpret one run as a capacity guarantee. Remote server CPU/RSS are not available to this local harness, and high client-side resource use can distort the measurements.
