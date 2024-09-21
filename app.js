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

function drawHexagon(x, y, color, rotation = 0, strColor = 'rgba(128, 128, 128, 0.1)') {
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
    ctx.strokeStyle = strColor;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.restore(); // Restore the previous drawing state
}

function redrawHexagon(hexagon) {
    clearCanvas(); // Clear the entire canvas
    for (const row of shapeGrid) {
        for (const hex of row) {
            drawHexagon(hex.x, hex.y, hex.color, hex.rotation); // Redraw all hexagons
        }
    }
}

function drawTriangle(x, y, size, flipped, color, strColor = 'rgba(128, 128, 128, 0.1)') {
    const height = (Math.sqrt(3) / 2) * size; // Height of the equilateral triangle

    ctx.save(); // Save the current state of the canvas
    ctx.lineWidth = 1;

    if (flipped) {
        // When flipped, rotate 180 degrees around the top point (x, y)
        ctx.translate(x, y);
        ctx.rotate(Math.PI); // Rotate 180 degrees
        ctx.translate(-x, -y); // Translate back
        y -= height; // Adjust position to align properly with the top vertex of the original triangle
    }

    // Start drawing the triangle assuming it's upright
    ctx.beginPath();

    // Draw the triangle
    ctx.moveTo(x, y); // Top vertex (or bottom after rotation)
    ctx.lineTo(x - size / 2, y + height); // Bottom left
    ctx.lineTo(x + size / 2, y + height); // Bottom right

    ctx.closePath();

    // Draw the stroke and fill
    ctx.strokeStyle = strColor;
    ctx.stroke();
    ctx.fillStyle = color || 'white'; // Use passed color or default to white
    ctx.fill();

    ctx.restore(); // Restore the previous canvas state
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
                shapeGrid[r][q] = { x, y, color: 'white', rotation: 0, type: 'FlatTopHex' };
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
                shapeGrid[r][q] = { x, y, color: 'white', rotation: Math.PI / 6, type: 'PointyTopHex' };
                drawHexagon(x, y, 'white', Math.PI / 6);
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
                const rotation = flipped ? 180 : 0;

                // Store triangle data in the 2D array
                shapeGrid[r][c] = {
                    x: x,
                    y: y,
                    color: 'white',
                    flipped: flipped,
                    type: 'triangle'
                };

                // Draw triangle with color
                drawTriangle(x, y, hexRadius, flipped, 'white');
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

/* function isPointInTriangle(px, py, triangle) {
    const { x, y, flipped } = triangle;
    const height = (Math.sqrt(3) / 2) * hexRadius;
    
    // Check if point is within bounds for both upright and flipped triangles
    if (flipped) {
        return (px > x - hexRadius / 2 && px < x + hexRadius / 2 && py > y - height && py < y);
    } else {
        return (px > x - hexRadius / 2 && px < x + hexRadius / 2 && py > y && py < y + height);
    }
} */

    function sign(p1, p2, p3) {
        return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    }
    
    function isPointInTriangle(px, py, triangle) {
        const { x, y, flipped } = triangle;
        const height = (Math.sqrt(3) / 2) * hexRadius;
    
        // Define triangle vertices
        let v1, v2, v3;
        if (flipped) {
            // Flipped triangle (base at top)
            v1 = { x: x - hexRadius / 2, y: y };           // Top-left
            v2 = { x: x + hexRadius / 2, y: y };           // Top-right
            v3 = { x: x, y: y + height };                   // Bottom
        } else {
            // Upright triangle (base at bottom)
            v1 = { x: x - hexRadius / 2, y: y + height };  // Bottom-left
            v2 = { x: x + hexRadius / 2, y: y + height };  // Bottom-right
            v3 = { x: x, y: y };                            // Top
        }
    
        // Create point object
        const pt = { x: px, y: py };
    
        // Calculate signs
        const d1 = sign(pt, v1, v2);
        const d2 = sign(pt, v2, v3);
        const d3 = sign(pt, v3, v1);
    
        // Check if the point is inside the triangle
        const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    
        return !(has_neg && has_pos);
    }
    
    


function updateHexagonColor(hexagon, color) {
    if (color == 'grey-border'){
        drawHexagon(hexagon.x, hexagon.y, hexagon.color, hexagon.rotation, 'black'); // Redraw hexagon with new border color
    } else if (color === 'eraser') {
        color = 'white'; // Eraser mode sets hexagon to white
        hexagon.color = color;
        drawHexagon(hexagon.x, hexagon.y, color, hexagon.rotation, 'black');
    }
    else if (hexagon.color !== color) {
        hexagon.color = color;
        drawHexagon(hexagon.x, hexagon.y, color, hexagon.rotation, "black"); // Redraw hexagon with new color
    }
}

function updateTriangleColor(triangle, color) {
    console.log("triangle");
    if (color === 'grey-border') {
        drawTriangle(triangle.x, triangle.y, hexRadius, triangle.flipped, triangle.color, 'black'); // Redraw with grey border
/*         ctx.strokeStyle = 'black'; // Add grey border
        ctx.stroke(); */
    } else if (color === 'eraser') {
        triangle.color = 'white'; // Erase color
        drawTriangle(triangle.x, triangle.y, hexRadius, triangle.flipped, 'white');
    } else {
        triangle.color = color;
        drawTriangle(triangle.x, triangle.y, hexRadius, triangle.flipped, color, 'black');
    }
}

function redrawGrid() {
    switch(shapeGrid[0][0].type){
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

function paintShapes(x,y){
    for (const row of shapeGrid) {
        for (const shape of row) {
            switch (shape.type){
                case 'triangle':
                    if (isPointInTriangle(x, y, shape)) {
                        updateTriangleColor(shape, selectedColor);
                    }
                    break;
                case 'PointyTopHex':
                    if (isPointInPointyTopHexagon(x, y, shape)){
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
    //console.log(e.target.value);
    hexRadius = Number(e.target.value);
    hexHeight = Math.sqrt(3) * hexRadius;
    hexWidth = 2 * hexRadius;
    if(shapeGrid.length > 1){
        redrawGrid();
    }
});


// Initialize grid on page load
//generateFlatTopGrid(); // Or generatePointyTopGrid() based on your default orientation
