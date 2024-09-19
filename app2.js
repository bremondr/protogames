const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');

// Resize canvas to full window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let isDrawing = false;
let isColorMode = false;
let points = [];
let shapes = []; // Store all drawn shapes
let hexagons = []; // Store hexagon data globally
let showOutlines = true; // Track whether to show or hide shape outlines
let selectedColor = 'red'; // Default color is red

// Hexagon settings
const hexRadius = 30;
const hexHeight = Math.sqrt(3) * hexRadius;
const hexWidth = 2 * hexRadius;

// Add event listeners for the buttons
document.getElementById('drawMode').addEventListener('click', () => {
    isColorMode = false;
    canvas.style.cursor = 'crosshair'; // Change cursor for drawing mode
});

document.getElementById('colorMode').addEventListener('click', () => {
    isColorMode = true;
    canvas.style.cursor = 'pointer'; // Change cursor for color change mode
});

// Add event listener for toggling shape outlines
document.getElementById('toggleOutlines').addEventListener('click', () => {
    showOutlines = !showOutlines;
    drawShapes(); // Redraw canvas when toggling the outlines
});

// Add event listener for color picker changes
document.getElementById('colorPicker').addEventListener('change', (e) => {
    selectedColor = e.target.value; // Set the selected color to be used for hexagons
});

// Add event listener for the "Generate Hexagon Grid" button
document.getElementById('generateGrid').addEventListener('click', () => {
    fillWithHexagons(); // Only generate hexagons when this button is clicked
});

// Start drawing a new shape
canvas.addEventListener('mousedown', (e) => {
    if (isColorMode) return; // Do nothing if in color mode

    isDrawing = true;
    points = [{ x: e.offsetX, y: e.offsetY }];
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || isColorMode) return; // Do nothing if not drawing or in color mode

    points.push({ x: e.offsetX, y: e.offsetY });
    drawShapes();  // Redraw shapes while drawing
});

canvas.addEventListener('mouseup', () => {
    if (!isDrawing || isColorMode) return; // Do nothing if not drawing or in color mode

    isDrawing = false;
    shapes.push([...points]); // Store the drawn shape
    points = [];  // Clear points after finishing the shape
    drawShapes();  // Ensure shapes are redrawn after drawing
});

// Event listener for clicking on hexagons
canvas.addEventListener('click', (e) => {
    if (!isColorMode) return; // Do nothing if not in color mode

    const clickX = e.offsetX;
    const clickY = e.offsetY;

    hexagons.forEach(hex => {
        if (isPointInHexagon(clickX, clickY, hex.x, hex.y)) {
            // Set the clicked hexagon's color to the currently selected color
            hex.color = selectedColor;
            drawHexagon(hex.x, hex.y, hex.color); // Redraw only the clicked hexagon
        }
    });
});

// Draw all shapes on the canvas
function drawShapes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
    
    // Conditionally draw each shape based on showOutlines
    if (showOutlines) {
        shapes.forEach(shapePoints => {
            ctx.beginPath();
            ctx.moveTo(shapePoints[0].x, shapePoints[0].y);
            for (let i = 1; i < shapePoints.length; i++) {
                ctx.lineTo(shapePoints[i].x, shapePoints[i].y);
            }
            ctx.closePath();
            ctx.stroke();
        });

        // Draw the current in-progress shape if outlines are enabled
        if (points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        }
    }

    // Redraw hexagons to ensure they stay visible regardless of outline visibility
    hexagons.forEach(hex => drawHexagon(hex.x, hex.y, hex.color));
}

// Check if a point is inside a drawn shape (ray-casting algorithm)
function isPointInShape(x, y, shape) {
    let inside = false;
    for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
        const xi = shape[i].x, yi = shape[i].y;
        const xj = shape[j].x, yj = shape[j].y;

        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Check if the entire hexagon is inside the shape
function isHexagonFullyInside(x, y, shape) {
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const xOffset = x + hexRadius * Math.cos(angle);
        const yOffset = y + hexRadius * Math.sin(angle);
        if (!isPointInShape(xOffset, yOffset, shape)) {
            return false; // If any point is outside the shape, return false
        }
    }
    return true; // If all points are inside the shape, return true
}

// Check if a point is inside a specific hexagon
function isPointInHexagon(px, py, hx, hy) {
    const dx = Math.abs(px - hx);
    const dy = Math.abs(py - hy);

    if (dx > hexWidth / 2 || dy > hexHeight / 2) return false;

    const slope = hexHeight / hexWidth;
    return dy <= slope * (hexWidth / 2 - dx);
}

// Fill all drawn shapes with hexagons
function fillWithHexagons() {
    const cols = Math.ceil(canvas.width / (1.5 * hexRadius));
    const rows = Math.ceil(canvas.height / hexHeight);

    shapes.forEach(shape => {
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                let x = col * (1.5 * hexRadius);
                let y = row * hexHeight;

                if (col % 2 === 1) {
                    y += hexHeight / 2;
                }

                // Check if this hexagon already exists in hexagons array
                let hex = hexagons.find(h => h.x === x && h.y === y);

                // If hexagon doesn't exist and is fully inside the shape, create a new one
                if (!hex && isHexagonFullyInside(x, y, shape)) {
                    hexagons.push({ x: x, y: y, color: 'blue' });
                    drawHexagon(x, y, 'blue');
                } 
                // If hexagon exists, just redraw it with its current color
                else if (hex && isHexagonFullyInside(x, y, shape)) {
                    drawHexagon(x, y, hex.color);
                }
            }
        }
    });
}

// Function to draw a hexagon at a specific (x, y) location with a specific color
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
    ctx.fillStyle = color;
    ctx.fill();
}
