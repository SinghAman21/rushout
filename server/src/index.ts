import { createRequire } from "module";
import type { Server as ServerType } from "colyseus";
import { TagRoom } from "./rooms/TagRoom.js";

const require = createRequire(import.meta.url);
const colyseus = require("colyseus") as {
  Server: typeof ServerType;
  ServerOptions?: Record<string, unknown>;
};

const port = Number(process.env.PORT) || 2567;

const gameServer = new colyseus.Server({});

gameServer.define("tag_room", TagRoom).filterBy(["roomCode"]);

gameServer.listen(port).then(() => {
  console.log(`Rushout server listening on port ${port}`);
});
