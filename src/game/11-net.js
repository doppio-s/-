// ================= LOCAL PLAY: passphrase link over WebRTC (PeerJS) =================
// Both players pick the same mode and type the same passphrase. The first one to press CONNECT
// claims the room on the free PeerJS broker, the second joins it; after that all game data
// flows directly between the two devices. The PeerJS library is fetched from a CDN only when
// LOCAL PLAY is actually used, so solo play stays fully offline.
const NET_VER = 2;   // bump whenever the messages change: mismatched copies refuse to link
let netGame = null,     // null | "duel" | "coop" while a network match is running
  netHold = false,      // pause menu open during a network match (the game keeps running)
  netHpMax = 0,         // co-op REAR: the pilot's max hits, shown on this device's HUD
  netLabel = "";        // co-op REAR: the pilot's stage / wave label
const Net = {
  peer: null, conn: null, isHost: false, mode: "duel", code: "", phase: "idle",   // idle | loading | waiting | joining | lobby | game
  seat: "front", partner: null, lastRx: 0, pingT: 0, savedPlane: null,
  send(o) { const c = this.conn; if (c && c.open) try { c.send(o); } catch (e) {} },
};
const NET_LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js", "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js", "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"];
function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  const srcs = window.__peerSrc ? [window.__peerSrc] : NET_LIBS;
  return srcs.reduce((chain, src) => chain.catch(() => new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = src; sc.async = true; sc.crossOrigin = "anonymous";
    sc.onload = () => window.Peer ? res() : rej(new Error("no Peer"));
    sc.onerror = () => { sc.remove(); rej(new Error("load " + src)); };
    document.head.appendChild(sc);
  })), Promise.reject(new Error("start")));
}
const netPeerCfg = () => Object.assign({ debug: 0 }, window.__peerCfg || {});
// the passphrase (any language) becomes a short room id; the mode is part of it so DUEL and CO-OP rooms never mix
function netRoomId(mode, code) {
  const s = code.trim().toLowerCase().normalize("NFKC");
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (const ch of s) { const c = ch.codePointAt(0); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ (c + 131), 2246822519) >>> 0; }
  return "flightio" + NET_VER + "-" + mode + "-" + h1.toString(36) + h2.toString(36);
}
function netStatus(msg, kind) { const e = $("netStatus"); e.textContent = msg; e.className = "netStatus" + (kind ? " " + kind : ""); }
function netReset() {
  const { peer, conn } = Net;
  Net.peer = Net.conn = Net.partner = null; Net.phase = "idle"; Net.isHost = false;
  try { conn && conn.close(); } catch (e) {}
  try { peer && peer.destroy(); } catch (e) {}
}
function openNet() {
  if (state !== "title") return;
  state = "netmenu"; clearInput();
  showOnly("netScreen"); netRenderLobby();
  if (Net.phase === "idle") netStatus("Not connected");
  setTimeout(() => $("netCode").focus(), 50);
}
function closeNet() { netReset(); netRenderLobby(); toTitle(); }
async function netConnect() {
  const code = $("netCode").value.trim();
  if (!code) { netStatus("Type a passphrase first", "err"); $("netCode").focus(); return; }
  netReset();
  Net.mode = document.querySelector(".netMode.sel").dataset.mode; Net.code = code; Net.phase = "loading";
  netStatus("Loading the network library…"); netRenderLobby();
  try { await loadPeerLib(); }
  catch (e) { Net.phase = "idle"; netStatus("Couldn't load the network library. Check your internet connection.", "err"); netRenderLobby(); return; }
  if (Net.phase !== "loading") return;   // cancelled meanwhile
  const id = netRoomId(Net.mode, code);
  netStatus("Connecting…");
  const hostPeer = new Peer(id, netPeerCfg());
  Net.peer = hostPeer;
  hostPeer.on("open", () => { if (Net.peer !== hostPeer) return; Net.isHost = true; Net.phase = "waiting"; netStatus("Room open · waiting for your partner to enter “" + code + "”…"); netRenderLobby(); });
  hostPeer.on("connection", c => {
    if (Net.conn) { c.on("open", () => { c.send({ t: "full" }); setTimeout(() => c.close(), 400); }); return; }
    netAttach(c);
  });
  hostPeer.on("error", err => {
    if (Net.peer !== hostPeer) return;
    if (err.type === "unavailable-id") { hostPeer.destroy(); netJoin(id); }   // someone already opened this room: join it
    else netFail(err);
  });
}
function netJoin(id) {
  Net.isHost = false; Net.phase = "joining"; netStatus("Room found · joining…");
  const p = new Peer(netPeerCfg()); Net.peer = p;
  p.on("open", () => {
    if (Net.peer !== p) return;
    netAttach(p.connect(id, { reliable: true, serialization: "json" }));
    setTimeout(() => { if (Net.peer === p && Net.phase === "joining") netFail({ type: "timeout" }); }, 25000);
  });
  p.on("error", err => { if (Net.peer === p) netFail(err); });
}
function netFail(err) {
  const t = err && err.type;
  const msg = t === "peer-unavailable" ? "The room closed before we could join. Press CONNECT again."
    : t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed" ? "Couldn't reach the matchmaking server. Check your internet connection."
    : t === "browser-incompatible" ? "This browser can't do local play (WebRTC missing)."
    : t === "timeout" ? "Couldn't connect to your partner. Are you both on a network that allows it? Try again."
    : "Connection error (" + (t || "unknown") + "). Try again.";
  netReset(); netStatus(msg, "err"); netRenderLobby();
}
function netAttach(c) {
  Net.conn = c; Net.lastRx = performance.now();
  c.on("open", () => {
    if (Net.conn !== c) return;
    Net.phase = "lobby"; Net.lastRx = performance.now(); Net.seat = Net.isHost ? "front" : "rear";
    c.send(netHello()); netStatus("Connected!", "ok"); netRenderLobby(); Sound.sfxRevive();
  });
  c.on("data", d => { if (Net.conn !== c) return; Net.lastRx = performance.now(); netOnData(d); });
  c.on("close", () => { if (Net.conn === c) netLost(); });
  c.on("error", () => { if (Net.conn === c) netLost(); });
}
function netHello() {
  const pt = paintNow(), pl = planeNow();
  return { t: "hello", v: NET_VER, mode: Net.mode, name: (CALLSIGNS[garage.plane] || pl.name), plane: pl.shape, id: garage.plane, body: pt.body, wing: pt.wing, armor: armorOf(pl) };
}
function netLost() {
  if (Net.phase === "idle") return;
  const inGame = !!netGame;
  netReset();
  if (inGame) { netEndGame(); toTitle(); toast("Your partner disconnected"); }
  else { netStatus("Your partner disconnected", "err"); netRenderLobby(); }
}
// messages: lobby ones here, match traffic goes to the mode's handler
function netOnData(d) {
  if (!d || typeof d !== "object") return;
  switch (d.t) {
    case "hello":
      if (d.v !== NET_VER) { netStatus("Your partner has a different version of the game.", "err"); netReset(); netRenderLobby(); return; }
      Net.partner || Net.send(netHello());   // answer once, so both sides surely know each other
      Net.partner = d; netRenderLobby(); return;
    case "full": netStatus("That room already has two players. Try another passphrase.", "err"); netReset(); netRenderLobby(); return;
    case "ping": return;
    case "seat": Net.seat = d.s; netRenderLobby(); return;
    case "start": netBegin(); return;
    case "lobby": netToLobbyLocal(); return;
    case "bye": netLost(); return;
  }
  if (netGame === "duel") duelOnData(d);
  else if (netGame === "coop") coopOnData(d);
}
function netRenderLobby() {
  const lobby = Net.phase === "lobby" || Net.phase === "game";
  $("netLobby").classList.toggle("hidden", !lobby);
  $("netScreen").classList.toggle("linked", lobby);   // once linked, the setup rows fold away
  lobby && netStatus("Connected \u00b7 " + (Net.mode === "coop" ? "STINGER CO-OP" : "DUEL") + " \u00b7 \u201c" + Net.code + "\u201d", "ok");
  $("netModes").classList.toggle("locked", Net.phase !== "idle");
  $("netCode").disabled = Net.phase !== "idle";
  $("btnNetGo").textContent = Net.phase === "idle" ? "CONNECT" : "CANCEL";
  $("netSeats").classList.toggle("hidden", Net.mode !== "coop");
  const P = Net.partner;
  if (Net.mode === "coop") {
    for (const b of document.querySelectorAll(".netSeat")) {
      const mine = b.dataset.seat === Net.seat; b.classList.toggle("sel", mine);
      b.querySelector("em").textContent = mine ? "YOU" : P ? "PARTNER" : "";
    }
    $("netVs").textContent = "Both of you fly one STINGER · click a seat to swap";
  } else $("netVs").textContent = P ? "YOU vs " + P.name + " (" + (P.id || P.plane).toUpperCase() + ")" : "";
  $("btnNetStart").disabled = !Net.isHost || !P;
  $("btnNetStart").textContent = Net.isHost ? "START" : "WAITING FOR HOST TO START";
}
function netPickSeat(s) {
  if (Net.phase !== "lobby" || Net.seat === s) return;
  Net.seat = s; Net.send({ t: "seat", s: s === "front" ? "rear" : "front" }); netRenderLobby(); Sound.sfxClick();
}
function netStartPressed() {
  if (!Net.isHost || Net.phase !== "lobby" || !Net.partner) return;
  Net.send({ t: "start" }); netBegin();
}
function netBegin() {
  Net.phase = "game"; netHold = false;
  $("netScreen").classList.add("hidden");
  if (Net.mode === "duel") startDuel(); else startCoop(Net.seat);
}
// the end of a match: both devices go back to the connected lobby
function netBackToLobby() { Net.send({ t: "lobby" }); netToLobbyLocal(); }
function netToLobbyLocal() {
  if (!netGame && Net.phase !== "game") return;
  netEndGame();
  clearWorld(); clearInput(); resetDemoPlane(); setHud(false);
  if (Net.conn) Net.phase = "lobby";
  state = "netmenu"; showOnly("netScreen"); netRenderLobby();
  netStatus(Net.conn ? "Connected!" : "Not connected", Net.conn ? "ok" : "");
}
function netLeave() { Net.send({ t: "bye" }); netEndGame(); netReset(); netRenderLobby(); toTitle(); }
function netEndGame() {
  if (netGame === "duel") duelEnd(); else if (netGame === "coop") coopEnd();
  netGame = null; netHold = false; netHpMax = 0; netLabel = "";
  for (const id of ["duelBar", "netCount", "gunSight", "coopTag", "duelEnd"]) $(id).classList.add("hidden");
}
// pause during a match: the menu opens but the match keeps running
function netPause() {
  if (netHold) { netResume(); return; }
  netHold = true; clearInput(); showOnly("pause");
}
function netResume() { netHold = false; showOnly(null); }
// keep-alive on a real-time timer, so a slow or briefly hidden tab doesn't drop the link
setInterval(() => {
  if (!Net.conn || (Net.phase !== "lobby" && Net.phase !== "game")) return;   // only once linked
  Net.send(Net.partner ? { t: "ping" } : netHello());   // keep saying hello until we hear back
  performance.now() - Net.lastRx > 15e3 && netLost();
}, 1e3);

onBtn("btnLocal", () => { Sound.sfxClick(); openNet(); });
onBtn("btnNetBack", () => { Sound.sfxClick(); closeNet(); });
onBtn("btnNetGo", () => { Sound.sfxClick(); Net.phase === "idle" ? netConnect() : (netReset(), netStatus("Not connected"), netRenderLobby()); });
onBtn("btnNetStart", () => { Sound.sfxClick(); netStartPressed(); });
onBtn("btnDuelAgain", () => { Sound.sfxClick(); netBackToLobby(); });
onBtn("btnDuelExit", () => { Sound.sfxClick(); netLeave(); });
$("netModes").addEventListener("click", e => {
  const b = e.target.closest("[data-mode]"); if (!b || Net.phase !== "idle") return;
  for (const x of document.querySelectorAll(".netMode")) x.classList.toggle("sel", x === b);
  Net.mode = b.dataset.mode; netRenderLobby(); Sound.sfxClick();
});
$("netSeats").addEventListener("click", e => { const b = e.target.closest("[data-seat]"); b && netPickSeat(b.dataset.seat); });
$("netCode").addEventListener("keydown", e => { e.key === "Enter" && (e.preventDefault(), Net.phase === "idle" && netConnect()); });
for (const id of ["netScreen", "duelEnd"]) $(id).addEventListener("pointerdown", e => e.stopPropagation());
