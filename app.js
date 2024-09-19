const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');

// Resize canvas to full window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let hexRadius = 30;
let hexHeight = Math.sqrt(3) * hexRadius; // Height of a hexagon
let hexWidth = 2 * hexRadius; // Width of a hexagon
const margin = 100;
let hexGrid = []; // 2D array for hexagons
let selectedColor = colorPicker.value; // Default color for brushing
let isBrushing = false;
let isFlatTop = true; // Default orientation, change as needed

colorPicker.addEventListener('change', (e) => {
    selectedColor = e.target.value;
});

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hexGrid = []; // Clear the hex grid data
}

function drawHexagon(x, y, color, rotation = 0) {
    ctx.save(); // Save the current drawing state
    ctx.translate(x, y); // Move the origin to the hexagon's center
    ctx.rotate(rotation); // Rotate by the specified angle

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const xOffset = hexRadius * Math.cos(angle);
        const yOffset = hexRadius * Math.sin(angle);
        if (i === 0) {
            ctx.moveTo(xOffset, yOffset);
        } else {
            ctx.lineTo(xOffset, yOffset);
        }
    }
    ctx.closePath();
    ctx.strokeStyle = 'black';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.restore(); // Restore the previous drawing state
}

function redrawHexagon(hexagon) {
    clearCanvas(); // Clear the entire canvas
    for (const row of hexGrid) {
        for (const hex of row) {
            drawHexagon(hex.x, hex.y, hex.color, hex.rotation); // Redraw all hexagons
        }
    }
}

function generateFlatTopGrid() {
    clearCanvas();

    const horiz = (3 / 2) * hexRadius;
    const vert = hexHeight;

    const cols = Math.floor((canvas.width - 2 * margin) / horiz);
    const rows = Math.floor((canvas.height - 2 * margin) / vert);

    hexGrid = [];

    for (let r = 0; r < rows; r++) {
        hexGrid[r] = [];

        for (let q = 0; q < cols; q++) {
            let x = q * horiz + margin;
            let y = r * vert + margin;

            if (q % 2 !== 0) {
                y += vert / 2;
            }

            if (x + hexRadius <= canvas.width - margin && y + hexHeight / 2 <= canvas.height - margin) {
                hexGrid[r][q] = { x, y, color: 'white', rotation: 0 };
                drawHexagon(x, y, 'white');
            }
        }
    }
}

function generatePointyTopGrid() {
    clearCanvas();

    const horiz = Math.sqrt(3) * hexRadius;
    const vert = (3 / 2) * hexRadius;

    const cols = Math.floor((canvas.width - 2 * margin) / horiz);
    const rows = Math.floor((canvas.height - 2 * margin) / vert);

    hexGrid = [];

    for (let r = 0; r < rows; r++) {
        hexGrid[r] = [];

        for (let q = 0; q < cols; q++) {
            let x = q * horiz + margin;
            let y = r * vert + margin;

            if (r % 2 !== 0) {
                x += (hexRadius * Math.sqrt(3)) / 2;
            }

            if (x + hexWidth / 2 <= canvas.width - margin && y + hexHeight / 2 <= canvas.height - margin) {
                hexGrid[r][q] = { x, y, color: 'white', rotation: Math.PI / 6 };
                drawHexagon(x, y, 'white', Math.PI / 6);
            }
        }
    }
}

function isPointInFlatTopHexagon(px, py, hex) {
    const dx = px - hex.x;
    const dy = py - hex.y;
    
    // Check if point is within hexagon bounds
    const q = Math.abs(dx) <= hexRadius;
    const r = Math.abs(dy) <= hexRadius * Math.sqrt(3) / 2;
    const inside = q && r;
    
    return inside;
}

function isPointInPointyTopHexagon(px, py, hex) {
    const dx = px - hex.x;
    const dy = py - hex.y;

    const rotatedX = dx * Math.cos(Math.PI / 6) - dy * Math.sin(Math.PI / 6);
    const rotatedY = dx * Math.sin(Math.PI / 6) + dy * Math.cos(Math.PI / 6);

    const withinX = Math.abs(rotatedX) <= hexRadius;
    const withinY = Math.abs(rotatedY) <= hexRadius * Math.sqrt(3) / 2;

    return withinX && withinY;
}

function updateHexagonColor(hexagon, color) {
    if (hexagon.color !== color) {
        hexagon.color = color;
        drawHexagon(hexagon.x, hexagon.y, color, hexagon.rotation); // Redraw hexagon with new color
    }
}

function paintHexagons(x, y) {
    for (const row of hexGrid) {
        for (const hex of row) {
            if (isFlatTop) {
                if (isPointInFlatTopHexagon(x, y, hex)) {
                    updateHexagonColor(hex, selectedColor);
                }
            } else {
                if (isPointInPointyTopHexagon(x, y, hex)) {
                    updateHexagonColor(hex, selectedColor);
                }
            }
        }
    }
}

function redrawGrid() {
    if (isFlatTop) {
        generateFlatTopGrid();
    } else {
        generatePointyTopGrid();
    }
}


canvas.addEventListener('mousedown', (e) => {
    isBrushing = true;
    paintHexagons(e.offsetX, e.offsetY);
});

canvas.addEventListener('mouseup', () => {
    isBrushing = false;
});

canvas.addEventListener('mousemove', (e) => {
    if (isBrushing) {
        paintHexagons(e.offsetX, e.offsetY);
    }
});

// Handle touch events for mobile devices
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling
    isBrushing = true;
    const touch = e.touches[0];
    paintHexagons(touch.clientX - canvas.getBoundingClientRect().left, touch.clientY - canvas.getBoundingClientRect().top);
});

canvas.addEventListener('touchend', () => {
    isBrushing = false;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling
    if (isBrushing) {
        const touch = e.touches[0];
        paintHexagons(touch.clientX - canvas.getBoundingClientRect().left, touch.clientY - canvas.getBoundingClientRect().top);
    }
});

const hexSizeSlider = document.getElementById('hexSize');


hexSizeSlider.addEventListener('input', (e) => {
    console.log(e.target.value);
    hexRadius = Number(e.target.value);
    hexHeight = Math.sqrt(3) * hexRadius;
    hexWidth = 2 * hexRadius;
    redrawGrid();
});


// Initialize grid on page load
generateFlatTopGrid(); // Or generatePointyTopGrid() based on your default orientation
