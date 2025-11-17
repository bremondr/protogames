/**
 * Simple hex grid renderer for preview.
 */
const HexRenderer = (() => {
    const GRID_COLS = 2;
    const GRID_ROWS = 2;
    const HEX_SIZE = 80;
    const HEX_GAP = 6;

    function axialToPixel(q, r) {
        const size = HEX_SIZE;
        const x = size * (3 / 2) * q;
        const y = size * Math.sqrt(3) * (r + q / 2);
        return { x, y };
    }

    function hexVertices(center) {
        const vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i);
            vertices.push({
                x: center.x + HEX_SIZE * Math.cos(angle),
                y: center.y + HEX_SIZE * Math.sin(angle)
            });
        }
        return vertices;
    }

    function drawHex(ctx, hex, textures, selectedId) {
        const verts = hexVertices(hex.center);
        ctx.save();
        ctx.beginPath();
        verts.forEach((v, idx) => {
            if (idx === 0) ctx.moveTo(v.x, v.y);
            else ctx.lineTo(v.x, v.y);
        });
        ctx.closePath();
        if (textures[hex.id]) {
            const img = textures[hex.id];
            ctx.save();
            ctx.clip();
            const pattern = ctx.createPattern(img, 'repeat');
            if (pattern) {
                ctx.fillStyle = pattern;
                ctx.fill();
            } else {
                ctx.drawImage(img, hex.center.x - HEX_SIZE, hex.center.y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2);
            }
            ctx.restore();
        } else {
            ctx.fillStyle = '#f8fafc';
            ctx.fill();
        }
        ctx.strokeStyle = hex.id === selectedId ? '#4f46e5' : '#cbd5e1';
        ctx.lineWidth = hex.id === selectedId ? 3 : 1.5;
        ctx.stroke();
        ctx.restore();
    }

    function buildGrid() {
        const hexes = [];
        let id = 0;
        for (let r = 0; r < GRID_ROWS; r++) {
            for (let q = 0; q < GRID_COLS; q++) {
                const pos = axialToPixel(q - Math.floor(GRID_COLS / 2), r - Math.floor(GRID_ROWS / 2));
                hexes.push({
                    id: `hex_${id++}`,
                    q,
                    r,
                    center: { x: pos.x, y: pos.y }
                });
            }
        }
        return hexes;
    }

    function layoutGrid(canvas) {
        const hexes = buildGrid();
        const bounds = hexes.reduce(
            (acc, h) => ({
                minX: Math.min(acc.minX, h.center.x),
                maxX: Math.max(acc.maxX, h.center.x),
                minY: Math.min(acc.minY, h.center.y),
                maxY: Math.max(acc.maxY, h.center.y)
            }),
            { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        );
        const width = bounds.maxX - bounds.minX + HEX_SIZE * 3 + HEX_GAP * 2;
        const height = bounds.maxY - bounds.minY + HEX_SIZE * 3 + HEX_GAP * 2;
        const offsetX = -bounds.minX + HEX_SIZE * 1.5 + HEX_GAP;
        const offsetY = -bounds.minY + HEX_SIZE * 1.5 + HEX_GAP;
        return { hexes, width, height, offsetX, offsetY };
    }

    function render(canvas, state) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(state.offsetX, state.offsetY);
        state.hexes.forEach((hex) => {
            drawHex(ctx, hex, state.textures, state.selectedHexId);
        });
        ctx.restore();
    }

    return {
        layoutGrid,
        render
    };
})();
