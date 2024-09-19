const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');

// Resize canvas to full window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Hexagon settings
const hexRadius = 30;
const hexHeight = Math.sqrt(3) * hexRadius;
const hexWidth = 2 * hexRadius;
const margin = 100; // Add a 100px margin around the grid
let hexagons = []; // Store hexagon data globally with state (active/inactive)
let selectedColor = 'red'; // Default color for active hexagons

// Set canvas background to light grey
ctx.fillStyle = '#d3d3d3';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Add event listener for color picker changes
document.getElementById('colorPicker').addEventListener('change', (e) => {
    selectedColor = e.target.value; // Set the selected color for active hexagons
});

// Add event listener for clicking on hexagons
canvas.addEventListener('click', (e) => {
    const clickX = e.offsetX;
    const clickY = e.offsetY;

    hexagons.forEach(hex => {
        if (isPointInHexagon(clickX, clickY, hex.x, hex.y)) {
            hex.active = !hex.active; // Toggle hexagon active state
            hex.color = hex.active ? selectedColor : 'transparent'; // Active: selected color, Inactive: transparent
            drawHexagon(hex.x, hex.y, hex.color); // Redraw the hexagon with its new state
        }
    });
});

// Generate the hexagonal grid for the entire canvas
function generateHexagonalGrid() {
    const cols = Math.ceil((canvas.width - 2 * margin) / (1.5 * hexRadius)); // Adjust for margins
    const rows = Math.ceil((canvas.height - 2 * margin) / hexHeight); // Adjust for margins

    hexagons = []; // Clear the hexagons array

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let x = col * (1.5 * hexRadius) + hexRadius + margin; // Adjust for margin and shift right
            let y = row * hexHeight + hexHeight / 2 + margin; // Adjust for margin and shift down

            if (col % 2 === 1) {
                y += hexHeight / 2; // Staggered rows
            }

            // Add hexagons only if they fit fully within the canvas dimensions and margin
            if (x + hexRadius <= canvas.width - margin && y + hexHeight / 2 <= canvas.height - margin) {
                hexagons.push({ x: x, y: y, active: true, color: 'white' }); // Active hexagons are white by default
                drawHexagon(x, y, 'white'); // Initially draw all hexagons as active and white
            }
        }
    }
}

// Draw a single hexagon
function drawHexagon(x, y, color) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const xOffset = x + hexRadius * Math.cos(angle);
        const yOffset = y + hexRadius * Math.sin(angle);
        if (i === 0) {
            ctx.moveTo(xOffset, yOffset);
        } else {
            ctx.lineTo(xOffset, yOffset);
        }
    }
    ctx.closePath();
    ctx.strokeStyle = 'black';
    ctx.stroke();
    ctx.fillStyle = color === 'transparent' ? 'rgba(0, 0, 0, 0)' : color; // Transparent if inactive
    ctx.fill();
}

// Check if a point is inside a specific hexagon
function isPointInHexagon(px, py, hx, hy) {
    const dx = Math.abs(px - hx);
    const dy = Math.abs(py - hy);

    if (dx > hexWidth / 2 || dy > hexHeight / 2) return false;

    const slope = hexHeight / hexWidth;
    return dy <= slope * (hexWidth / 2 - dx);
}

// Generate the hexagonal grid when the page loads
generateHexagonalGrid();
