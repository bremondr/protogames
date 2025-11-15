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
let shapeGrid = []; // 2D array for hexagons
let selectedColor = colorPicker.value; // Default color for brushing
let isBrushing = false;
let defaultColor = 'rgba(0, 0, 0, 0)';

colorPicker.addEventListener('change', (e) => {
    const selectedValue = e.target.value;
    if (selectedValue === 'grey-border') {
        selectedColor = 'grey-border'; // Special mode for grey border
    } else if (selectedValue === 'eraser') {
        selectedColor = 'eraser'; // Special mode for eraser
    } else {
        selectedColor = selectedValue; // Normal color mode
    }
});

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapeGrid = []; // Clear the hex grid data
}

function drawHexagon(x, y, color, rotation = 0, strColor = 'rgba(128, 128, 128, 0.1)', pathOverride = null) {
    const path = pathOverride || createHexPath(x, y, rotation);
    ctx.save(); // Save the current drawing state
    ctx.strokeStyle = strColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = color;
    ctx.stroke(path);
    ctx.fill(path);
    ctx.restore(); // Restore the previous drawing state
}

function redrawHexagon(hexagon) {
    clearCanvas(); // Clear the entire canvas
    for (const row of shapeGrid) {
        for (const hex of row) {
            drawHexagon(hex.x, hex.y, hex.color, hex.rotation, 'rgba(128, 128, 128, 0.1)', hex.path); // Redraw all hexagons
        }
    }
}

function drawTriangle(x, y, size, flipped, color, strColor = 'rgba(128, 128, 128, 0.1)', pathOverride = null) {
    const path = pathOverride || createTrianglePath(x, y, size, flipped);

    ctx.save(); // Save the current state of the canvas
    ctx.lineWidth = 1;
    ctx.strokeStyle = strColor;
    ctx.fillStyle = color || defaultColor; // Use passed color or default to white
    ctx.stroke(path);
    ctx.fill(path);
    ctx.restore(); // Restore the previous canvas state
}

function createHexPath(x, y, rotation = 0) {
    const path = new Path2D();

    for (let i = 0; i < 6; i++) {
        const angle = rotation + (Math.PI / 3) * i;
        const xOffset = hexRadius * Math.cos(angle);
        const yOffset = hexRadius * Math.sin(angle);
        if (i === 0) {
            path.moveTo(x + xOffset, y + yOffset);
        } else {
            path.lineTo(x + xOffset, y + yOffset);
        }
    }

    path.closePath();
    return path;
}

function createTrianglePath(x, y, size, flipped) {
    const path = new Path2D();
    const height = (Math.sqrt(3) / 2) * size;

    if (flipped) {
        path.moveTo(x, y + height); // Bottom vertex
        path.lineTo(x + size / 2, y); // Top-right
        path.lineTo(x - size / 2, y); // Top-left
    } else {
        path.moveTo(x, y); // Top vertex
        path.lineTo(x - size / 2, y + height); // Bottom-left
        path.lineTo(x + size / 2, y + height); // Bottom-right
    }

    path.closePath();
    return path;
}

function generateFlatTopGrid() {
    clearCanvas();

    const horiz = (3 / 2) * hexRadius;
    const vert = hexHeight;

    const cols = Math.floor((canvas.width - 2 * margin) / horiz);
    const rows = Math.floor((canvas.height - 2 * margin) / vert);

    shapeGrid = [];

    for (let r = 0; r < rows; r++) {
        shapeGrid[r] = [];

        for (let q = 0; q < cols; q++) {
            let x = q * horiz + margin;
            let y = r * vert + margin;

            if (q % 2 !== 0) {
                y += vert / 2;
            }

            if (x + hexRadius <= canvas.width - margin && y + hexHeight / 2 <= canvas.height - margin) {
                const rotation = 0;
                const path = createHexPath(x, y, rotation);
                shapeGrid[r][q] = { x, y, color: defaultColor, rotation, type: 'FlatTopHex', path };
                drawHexagon(x, y, defaultColor, rotation, 'rgba(128, 128, 128, 0.1)', path);
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

    shapeGrid = [];

    for (let r = 0; r < rows; r++) {
        shapeGrid[r] = [];

        for (let q = 0; q < cols; q++) {
            let x = q * horiz + margin;
            let y = r * vert + margin;

            if (r % 2 !== 0) {
                x += (hexRadius * Math.sqrt(3)) / 2;
            }

            if (x + hexWidth / 2 <= canvas.width - margin && y + hexHeight / 2 <= canvas.height - margin) {
                const rotation = Math.PI / 6;
                const path = createHexPath(x, y, rotation);
                shapeGrid[r][q] = { x, y, color: defaultColor, rotation, type: 'PointyTopHex', path };
                drawHexagon(x, y, defaultColor, rotation, 'rgba(128, 128, 128, 0.1)', path);
            }
        }
    }
}

function generateTriangleGrid() {
    clearCanvas();

    const triangleHeight = (Math.sqrt(3) / 2) * hexRadius; // Height of an equilateral triangle
    const triangleWidth = hexRadius; // Base of the equilateral triangle
    const cols = Math.floor((canvas.width - 2 * margin) / (triangleWidth / 2)); // Use Math.floor to avoid overflow
    const rows = Math.floor((canvas.height - 2 * margin) / triangleHeight); // Use Math.floor to avoid overflow

    // Initialize triangle grid
    shapeGrid = [];

    for (let r = 0; r < rows; r++) {
        shapeGrid[r] = []; // Initialize row

        for (let c = 0; c < cols; c++) {
            let x = c * triangleWidth / 2 + margin;
            let y = r * triangleHeight + margin;

            // Shift every second row by one triangle width
            if (r % 2 === 1) {
                x += triangleWidth / 2;
            }
            // Ensure that triangles are within the canvas bounds before drawing
            if (x + hexRadius / 2 <= canvas.width - margin && y + triangleHeight / 2 <= canvas.height - margin) {
                // Rotate every second triangle within a row
                const flipped = (c % 2 === 1);
                const path = createTrianglePath(x, y, hexRadius, flipped);

                // Store triangle data in the 2D array
                shapeGrid[r][c] = {
                    x: x,
                    y: y,
                    color: defaultColor,
                    flipped: flipped,
                    type: 'triangle',
                    path: path
                };

                // Draw triangle with color
                drawTriangle(x, y, hexRadius, flipped, defaultColor, 'rgba(128, 128, 128, 0.1)', path);
            }
        }
    }
}

function isPointInFlatTopHexagon(px, py, hex) {
    return ctx.isPointInPath(hex.path, px, py);
}

function isPointInPointyTopHexagon(px, py, hex) {
    return ctx.isPointInPath(hex.path, px, py);
}

function isPointInTriangle(px, py, triangle) {
    return ctx.isPointInPath(triangle.path, px, py);
}

function updateHexagonColor(hexagon, color) {
    if (color == 'grey-border') {
        drawHexagon(hexagon.x, hexagon.y, hexagon.color, hexagon.rotation, 'black', hexagon.path); // Redraw hexagon with new border color
    } else if (color === 'eraser') {
        color = 'white'; // Eraser mode sets hexagon to white
        hexagon.color = color;
        drawHexagon(hexagon.x, hexagon.y, color, hexagon.rotation, 'black', hexagon.path);
    }
    else if (hexagon.color !== color) {
        hexagon.color = color;
        drawHexagon(hexagon.x, hexagon.y, color, hexagon.rotation, "black", hexagon.path); // Redraw hexagon with new color
    }
}

function updateTriangleColor(triangle, color) {
    console.log("triangle");
    if (color === 'grey-border') {
        drawTriangle(triangle.x, triangle.y, hexRadius, triangle.flipped, triangle.color, 'black', triangle.path); // Redraw with grey border
    } else if (color === 'eraser') {
        triangle.color = 'white'; // Erase color
        drawTriangle(triangle.x, triangle.y, hexRadius, triangle.flipped, 'white', undefined, triangle.path);
    } else {
        triangle.color = color;
        drawTriangle(triangle.x, triangle.y, hexRadius, triangle.flipped, color, 'black', triangle.path);
    }
}

function redrawGrid() {
    switch (shapeGrid[0][0].type) {
        case 'FlatTopHex':
            generateFlatTopGrid();
            break;
        case 'PointyTopHex':
            generatePointyTopGrid();
            break;
        case 'triangle':
            generateTriangleGrid();
            break;
    }
}

function paintShapes(x, y) {
    for (const row of shapeGrid) {
        for (const shape of row) {
            switch (shape.type) {
                case 'triangle':
                    if (isPointInTriangle(x, y, shape)) {
                        updateTriangleColor(shape, selectedColor);
                    }
                    break;
                case 'PointyTopHex':
                    if (isPointInPointyTopHexagon(x, y, shape)) {
                        updateHexagonColor(shape, selectedColor);
                    }
                    break;
                case 'FlatTopHex':
                    if (isPointInFlatTopHexagon(x, y, shape)) {
                        updateHexagonColor(shape, selectedColor);
                    }
                    break;
                default:
                    console.log("unknown shape");
            }
        }
    }
}

canvas.addEventListener('mousedown', (e) => {
    isBrushing = true;
    paintShapes(e.offsetX, e.offsetY);
});

canvas.addEventListener('mouseup', () => {
    isBrushing = false;
});

canvas.addEventListener('mousemove', (e) => {
    if (isBrushing) {
        paintShapes(e.offsetX, e.offsetY);
    }
});

// Handle touch events for mobile devices
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling
    isBrushing = true;
    const touch = e.touches[0];
    paintShapes(touch.clientX - canvas.getBoundingClientRect().left, touch.clientY - canvas.getBoundingClientRect().top);
});

canvas.addEventListener('touchend', () => {
    isBrushing = false;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling
    if (isBrushing) {
        const touch = e.touches[0];
        paintShapes(touch.clientX - canvas.getBoundingClientRect().left, touch.clientY - canvas.getBoundingClientRect().top);
    }
});

const hexSizeSlider = document.getElementById('hexSize');

hexSizeSlider.addEventListener('input', (e) => {
    //console.log(e.target.value);
    hexRadius = Number(e.target.value);
    hexHeight = Math.sqrt(3) * hexRadius;
    hexWidth = 2 * hexRadius;
    if (shapeGrid.length > 1) {
        redrawGrid();
    }
});

function exportCanvasAsPNG() {
    const canvas = document.getElementById('drawCanvas');
    const link = document.createElement('a');
    link.download = 'canvas_image.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function drawPointsOnCanvas(pointsArray) {
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');

    // Iterate through each group of points
    pointsArray.forEach(row => {
        row.forEach(point => {
            drawPoint(ctx, point.x, point.y);
        });
    });
}

// Helper function to draw a point
function drawPoint(ctx, x, y) {
    const radius = hexHeight / 2; // Set point size (radius)
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = 'grey'; // Color of the points
    ctx.strokeStyle = 'black'
    ctx.stroke();
    ctx.closePath();
}
