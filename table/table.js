/**
 * Table demo page: draws a Protogames board fullscreen and lights up the cells the
 * camera says something is standing on (served by table/server.py).
 *
 * Keys: C calibrate, B capture the empty table, S simulator (click cells), H hide the
 * status text, F fullscreen. URL: ?board=<project json> to play a board made in the
 * editor, ?sim to start in the simulator.
 */
(() => {
    const params = new URLSearchParams(location.search);
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const hud = document.getElementById('hud');
    const panel = document.getElementById('calibration');

    const DEFAULT_COLOR = Config.DEFAULT_TILE_COLOR.toLowerCase();
    let size = { width: 0, height: 0 };
    let polygons = [];
    let occupied = new Set();
    let simulated = new Set();
    let simulator = params.has('sim');
    let displayMode = null; // 'dark' / 'lit' while the server captures the empty table
    let server = { status: 'connecting…', calibrated: false, baseline: false, camera_error: null, connected: false };
    let targets = [];
    let calibrating = false;
    let clicks = [];

    function fitBoard(source) {
        const pad = 40;
        const xs = source.flatMap((p) => p.vertices.map((v) => v.x));
        const ys = source.flatMap((p) => p.vertices.map((v) => v.y));
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const scale = Math.min((size.width - 2 * pad) / (maxX - minX), (size.height - 2 * pad) / (maxY - minY));
        const map = (p) => ({
            x: (p.x - (minX + maxX) / 2) * scale + size.width / 2,
            y: (p.y - (minY + maxY) / 2) * scale + size.height / 2
        });
        return source.map((p) => {
            const vertices = p.vertices.map(map);
            const px = vertices.map((v) => v.x);
            const py = vertices.map((v) => v.y);
            const bounds = { minX: Math.min(...px), maxX: Math.max(...px), minY: Math.min(...py), maxY: Math.max(...py) };
            return { id: p.id, color: p.color, vertices, bounds };
        });
    }

    async function loadBoard() {
        let source;
        if (params.get('board')) {
            const project = await (await fetch(params.get('board'))).json();
            source = (project.appState || project).polygons;
        } else {
            source = Geometry.generateGrid({ ...Config.DEFAULT_BOARD_CONFIG }, size, new Map());
        }
        polygons = fitBoard(source);
        sendCells();
        draw();
    }

    function post(path, body) {
        return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
            .then((r) => r.json())
            .catch(() => null);
    }

    async function sendCells() {
        const answer = await post('/api/cells', {
            width: size.width,
            height: size.height,
            cells: polygons.map((p) => ({ id: p.id, vertices: p.vertices.map((v) => [v.x, v.y]) }))
        });
        if (answer) targets = answer.targets;
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        size = { width: window.innerWidth, height: window.innerHeight };
        canvas.width = size.width * dpr;
        canvas.height = size.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (polygons.length) loadBoard();
    }

    function isLit(id) {
        if (displayMode) return displayMode === 'lit';
        return (simulator ? simulated : occupied).has(id);
    }

    function path(vertices) {
        ctx.beginPath();
        vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
    }

    function draw() {
        ctx.fillStyle = '#0b0d12';
        ctx.fillRect(0, 0, size.width, size.height);
        for (const p of polygons) {
            const lit = isLit(p.id);
            path(p.vertices);
            ctx.fillStyle = lit ? '#ffb020' : p.color && p.color.toLowerCase() !== DEFAULT_COLOR ? p.color : '#1b2030';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = lit ? '#fff2cf' : '#3a4258';
            ctx.stroke();
        }
        if (calibrating) {
            ctx.font = '700 22px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            targets.forEach(([x, y], i) => {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(x, y, 26, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000000';
                ctx.fillText(String(i + 1), x, y);
            });
        }
        const lines = [
            `${simulator ? 'SIMULATOR (click cells)' : server.connected ? 'camera' : 'server offline'} · ${server.status}`,
            `occupied: ${(simulator ? simulated : occupied).size}/${polygons.length}`,
            'C calibrate · B empty table · S simulator · H hide · F fullscreen'
        ];
        if (server.camera_error) lines.unshift(`CAMERA: ${server.camera_error}`);
        hud.textContent = lines.join('\n');
    }

    // ---- server events --------------------------------------------------

    function connect() {
        const events = new EventSource('/api/events');
        events.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            server.connected = true;
            if (msg.type === 'display') displayMode = msg.mode;
            if (msg.type === 'state') {
                occupied = new Set(msg.occupied);
                Object.assign(server, msg);
            }
            draw();
        };
        events.onerror = () => {
            server.connected = false;
            draw();
        };
    }

    // ---- simulator ------------------------------------------------------

    canvas.addEventListener('click', (e) => {
        if (!simulator || calibrating) return;
        const hit = Geometry.findPolygonAtPoint({ x: e.clientX, y: e.clientY }, polygons);
        if (!hit) return;
        simulated.has(hit.id) ? simulated.delete(hit.id) : simulated.add(hit.id);
        draw();
    });

    // ---- calibration ----------------------------------------------------

    const image = document.getElementById('calibrationImage');
    const dots = document.getElementById('calibrationDots');
    const help = document.getElementById('calibrationHelp');
    let refresh = null;

    function showHelp() {
        help.textContent =
            clicks.length < 4
                ? `Click target ${clicks.length + 1} of 4 (the white numbered discs on the display) in the camera picture, in the order 1 to 4.`
                : 'Saved. The cells drawn on the picture should sit on the display; start over if they do not.';
    }

    function setCalibrating(on) {
        calibrating = on;
        panel.hidden = !on;
        clearInterval(refresh);
        if (on) {
            clicks = [];
            dots.innerHTML = '';
            const tick = () => (image.src = `/api/snapshot.jpg?${clicks.length === 4 ? 'overlay&' : ''}t=${Date.now()}`);
            tick();
            refresh = setInterval(tick, 400);
            showHelp();
        }
        draw();
    }

    document.getElementById('calibrationFrame').addEventListener('click', async (e) => {
        if (clicks.length >= 4) return;
        const rect = image.getBoundingClientRect();
        const point = [
            ((e.clientX - rect.left) / rect.width) * image.naturalWidth,
            ((e.clientY - rect.top) / rect.height) * image.naturalHeight
        ];
        clicks.push(point);
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.textContent = String(clicks.length);
        dot.style.left = `${((e.clientX - rect.left) / rect.width) * 100}%`;
        dot.style.top = `${((e.clientY - rect.top) / rect.height) * 100}%`;
        dots.appendChild(dot);
        if (clicks.length === 4) await post('/api/calibration', { camera: clicks });
        showHelp();
    });
    document.getElementById('calibrationReset').addEventListener('click', () => setCalibrating(true));
    document.getElementById('calibrationClose').addEventListener('click', () => setCalibrating(false));

    // ---- keys -----------------------------------------------------------

    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'c') setCalibrating(!calibrating);
        else if (key === 'b') post('/api/baseline');
        else if (key === 's') simulator = !simulator;
        else if (key === 'h') hud.classList.toggle('hidden');
        else if (key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        else return;
        draw();
    });

    window.addEventListener('resize', resize);
    resize();
    loadBoard();
    connect();
})();
