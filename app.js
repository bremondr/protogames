const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');

// Resize canvas to full window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const hexRadius = 30;
const hexHeight = Math.sqrt(3) * hexRadius; // Height of a hexagon
const hexWidth = 2 * hexRadius; // Width of a hexagon
const margin = 100;
let hexGrid = []; // 2D array for hexagons

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

function generateFlatTopGrid() {
    clearCanvas(); // Clear canvas before drawing

    const horiz = (3 / 2) * hexRadius; // Horizontal distance between centers
    const vert = hexHeight; // Vertical distance between centers

    const cols = Math.floor((canvas.width - 2 * margin) / horiz);
    const rows = Math.floor((canvas.height - 2 * margin) / vert);

    hexGrid = [];

    for (let r = 0; r < rows; r++) {
        hexGrid[r] = [];

        for (let q = 0; q < cols; q++) {
            let x = q * horiz + margin;
            let y = r * vert + margin;

            // Apply vertical offset for odd rows
            if (q % 2 !== 0) {
                y += vert / 2;
            }

            if (x + hexRadius <= canvas.width - margin && y + hexHeight / 2 <= canvas.height - margin) {
                hexGrid[r][q] = { x, y, active: true, color: 'white' };
                drawHexagon(x, y, 'white'); // No rotation for flat-top orientation
            }
        }
    }
}



function generatePointyTopGrid() {
    clearCanvas(); // Clear canvas before drawing

    const horiz = Math.sqrt(3) * hexRadius; // Horizontal distance between centers
    const vert = (3 / 2) * hexRadius; // Vertical distance between centers

    const cols = Math.floor((canvas.width - 2 * margin) / horiz);
    const rows = Math.floor((canvas.height - 2 * margin) / vert);

    hexGrid = [];

    for (let r = 0; r < rows; r++) {
        hexGrid[r] = [];

        for (let q = 0; q < cols; q++) {
            let x = q * horiz + margin;
            let y = r * vert + margin;

            // Apply horizontal offset for odd rows
            if (r % 2 !== 0) {
                x += (hexRadius * Math.sqrt(3)) / 2;
            }

            if (x + hexWidth / 2 <= canvas.width - margin && y + hexHeight / 2 <= canvas.height - margin) {
                hexGrid[r][q] = { x, y, active: true, color: 'white' };
                drawHexagon(x, y, 'white', Math.PI / 6); // Apply 30-degree rotation
            }
        }
    }
}



// Initialize canvas (you can call one of these to start with a default grid)
clearCanvas();
