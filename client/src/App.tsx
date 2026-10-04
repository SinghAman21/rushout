import { Routes, Route } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import MainMenu from "./pages/MainMenu.js";
import LocalPlay from "./pages/LocalPlay.js";
import CreateRoom from "./pages/CreateRoom.js";
import JoinRoom from "./pages/JoinRoom.js";
import RoomLobby from "./pages/RoomLobby.js";
import OnlineGame from "./pages/OnlineGame.js";
import Effects from "./pages/Effects.js";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/local" element={<LocalPlay />} />
        <Route path="/create-room" element={<CreateRoom />} />
        <Route path="/join-room" element={<JoinRoom />} />
        <Route path="/room/:roomId" element={<RoomLobby />} />
        <Route path="/online/:roomId" element={<OnlineGame />} />
        <Route path="/effects" element={<Effects />} />
      </Routes>
      <Analytics />
    </>
  );
}
