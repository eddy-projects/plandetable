const SVG_NS = "http://www.w3.org/2000/svg";

// Geometry Constraints
const R_IN = 262.5; // Inner radius
const R_OUT = 351.7; // Outer radius
const TABLE_ANGLE_DEG = 15.324; // Angle per table in degrees

let TABLE_SPACING = 100; // default spacing between tips

let LEFT_CENTER = { x: 0, y: 500 };
let RIGHT_CENTER = { x: 0, y: 500 };

function calculateCenters() {
    const leftTipAngle = (-90 + (13 * TABLE_ANGLE_DEG) / 2) * (Math.PI / 180);
    const rightTipAngle = (90 - (9 * TABLE_ANGLE_DEG) / 2) * (Math.PI / 180);

    const leftTipOffsetX = R_OUT * Math.sin(leftTipAngle);
    const rightTipOffsetX = R_OUT * Math.sin(rightTipAngle);

    const centerDiff = TABLE_SPACING + leftTipOffsetX - rightTipOffsetX;

    LEFT_CENTER = { x: 1000 - centerDiff / 2, y: 500 };
    RIGHT_CENTER = { x: 1000 + centerDiff / 2, y: 500 };
}
calculateCenters();

// App State
let state = {
    chairs: [],
    currentTool: 'ext', // 'ext', 'int', 'delete', 'autofill'
    selectedChairId: null,
    nextChairId: 1,
    draggingChair: null,
    dragOffset: { x: 0, y: 0 },
    dragged: false,
    dragStart: { x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    vbStart: { x: 0, y: 0, w: 2000, h: 1000 }
};

let vb = { x: 0, y: 0, w: 2000, h: 1000 };

// DOM Elements
const canvas = document.getElementById('svg-canvas');
const svgElem = document.getElementById('svg-canvas');
const layerLeft = document.getElementById('tables-left');
const layerRight = document.getElementById('tables-right');
const chairsLayer = document.getElementById('chairs-layer');

const countExt = document.getElementById('count-ext');
const countInt = document.getElementById('count-int');
const countLeft = document.getElementById('count-left');
const countRight = document.getElementById('count-right');

const modal = document.getElementById('name-modal');
const nameInput = document.getElementById('chair-name-input');

// Math Utils
function normalizeAngle(a) {
    while (a <= -180) a += 360;
    while (a > 180) a -= 360;
    return a;
}

// Initialize Tools
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Autofill doesn't change mode
        if (e.currentTarget.dataset.type === 'autofill') return;
        
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        state.currentTool = e.currentTarget.dataset.type;
    });
});
document.getElementById('tool-add-ext').classList.add('active');

// Add Chairs via Buttons (Only active when in ext or int mode)
document.getElementById('tool-add-ext').addEventListener('click', () => {
    if (state.currentTool === 'ext') addChair(true);
});
document.getElementById('tool-add-int').addEventListener('click', () => {
    if (state.currentTool === 'int') addChair(false);
});

document.getElementById('tool-autofill').addEventListener('click', () => {
    if (confirm("Attention, cela va effacer toutes les chaises actuelles. Continuer ?")) {
        autoFillChairs();
    }
});

const spacingInput = document.getElementById('spacing-input');
spacingInput.addEventListener('change', (e) => {
    const oldLeft = { ...LEFT_CENTER };
    const oldRight = { ...RIGHT_CENTER };
    
    TABLE_SPACING = Math.max(0, parseInt(e.target.value) || 0);
    calculateCenters();
    
    const dxLeft = LEFT_CENTER.x - oldLeft.x;
    const dxRight = RIGHT_CENTER.x - oldRight.x;

    // Move tables
    layerLeft.setAttribute('transform', `translate(${LEFT_CENTER.x}, ${LEFT_CENTER.y})`);
    layerRight.setAttribute('transform', `translate(${RIGHT_CENTER.x}, ${RIGHT_CENTER.y})`);

    // Move associated chairs
    state.chairs.forEach(c => {
        const distLeft = Math.hypot(c.x - oldLeft.x, c.y - oldLeft.y);
        const distRight = Math.hypot(c.x - oldRight.x, c.y - oldRight.y);
        if (distLeft < distRight) {
            c.x += dxLeft;
        } else {
            c.x += dxRight;
        }
    });
    renderChairs();
    localStorage.setItem('planDeTableSpacing', TABLE_SPACING);
});

function createPolygon(points, className, id, data) {
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('class', className);
    if (id) poly.setAttribute('id', id);
    if (data) {
        Object.keys(data).forEach(k => poly.dataset[k] = data[k]);
    }
    return poly;
}

function describeArc(x, y, radius, startAngle, endAngle) {
    const start = {
        x: x + radius * Math.sin(startAngle * Math.PI / 180),
        y: y - radius * Math.cos(startAngle * Math.PI / 180)
    };
    const end = {
        x: x + radius * Math.sin(endAngle * Math.PI / 180),
        y: y - radius * Math.cos(endAngle * Math.PI / 180)
    };
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    // For SVG arcs, 1 = clockwise, 0 = counter-clockwise. Since we use SVG coordinates (y down), 
    // angle increases clockwise. So sweep-flag is 1.
    return [
        "M", start.x, start.y, 
        "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
    ].join(" ");
}

function drawTables() {
    // Clean layers
    layerLeft.innerHTML = '';
    layerRight.innerHTML = '';

    // Generate one table base coordinates (facing upwards = 0 deg)
    const halfAngleRad = (TABLE_ANGLE_DEG / 2) * (Math.PI / 180);
    const yIn = R_IN * Math.cos(halfAngleRad);
    const yOut = R_OUT * Math.cos(halfAngleRad);
    
    const pts = [
        { x: -35, y: -yIn }, // Top-left (inner)
        { x: 35, y: -yIn },  // Top-right (inner)
        { x: 47, y: -yOut }, // Bottom-right (outer)
        { x: -47, y: -yOut } // Bottom-left (outer)
    ];

    layerLeft.setAttribute('transform', `translate(${LEFT_CENTER.x}, ${LEFT_CENTER.y})`);
    layerRight.setAttribute('transform', `translate(${RIGHT_CENTER.x}, ${RIGHT_CENTER.y})`);

    // Draw Guide Lines (15cm track)
    // Exterior track radius (R_OUT + 15 + half_chair_size) -> Let's use 15cm from table edge visually, and chairs snap their centers there
    // Actually user says "une ligne de 15 cm", so let's draw exactly at R_OUT + 15. The chairs will center on it.
    const guideR_OUT = R_OUT + 15;
    const guideR_IN = R_IN - 15;

    // Left Semi-circle: 14 tables, centered around -90 deg (LEFT)
    let startAngleLeft = -90 - (13 * TABLE_ANGLE_DEG) / 2;
    let endAngleLeft = startAngleLeft + 13 * TABLE_ANGLE_DEG;
    
    // Left guide lines
    const leftGuideOut = document.createElementNS(SVG_NS, 'path');
    leftGuideOut.setAttribute('d', describeArc(0, 0, guideR_OUT, startAngleLeft, endAngleLeft));
    leftGuideOut.setAttribute('class', 'guide-line');
    layerLeft.appendChild(leftGuideOut);

    const leftGuideIn = document.createElementNS(SVG_NS, 'path');
    leftGuideIn.setAttribute('d', describeArc(0, 0, guideR_IN, startAngleLeft, endAngleLeft));
    leftGuideIn.setAttribute('class', 'guide-line');
    layerLeft.appendChild(leftGuideIn);

    for (let i = 0; i < 14; i++) {
        const angle = startAngleLeft + i * TABLE_ANGLE_DEG;
        const poly = createPolygon(pts, 'table-shape', `table-left-${i}`, { side: 'left', index: i });
        poly.setAttribute('transform', `rotate(${angle})`);
        layerLeft.appendChild(poly);
    }

    // Right Semi-circle: 10 tables, centered around 90 deg (RIGHT)
    let startAngleRight = 90 - (9 * TABLE_ANGLE_DEG) / 2;
    let endAngleRight = startAngleRight + 9 * TABLE_ANGLE_DEG;

    // Right guide lines
    const rightGuideOut = document.createElementNS(SVG_NS, 'path');
    rightGuideOut.setAttribute('d', describeArc(0, 0, guideR_OUT, startAngleRight, endAngleRight));
    rightGuideOut.setAttribute('class', 'guide-line');
    layerRight.appendChild(rightGuideOut);

    const rightGuideIn = document.createElementNS(SVG_NS, 'path');
    rightGuideIn.setAttribute('d', describeArc(0, 0, guideR_IN, startAngleRight, endAngleRight));
    rightGuideIn.setAttribute('class', 'guide-line');
    layerRight.appendChild(rightGuideIn);

    for (let i = 0; i < 10; i++) {
        const angle = startAngleRight + i * TABLE_ANGLE_DEG;
        const poly = createPolygon(pts, 'table-shape', `table-right-${i}`, { side: 'right', index: i });
        poly.setAttribute('transform', `rotate(${angle})`);
        layerRight.appendChild(poly);
    }
}

function autoFillChairs() {
    state.chairs = [];
    state.nextChairId = 1;

    const guideR_OUT = R_OUT + 15;
    const guideR_IN = R_IN - 15;

    function fillArc(isLeft, isExt) {
        const R = isExt ? guideR_OUT : guideR_IN;
        const size = isExt ? 53 : 47;
        const dAngle = ((size + 15) / R) * (180 / Math.PI); // Angle step
        const center = isLeft ? LEFT_CENTER : RIGHT_CENTER;
        
        const numTables = isLeft ? 14 : 10;
        const middleAngle = isLeft ? -90 : 90;
        const totalAngleRange = numTables * TABLE_ANGLE_DEG;
        
        let N = Math.floor(totalAngleRange / dAngle);
        
        // If it's left side (bride/groom side), we force N to be even so there are exactly 2 central chairs
        if (isLeft && N % 2 !== 0) {
            N -= 1;
        }

        const startAngle = middleAngle - (N * dAngle) / 2 + dAngle / 2;

        for (let i = 0; i < N; i++) {
            const angleDeg = startAngle + i * dAngle;
            
            // Check left side conditions for Bride and Groom
            let isBrideGroom = false;
            if (isLeft) {
                // If it's left arc, and it's the 2 central chairs (index N/2 - 1 and N/2)
                if (i === N / 2 - 1 || i === N / 2) {
                    if (isExt) {
                        isBrideGroom = true; // Bride and Groom exterior chairs
                    } else {
                        // Skip placing these 2 chairs on the interior (empty space opposite them)
                        continue;
                    }
                }
            }

            const angleRad = angleDeg * (Math.PI / 180);
            const x = center.x + R * Math.sin(angleRad);
            const y = center.y - R * Math.cos(angleRad);

            state.chairs.push({
                id: state.nextChairId++,
                isExt,
                x, y,
                angle: normalizeAngle(angleDeg),
                name: '',
                gender: 'unassigned',
                isBrideGroom
            });
        }
    }

    fillArc(true, true);   // Left Out
    fillArc(true, false);  // Left In
    fillArc(false, true);  // Right Out
    fillArc(false, false); // Right In

    renderChairs();
    updateCounters();
    localStorage.setItem('planDeTableState', JSON.stringify(state.chairs));
}

function addChair(isExt) {
    // Create it in the middle alley (x: 1000, y: 500)
    const newChair = {
        id: state.nextChairId++,
        isExt,
        x: 1000,
        y: 500,
        angle: 0,
        name: '',
        gender: 'unassigned'
    };
    state.chairs.push(newChair);
    renderChairs();
    updateCounters();
}

// SVG coordinate transformation
function getMousePosition(evt) {
    const CTM = svgElem.getScreenCTM();
    return {
        x: (evt.clientX - CTM.e) / CTM.a,
        y: (evt.clientY - CTM.f) / CTM.d
    };
}

// Zoom Logic
svgElem.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const direction = e.deltaY > 0 ? 1 : -1;
    const factor = direction > 0 ? zoomFactor : 1 / zoomFactor;

    const rect = svgElem.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const vX = vb.x + (mouseX / rect.width) * vb.w;
    const vY = vb.y + (mouseY / rect.height) * vb.h;

    const newW = vb.w * factor;
    const newH = vb.h * factor;

    if (newW > 6000 || newW < 200) return;

    vb.x = vX - (mouseX / rect.width) * newW;
    vb.y = vY - (mouseY / rect.height) * newH;
    vb.w = newW;
    vb.h = newH;

    svgElem.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}, { passive: false });

// Drag & Drop Logic
svgElem.addEventListener('mousedown', (e) => {
    let target = e.target;
    // Find closest chair group
    while (target && target.tagName !== 'svg') {
        if (target.classList && target.classList.contains('chair')) {
            const id = parseInt(target.dataset.id);
            const chair = state.chairs.find(c => c.id === id);
            
            if (state.currentTool === 'delete') {
                removeChair(id);
                return;
            }

            if (chair) {
                state.draggingChair = chair;
                state.dragStart = { x: e.clientX, y: e.clientY };
                state.dragged = false;
                const pos = getMousePosition(e);
                state.dragOffset = { x: chair.x - pos.x, y: chair.y - pos.y };
                svgElem.style.cursor = 'grabbing';
            }
            return;
        }
        target = target.parentNode;
    }

    // If we clicked on background, start panning
    state.isPanning = true;
    state.panStart = { x: e.clientX, y: e.clientY };
    state.vbStart = { ...vb };
    svgElem.style.cursor = 'move';
});

svgElem.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
        const dx = e.clientX - state.panStart.x;
        const dy = e.clientY - state.panStart.y;
        
        const rect = svgElem.getBoundingClientRect();
        const ratioX = vb.w / rect.width;
        const ratioY = vb.h / rect.height;

        vb.x = state.vbStart.x - dx * ratioX;
        vb.y = state.vbStart.y - dy * ratioY;
        
        svgElem.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
        return;
    }

    if (!state.draggingChair) return;
    
    // Only flag as drag if moved more than 3 pixels
    const moveDist = Math.hypot(e.clientX - state.dragStart.x, e.clientY - state.dragStart.y);
    if (moveDist > 3) {
        state.dragged = true;
    }
    
    const pos = getMousePosition(e);
    let newX = pos.x + state.dragOffset.x;
    let newY = pos.y + state.dragOffset.y;

    // Calculate nearest center (Left or Right)
    const distLeft = Math.hypot(newX - LEFT_CENTER.x, newY - LEFT_CENTER.y);
    const distRight = Math.hypot(newX - RIGHT_CENTER.x, newY - RIGHT_CENTER.y);
    
    const isLeft = distLeft < distRight;
    const center = isLeft ? LEFT_CENTER : RIGHT_CENTER;
    const distance = isLeft ? distLeft : distRight;

    // Calculate angle from center
    let angleRad = Math.atan2(newY - center.y, newX - center.x);
    let angleDeg = angleRad * (180 / Math.PI) + 90;

    // Strict sticking to the 15cm lines
    // "déplacer sur ces lignes"
    const guideR_OUT = R_OUT + 15;
    const guideR_IN = R_IN - 15;

    // If chair is exterior, force distance to guideR_OUT.
    // If chair is interior, force distance to guideR_IN.
    let finalDistance = state.draggingChair.isExt ? guideR_OUT : guideR_IN;

    newX = center.x + finalDistance * Math.cos(angleRad);
    newY = center.y + finalDistance * Math.sin(angleRad);

    state.draggingChair.x = newX;
    state.draggingChair.y = newY;
    state.draggingChair.angle = normalizeAngle(angleDeg);

    renderChairs();
});

svgElem.addEventListener('mouseup', (e) => {
    if (state.isPanning) {
        state.isPanning = false;
        svgElem.style.cursor = 'grab';
        return;
    }

    if (state.draggingChair) {
        const wasDragged = state.dragged;
        const clickedId = state.draggingChair.id;
        state.draggingChair = null;
        svgElem.style.cursor = 'grab';
        updateCounters();
        
        if (!wasDragged && state.currentTool !== 'delete') {
            openNameModal(clickedId);
        }
    } else {
        // If we didn't drag, and not in delete mode, open name modal
        if (state.currentTool !== 'delete') {
            let target = e.target;
            while (target && target.tagName !== 'svg') {
                if (target.classList && target.classList.contains('chair')) {
                    const id = parseInt(target.dataset.id);
                    openNameModal(id);
                    return;
                }
                target = target.parentNode;
            }
        }
    }
});

function removeChair(id) {
    state.chairs = state.chairs.filter(c => c.id !== id);
    renderChairs();
    updateCounters();
}

function renderChairs() {
    chairsLayer.innerHTML = '';
    state.chairs.forEach(chair => {
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('transform', `translate(${chair.x}, ${chair.y}) rotate(${chair.angle})`);
        group.setAttribute('class', 'chair');
        group.dataset.id = chair.id;

        const size = chair.isExt ? 53 : 47;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', -size/2);
        rect.setAttribute('y', -size/2);
        rect.setAttribute('width', size);
        rect.setAttribute('height', size);
        rect.setAttribute('rx', chair.isExt ? 4 : 20);
        
        let shapeClass = `chair-shape`;
        if (chair.isBrideGroom) {
            shapeClass += ' bride-groom';
        } else if (chair.gender === 'F') {
            shapeClass += ' female';
        } else if (chair.gender === 'M') {
            shapeClass += ' male';
        } else {
            shapeClass += ' unassigned';
        }
        rect.setAttribute('class', shapeClass);
        
        group.appendChild(rect);

        if (chair.name) {
            const text = document.createElementNS(SVG_NS, 'text');
            text.setAttribute('class', 'chair-text');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('alignment-baseline', 'middle');
            text.textContent = chair.name;
            text.setAttribute('transform', `rotate(${-chair.angle})`);
            group.appendChild(text);
        }

        chairsLayer.appendChild(group);
    });
}

function updateCounters() {
    let ext = 0, int = 0, left = 0, right = 0;
    state.chairs.forEach(c => {
        if (c.isExt) ext++; else int++;
        
        // determine side purely by X coordinate relative to center 1000
        if (c.x < 1000) left++; else right++;
    });
    countExt.textContent = ext;
    countInt.textContent = int;
    countLeft.textContent = left;
    countRight.textContent = right;
}

function openNameModal(id) {
    state.selectedChairId = id;
    const chair = state.chairs.find(c => c.id === id);
    nameInput.value = chair.name || '';
    
    // Set radio button
    const gender = chair.gender || 'unassigned';
    const radio = document.querySelector(`input[name="chair-gender"][value="${gender}"]`);
    if (radio) radio.checked = true;

    modal.classList.remove('hidden');
    nameInput.focus();
}

document.getElementById('btn-cancel-name').addEventListener('click', () => {
    modal.classList.add('hidden');
});

document.getElementById('btn-save-name').addEventListener('click', () => {
    const chair = state.chairs.find(c => c.id === state.selectedChairId);
    if (chair) {
        chair.name = nameInput.value.trim();
        const selectedRadio = document.querySelector('input[name="chair-gender"]:checked');
        if (selectedRadio) {
            chair.gender = selectedRadio.value;
        }
        renderChairs();
    }
    modal.classList.add('hidden');
});

document.getElementById('btn-delete-name').addEventListener('click', () => {
    removeChair(state.selectedChairId);
    modal.classList.add('hidden');
});

document.getElementById('btn-save').addEventListener('click', () => {
    localStorage.setItem('planDeTableState', JSON.stringify(state.chairs));
    alert('Plan de table sauvegardé !');
});

// Init
const saved = localStorage.getItem('planDeTableState');
const savedSpacing = localStorage.getItem('planDeTableSpacing');
if (savedSpacing) {
    TABLE_SPACING = parseInt(savedSpacing) || 100;
    if (spacingInput) spacingInput.value = TABLE_SPACING;
    calculateCenters();
}
if (saved) {
    state.chairs = JSON.parse(saved);
    state.nextChairId = Math.max(...state.chairs.map(c => c.id), 0) + 1;
    renderChairs();
    updateCounters();
}
drawTables();
