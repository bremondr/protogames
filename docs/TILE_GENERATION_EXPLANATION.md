# Hexagon Triangle Board Generation - Step by Step Explanation

## Entry Point
When user selects "Hexagon" board shape with "Triangle" tile type and radius=3, it calls:
```javascript
buildHexagonTriangleGrid(config, canvas, colorMap, radius=3, orientation)
```

## Step 1: Validate and Parse Inputs
```javascript
const rings = 3  // User's input
const hexOrientation = 'pointy-top' or 'flat-top'
```

## Step 2: Calculate Triangle Size
```javascript
const hexWidthUnit = Math.sqrt(3)  // for pointy-top orientation
const hexHeightUnit = 2

// Figure out how large each triangle can be
const availableWidth = canvas.width - padding
const availableHeight = canvas.height - padding

// What's the largest hex that fits?
const maxHexSize = Math.floor(Math.min(
  availableWidth / Math.sqrt(3),    // ÷ 1.732
  availableHeight / 2
))
// Example: maxHexSize = 200

// Divide by number of rings to get individual triangle size
const triangleSize = Math.floor(maxHexSize / 3)
// Example: triangleSize = 66 pixels

// This determines the actual hex radius we'll create
const hexRadius = triangleSize * rings
// Example: hexRadius = 66 * 3 = 198 pixels

const triangleHeight = (Math.sqrt(3) / 2) * triangleSize
// Example: triangleHeight = 57.2 pixels
```

**KEY INSIGHT**: The hexagon is built by arranging triangles in a grid pattern. The hexRadius determines how large the final hexagon will be.

## Step 3: Position the Hexagon on Canvas
```javascript
const hexWidth = hexWidthUnit * hexRadius
const hexHeight = hexHeightUnit * hexRadius
// Example: hexWidth = 198 * 1.732 = 343, hexHeight = 198 * 2 = 396

// Center it
const offsetX = (canvas.width - hexWidth) / 2
const offsetY = (canvas.height - hexHeight) / 2

const hexCenter = {
  x: offsetX + hexWidth / 2,
  y: offsetY + hexHeight / 2
}
// This is the CENTER point of the hexagon
```

## Step 4: Create the Triangle Lattice Anchor
The triangles are arranged in a regular lattice. We need to position this lattice:

```javascript
const anchorX = hexCenter.x - triangleSize / 2
const anchorY = hexCenter.y
// This is the top-left corner of a reference triangle at the center
```

**KEY INSIGHT**: The lattice is anchored such that the center of the hexagon is at a lattice vertex, ensuring symmetry.

## Step 5: Determine Which Triangles to Generate
Instead of checking every possible triangle in the world, we bound our search:

```javascript
const minX = offsetX - triangleSize
const maxX = offsetX + hexWidth + triangleSize
const minY = offsetY - triangleHeight
const maxY = offsetY + hexHeight + triangleHeight

// Convert bounding box to row/col indices in our lattice
const rowStart = Math.floor((minY - anchorY) / triangleHeight) - 2
const rowEnd = Math.ceil((maxY - anchorY) / triangleHeight) + 2
const colStart = Math.floor(((minX - anchorX) * 2) / triangleSize) - 2
const colEnd = Math.ceil(((maxX - anchorX) * 2) / triangleSize) + 2

// Example: rowStart = -5, rowEnd = 8, colStart = -10, colEnd = 10
```

**KEY INSIGHT**: We generate ALL triangles in a bounding box, then filter which ones to keep.

## Step 6: Loop Through All Candidate Triangles
```javascript
for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
        
        // Calculate this triangle's position
        const originY = anchorY + row * triangleHeight
        const originX = anchorX + (col * triangleSize) / 2
        
        // Determine orientation (alternating up/down)
        const pointingUp = (row + col) % 2 === 0
        
        // Calculate the 3 vertices of this triangle
        const vertices = createTriangleVertices(
          { x: originX, y: originY }, 
          triangleSize, 
          pointingUp
        )
        
        // Find center point
        const center = {
          x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
          y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3
        }
```

## Step 7: THE CRITICAL FILTERING STEP - Distance Check
```javascript
        // Calculate distance from hex center to this triangle's center
        const dx = center.x - hexCenter.x
        const dy = center.y - hexCenter.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        // CURRENT LOGIC:
        if (distance <= hexRadius + triangleSize * 0.5) {
          // INCLUDE this triangle
          polygons.push(...)
        }
```

## THE PROBLEM
The current distance-based check is **TOO LOOSE**. It includes triangles beyond where they should be.

What we actually need is to understand:
- For radius N, which triangles form the outer ring?
- The hexagon formed by triangles is NOT a circle - it has 6 straight edges
- A triangle should be included if it's part of the hex structure, not if it's simply within a circular distance

## The Triangle Hexagon Structure
For a radius-3 hexagon with triangles:
- Center: 1 triangle (or technically the lattice point)
- Ring 1: 6 triangles touching the center
- Ring 2: 12 triangles 
- Ring 3: 18 triangles
- Total: 6 * 3² = 54 triangles

The SHAPE should have:
- 6 straight edges (not rounded)
- 6 pointy corners
- Flat sides aligned to the triangle grid

## What `createTriangleVertices` Does
```javascript
function createTriangleVertices(origin, size, pointingUp) {
    const height = (Math.sqrt(3) / 2) * size;
    if (pointingUp) {
        return [
            { x: origin.x + size / 2, y: origin.y },           // tip (top)
            { x: origin.x, y: origin.y + height },           // bottom-left
            { x: origin.x + size, y: origin.y + height }     // bottom-right
        ];
    }
    // downward pointing is inverted
}
```

Given an `origin` (top-left of bounding box) and `size` (base length), it creates an equilateral triangle.

## The Real Issue
The current distance-based filter doesn't account for:
1. The hexagon should have STRAIGHT EDGES made of triangle bases, not curved edges
2. Corner triangles need to be included based on their membership in a ring, not circular distance
3. We need to determine ring membership, not just distance from center

## Better Approach: Ring-Based Membership
Instead of `distance <= hexRadius`, we should:
1. Calculate the ring each triangle belongs to (0 = center, 1 = first ring, etc.)
2. Include triangle if ring <= requested_rings
3. Use axial/cube coordinates (like hex grids use) to determine ring membership

This requires understanding **axial coordinates** - a coordinate system specifically designed for hex grids where:
- Each position is identified by (q, r) coordinates
- Distance is: max(|q|, |r|, |q+r|) / 2
- All triangles at the same distance form a hexagonal ring
