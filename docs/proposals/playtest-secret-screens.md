# Playtest: secret screens on other devices

> **Status: proposal, not built.** Tracked by [#116](https://github.com/bremondr/protogames/issues/116) (open), part of the playtest work ([#51](https://github.com/bremondr/protogames/issues/51)); the design here is the product description for that issue. Nothing in the app or in [../PLAYTEST.md](../PLAYTEST.md) implements it yet (checked 2026-10-26). When it is built, move what exists into `PLAYTEST.md` and archive or delete this file (see [../README.md](../README.md)); the related backlog is [../research/playtest-ideas.md](../research/playtest-ideas.md).

## Summary

During a playtest everyone sits around one screen, so nothing on it can be secret. This feature lets people **connect their own phones or tablets to the session** and use them as **secret screens**: a player's private cards, role, objective or hidden pieces show only on their own device, while the shared board stays on the host's screen.

It has to work in Protogames' architecture: a static site with **no backend**, no accounts and nothing stored remotely. Devices therefore talk to each other **directly, browser to browser** (WebRTC data channels). Because two browsers cannot find each other with no server at all, the first version pairs them **by hand with QR codes (or links)**. Pairing goes through one small, replaceable interface, so a **relay that gives short join codes can be added later** without touching the rest.

## Why

- Many games have hidden information: hands of cards, secret roles or objectives, hidden units, fog of war. Today a designer can only play such a game with paper or a second device outside the tool.
- Playtests are usually in the same room, often at one table, with everyone owning a phone. That is the case to serve first.
- The hidden-information ideas in [playtest-ideas.md](../research/playtest-ideas.md) (section 10) need a way to show something to one player only. This is that channel.

## Principles

1. **No server of ours.** Nothing is uploaded, nothing is stored, no accounts. A session lives while the host's tab is open.
2. **The host is the game.** The host's tab holds the whole state. Other devices are screens: they show what the host sends them and, in later versions, send requests back (reveal a card, roll a die privately).
3. **Send each device only what it may see.** A phone is given its own player's secrets and nothing else, so another player's secrets are never on it, even if someone looks at its developer tools.
4. **Plain and quick to join.** A player should be connected in under half a minute, on any recent phone, without installing anything.
5. **The transport can change.** Manual QR pairing now, a relay with join codes later, behind the same interface.

## How it feels

### Host

1. Design the game as usual: players with colours and seats, pieces, start markers; add each player's secrets (see "What a secret screen shows").
2. Enter playtest. A **Devices** button opens a list of the players with a state next to each: *no device*, *waiting*, *connected*, *lost*.
3. Pick **Add device** next to a player. A QR code (and a link to copy) appears: the invitation for that seat.
4. When the phone has scanned it, the phone shows a second QR code. The host scans it with its camera (or pastes the answer link). The seat turns to *connected*.
5. A player whose phone drops shows *lost* and a **Reconnect** button, which repeats steps 3 and 4. The game on the host is not affected.

### Player on a phone

1. Scan the host's QR code with the ordinary camera app. It opens a Protogames page (the same site, a `join` view).
2. The page shows a QR code (and a link) to hand back to the host. When the host has scanned it, the page switches to the player's **secret screen**, in their colour, with the player's name and seat.
3. Leaving the page, or locking the phone for a long time, ends the connection; scanning again rejoins the same seat.

The secret screen is read-only in the first version.

## What a secret screen shows

The playtest has no hidden information yet, so the first version includes the smallest model of it:

- **Secret cards per player**, written by the designer in the Players panel: a title and a short text, optionally a colour or one of the existing objects as a picture. Examples: *Role: spy*, *Objective: reach the harbour*, a hand of action cards.
- **Reveal**: the host can show a card to the table (it appears on the shared screen for everyone), or turn it back to secret.
- **Deal and shuffle** of a shared deck into hands is a possible next step and out of scope for the first version.

Secret cards are part of the design, so they are saved in project files and autosaves and need a project format version bump with a migration (existing designs get no secrets). **They are left out of share links by default**, because a link is meant for sharing the board with everyone; including them would be an explicit choice.

## Scope (in order of delivery)

1. **Connection layer.** A star of WebRTC data channels, one per device, with the host in the middle. Pairing by QR code or link in both directions, reconnecting, a small versioned JSON message protocol, and the Devices list with each seat's state. Works on the same Wi-Fi with no help from anyone, and across the internet using public STUN servers.
2. **Secret cards.** The data model and format version bump, the editor in the Players panel, sending a seat its own cards, reveal and hide, and the secret screen on the phone.
3. **Optional relay.** A tiny serverless relay (for example a free-tier Cloudflare Worker) that only passes the pairing messages, giving join codes: the host shows a four-letter code, the player types it. Selectable as an alternative to QR pairing; the connection layer and everything above it are unchanged.

Later, not promised: players acting from their phones (reveal, play a card to the table, a private die roll), decks and hands, fog of war per player, spectators.

## How it works (sketch)

- **Transport.** `RTCPeerConnection` with one `RTCDataChannel` per device. Both ends wait until their connection candidates are collected, so each side produces a single, complete blob and nothing has to be exchanged piecemeal. The blob (a session description with its candidates) is compressed and base64url-encoded with the same helpers the share links use; it is about one to two kilobytes, which fits in a QR code and in a link.
- **Pairing UI.** The QR code is drawn by a small bundled generator (no network). The other direction needs the camera: the browser's `BarcodeDetector` where it exists, a bundled decoder where it does not (Safari), and always a paste field for the link as a fallback.
- **Messages** (JSON, with a protocol version): `hello` (the phone says which invitation it answers), `seat` (the seat's name and colour), `secrets` (that seat's cards), `reveal` and `hide`, and `ping`. The host ignores anything it does not recognise; a device on a different protocol version is told to refresh.
- **Seat binding.** An invitation carries a random token for one seat. An answer without the right token is refused, so a device cannot take another seat.
- **State on the phone** is kept in memory only and cleared on disconnect.
- **Connectivity.** `iceServers` defaults to public STUN servers (so devices on different networks can find each other); it can be set to none for a same-network-only mode, in which no third party is contacted at all. No TURN server is provided (see the risks).

## Privacy and security

- Data channels are encrypted end to end between the two browsers (DTLS). Nothing passes through a server of ours.
- A STUN server learns the public address of each device that asks, and nothing else; the same-network-only mode avoids even that. This goes into the settings text.
- The host is trusted and so are the players (a friendly playtest); the aim is to keep secrets off the shared screen, not to defend against a cheating player with access to the host's device.
- The secret screen is only as private as the phone's own screen: nobody is protected from someone reading over a shoulder.
- A later relay would see only the pairing messages, which contain connection candidates and no game data, and would need to be added to the page's Content-Security-Policy (`connect-src`).

## Risks and limits

- **Some networks block direct connections** (strict corporate or carrier networks, about one attempt in ten across the internet). Without a relay server (TURN) that cannot be fixed, so the screen says so and suggests joining the same Wi-Fi. A TURN service is a possible later paid add-on.
- **Phones sleep and browsers pause pages in the background.** A connection can be lost mid-game; with manual pairing it takes another scan to restore. This is the main weakness of the serverless approach and the strongest reason for the optional relay.
- **Pairing takes two scans per player.** Acceptable for a table of four, tedious for eight; join codes would remove it.
- **Camera access** needs the person's permission and a secure page (the site is served over HTTPS); the paste fallback covers refusal.
- **Testing.** WebRTC works in headless Chromium, so two pages can be paired in an automated test; the protocol and seat binding are also tested against a fake channel without a browser.

## Acceptance criteria

- [ ] A host and one phone on the same Wi-Fi are connected in under 30 seconds using only QR codes, with no account and no server of ours.
- [ ] A phone that is given a seat shows that player's secrets and no one else's; nothing of another seat reaches it (checked on the messages sent).
- [ ] Revealing a card shows it on the shared screen; hiding it makes it secret again.
- [ ] Losing the connection leaves the game on the host unchanged; reconnecting returns the phone to the same seat, and a device cannot take a seat it was not invited to.
- [ ] Secret cards are saved with the project, migrate from older files (none), and are not included in share links unless chosen.
- [ ] The first version needs no change to the site's hosting. A later relay changes only the pairing step.
- [ ] Works on current Chrome and Safari on phones, and on desktop browsers for the host.

## Open questions

- Text cards only, or also images and the existing object pictures?
- Should a phone be allowed to act in the first version (privately roll a die, play a card to the table), or stay read-only?
- Are public STUN servers on by default, or is same-network-only the default with an opt-in for internet play?
- Which bundled QR scanner and generator to use (size, licence), now that the site has no build step?
- Does a seat allow more than one device (for example two phones for one player)?
