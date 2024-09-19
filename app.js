const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');

// Resize canvas to full window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let isDrawing = false;
let isColorMode = false;  // Default to draw mode
let points = [];
let shapes = []; // Store all drawn shapes
let hexagons = []; // Store hexagon data globally
let triangles = []; // Store triangle data globally
let showOutlines = true; // Track whether to show or hide shape outlines
let selectedColor = 'red'; // Default color is red
let currentTiling = null; // Track the current grid type (hexagons or triangles)

// Hexagon settings
const hexRadius = 30;
const hexHeight = Math.sqrt(3) * hexRadius;
const hexWidth = 2 * hexRadius;

// Triangle settings
const triangleSize = 30; // Side length of an equilateral triangle
const triangleHeight = (Math.sqrt(3) / 2) * triangleSize; // Height of an equilateral triangle

// Add event listener for the toggle switch
document.getElementById('modeToggle').addEventListener('change', (e) => {
    isColorMode = e.target.checked; // Toggle between draw mode and color mode

    // Update the mode label text
    const modeText = document.getElementById('modeText');
    modeText.textContent = isColorMode ? 'Color Mode' : 'Draw Mode';

    // Update cursor style
    canvas.style.cursor = isColorMode ? 'pointer' : 'crosshair';
});

// Add event listener for toggling shape outlines
document.getElementById('toggleOutlines').addEventListener('click', () => {
    showOutlines = !showOutlines;
    drawShapes(); // Redraw canvas when toggling the outlines
});

// Add event listener for color picker changes
document.getElementById('colorPicker').addEventListener('change', (e) => {
    selectedColor = e.target.value; // Set the selected color to be used for hexagons/triangles
});

// Add event listener for the "Generate Hexagon Grid" button
document.getElementById('generateGrid').addEventListener('click', () => {
    clearGrid(); // Clear any existing grids
    fillWithHexagons(); // Only generate hexagons when this button is clicked
    currentTiling = 'hexagons'; // Set the current tiling type to hexagons
});

// Add event listener for the "Generate Triangle Grid" button
document.getElementById('generateTriangleGrid').addEventListener('click', () => {
    clearGrid(); // Clear any existing grids
    fillWithTriangles(); // Only generate triangles when this button is clicked
    currentTiling = 'triangles'; // Set the current tiling type to triangles
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

// Event listener for clicking on hexagons or triangles
canvas.addEventListener('click', (e) => {
    if (!isColorMode) return; // Do nothing if not in color mode

    const clickX = e.offsetX;
    const clickY = e.offsetY;

    if (currentTiling === 'hexagons') {
        hexagons.forEach(hex => {
            if (isPointInHexagon(clickX, clickY, hex.x, hex.y)) {
                hex.color = selectedColor; // Change hexagon color
                drawHexagon(hex.x, hex.y, hex.color);
            }
        });
    } else if (currentTiling === 'triangles') {
        triangles.forEach(triangle => {
            if (isPointInTriangle(clickX, clickY, triangle)) {
                triangle.color = selectedColor; // Change triangle color
                drawTriangle(triangle);
            }
        });
    }
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

    // Redraw hexagons or triangles based on current grid
    if (currentTiling === 'hexagons') {
        hexagons.forEach(hex => drawHexagon(hex.x, hex.y, hex.color));
    } else if (currentTiling === 'triangles') {
        triangles.forEach(triangle => drawTriangle(triangle));
    }
}

// Clear existing grids
function clearGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
    hexagons = [];
    triangles = [];
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
                    y += hexHeight / 2; // Staggered rows
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

// Draw hexagon
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

// Check if a triangle is fully inside the shape
function isTriangleFullyInside(triangle, shape) {
    return (
        isPointInShape(triangle.x1, triangle.y1, shape) &&
        isPointInShape(triangle.x2, triangle.y2, shape) &&
        isPointInShape(triangle.x3, triangle.y3, shape)
    );
}

// Fill all drawn shapes with triangles
function fillWithTriangles() {
    const cols = Math.ceil(canvas.width / triangleSize);
    const rows = Math.ceil(canvas.height / triangleHeight);

    shapes.forEach(shape => {
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                let x = col * triangleSize;
                let y = row * triangleHeight;

                // Two triangles per grid cell
                const triangle1 = {
                    x1: x, y1: y,
                    x2: x + triangleSize, y2: y,
                    x3: x + triangleSize / 2, y3: y + triangleHeight,
                    color: 'blue'
                };

                const triangle2 = {
                    x1: x + triangleSize / 2, y1: y + triangleHeight,
                    x2: x, y2: y + triangleHeight * 2,
                    x3: x + triangleSize, y3: y + triangleHeight,
                    color: 'blue'
                };

                if (isTriangleFullyInside(triangle1, shape)) {
                    triangles.push(triangle1);
                    drawTriangle(triangle1);
                }

                if (isTriangleFullyInside(triangle2, shape)) {
                    triangles.push(triangle2);
                    drawTriangle(triangle2);
                }
            }
        }
    });
}

// Draw triangle
function drawTriangle(triangle) {
    const { x1, y1, x2, y2, x3, y3, color } = triangle;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.strokeStyle = 'black';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
}

// Check if the entire hexagon is inside the shape
function isHexagonFullyInside(x, y, shape) {
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const xOffset = x + hexRadius * Math.cos(angle);
        const yOffset = y + hexRadius * Math.sin(angle);  // Corrected here
        if (!isPointInShape(xOffset, yOffset, shape)) {
            return false; // If any point is outside the shape, return false
        }
    }
    return true; // If all points are inside the shape, return true
}

