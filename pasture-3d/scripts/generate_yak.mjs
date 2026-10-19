import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';

// Polyfill FileReader for GLTFExporter in Node.js
class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = buf;
      if (this.onload) this.onload({ target: this });
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(buf).toString('base64');
      if (this.onload) this.onload({ target: this });
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
}
globalThis.FileReader = FileReader;

export function buildYakModel() {
  const root = new THREE.Group();
  root.name = 'Yak';

  // Materials with DoubleSide, flatShading and exact sampled color palette
  const matBody = new THREE.MeshStandardMaterial({
    name: 'Yak_Body',
    color: 0x853102,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matBodyDark = new THREE.MeshStandardMaterial({
    name: 'Yak_BodyDark',
    color: 0x642401,
    roughness: 0.8,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matHead = new THREE.MeshStandardMaterial({
    name: 'Yak_Head',
    color: 0x923400,
    roughness: 0.7,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matSnout = new THREE.MeshStandardMaterial({
    name: 'Yak_Snout',
    color: 0xef7f19,
    roughness: 0.65,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matNostrils = new THREE.MeshStandardMaterial({
    name: 'Yak_Nostrils',
    color: 0x220e03,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matEyes = new THREE.MeshStandardMaterial({
    name: 'Yak_Eyes',
    color: 0x110702,
    roughness: 0.3,
    metalness: 0.2,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matHorn = new THREE.MeshStandardMaterial({
    name: 'Yak_Horn',
    color: 0xf3cca0,
    roughness: 0.45,
    metalness: 0.08,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matHornBoss = new THREE.MeshStandardMaterial({
    name: 'Yak_HornBoss',
    color: 0xe3a948,
    roughness: 0.5,
    metalness: 0.08,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matBeard = new THREE.MeshStandardMaterial({
    name: 'Yak_Beard',
    color: 0xf1c36b,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matLegs = new THREE.MeshStandardMaterial({
    name: 'Yak_Legs',
    color: 0x8b3f07,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const matHooves = new THREE.MeshStandardMaterial({
    name: 'Yak_Hooves',
    color: 0x361902,
    roughness: 0.6,
    metalness: 0.1,
    flatShading: true,
    side: THREE.DoubleSide
  });

  // Helper to build symmetric indexed geometry
  function createSymmetricGeometry(halfFaces, halfVertices, centerVertices = []) {
    const positions = [];
    const indices = [];
    const vertexMap = new Map();

    function getIndex(tag, isMirror = false) {
      const key = (isMirror && !tag.startsWith('c')) ? tag + '_m' : tag;
      if (vertexMap.has(key)) return vertexMap.get(key);

      const idx = positions.length / 3;
      let pos;
      if (tag.startsWith('c')) {
        const cIdx = parseInt(tag.slice(1));
        const [y, z] = centerVertices[cIdx];
        pos = [0, y, z];
      } else if (tag.startsWith('r')) {
        const rIdx = parseInt(tag.slice(1));
        const [x, y, z] = halfVertices[rIdx];
        pos = [isMirror ? -x : x, y, z];
      }
      positions.push(pos[0], pos[1], pos[2]);
      vertexMap.set(key, idx);
      return idx;
    }

    for (const [v0, v1, v2] of halfFaces) {
      // Normal side (+X)
      indices.push(getIndex(v0, false), getIndex(v1, false), getIndex(v2, false));
      // Mirrored side (-X), reversed winding
      indices.push(getIndex(v0, true), getIndex(v2, true), getIndex(v1, true));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // ==========================================
  // 1. BODY & HUMP & SERRATED FUR SKIRT (躯干与背峰与锯齿垂毛)
  // ==========================================
  // Center spine points along (x=0, y, z):
  const bodyCenter = [
    [2.10, 1.10],  // c0: Neck top extending forward into head
    [2.60, 0.28],  // c1: Peak of shoulder hump
    [2.40, -0.40], // c2: Mid-back crest
    [2.35, -1.15], // c3: Rump top
    [1.95, -1.65], // c4: Tail root / rear drop
    [1.35, -1.70], // c5: Rear buttock
    [0.92, -1.55], // c6: Rear under-tail
    [0.85, 0.70],  // c7: Chest bottom / base of neck
    [1.35, 1.05]   // c8: Mid chest front / neck bottom forward
  ];

  // Right half vertices [x, y, z]:
  const bodyHalf = [
    // Upper shoulder & flanks (r0 - r4)
    [0.52, 2.05, 1.00],  // r0: Upper neck extending forward
    [0.86, 2.32, 0.22],  // r1: Shoulder hump side
    [0.84, 2.18, -0.42], // r2: Mid-flank high
    [0.76, 2.12, -1.15], // r3: Rump side high
    [0.54, 1.75, -1.58], // r4: Rear flank

    // Mid belly & flank bulge (r5 - r9)
    [0.60, 1.50, 1.00],  // r5: Front neck/shoulder connection
    [0.92, 1.62, 0.18],  // r6: Main shoulder bulge
    [0.90, 1.52, -0.48], // r7: Mid rib cage bulge
    [0.82, 1.56, -1.20], // r8: Hip bulge
    [0.60, 1.35, -1.55], // r9: Rear hip lower

    // Fur skirt upper base line (r10 - r16)
    [0.52, 1.05, 0.90],  // r10: Front chest side
    [0.72, 1.12, 0.50],  // r11: Skirt top 1
    [0.82, 1.12, 0.10],  // r12: Skirt top 2
    [0.80, 1.10, -0.30], // r13: Skirt top 3
    [0.78, 1.10, -0.70], // r14: Skirt top 4
    [0.74, 1.12, -1.10], // r15: Skirt top 5
    [0.52, 1.02, -1.45], // r16: Rear skirt top

    // Fur skirt hanging triangular teeth tips (r17 - r22)
    // Continuous serrated sawtooth fringe along flank
    [0.68, 0.72, 0.40],  // r17: Tooth 1 (behind front leg)
    [0.82, 0.68, 0.00],  // r18: Tooth 2
    [0.80, 0.65, -0.35], // r19: Tooth 3 (lowest mid-belly tooth)
    [0.78, 0.67, -0.70], // r20: Tooth 4
    [0.72, 0.70, -1.05], // r21: Tooth 5
    [0.60, 0.74, -1.35], // r22: Tooth 6 (in front of rear leg)

    // Inner belly floor (r23 - r26)
    [0.32, 0.92, 0.25],  // r23: Inner belly front
    [0.32, 0.92, -0.40], // r24: Inner belly mid
    [0.30, 0.92, -1.00], // r25: Inner belly rear
    [0.28, 0.95, 0.75]   // r26: Inner chest base
  ];

  const bodyFaces = [
    // Top ridge quads
    ['c0', 'r0', 'r1'], ['c0', 'r1', 'c1'],
    ['c1', 'r1', 'r2'], ['c1', 'r2', 'c2'],
    ['c2', 'r2', 'r3'], ['c2', 'r3', 'c3'],
    ['c3', 'r3', 'r4'], ['c3', 'r4', 'c4'],

    // Rear buttock & under-tail
    ['c4', 'r4', 'c5'],
    ['c5', 'r4', 'r9'], ['c5', 'r9', 'c6'],
    ['c6', 'r9', 'r16'],

    // Front chest & neck
    ['c8', 'r0', 'c0'],
    ['c8', 'r5', 'r0'],
    ['c7', 'r10', 'c8'], ['c8', 'r10', 'r5'],

    // Upper to mid flank quads
    ['r0', 'r6', 'r1'], ['r0', 'r5', 'r6'],
    ['r1', 'r7', 'r2'], ['r1', 'r6', 'r7'],
    ['r2', 'r8', 'r3'], ['r2', 'r7', 'r8'],
    ['r3', 'r9', 'r4'], ['r3', 'r8', 'r9'],

    // Mid flank to skirt top
    ['r5', 'r11', 'r6'], ['r5', 'r10', 'r11'],
    ['r6', 'r12', 'r11'],
    ['r6', 'r13', 'r7'], ['r6', 'r12', 'r13'],
    ['r7', 'r14', 'r8'], ['r7', 'r13', 'r14'],
    ['r8', 'r15', 'r14'],
    ['r8', 'r16', 'r9'], ['r8', 'r15', 'r16'],

    // Continuous serrated sawtooth teeth along the bottom skirt:
    ['r10', 'r17', 'r11'],
    ['r11', 'r17', 'r12'],
    ['r12', 'r18', 'r11'], // notch between teeth
    ['r12', 'r18', 'r13'],
    ['r13', 'r19', 'r12'],
    ['r13', 'r19', 'r14'],
    ['r14', 'r20', 'r13'],
    ['r14', 'r20', 'r15'],
    ['r15', 'r21', 'r14'],
    ['r15', 'r21', 'r16'],
    ['r16', 'r22', 'r15'],

    // Underbelly floor to close the mesh
    ['c7', 'r26', 'r10'],
    ['r10', 'r23', 'r17'], ['r10', 'r26', 'r23'],
    ['r17', 'r23', 'r18'],
    ['r18', 'r24', 'r19'], ['r18', 'r23', 'r24'],
    ['r19', 'r24', 'r20'],
    ['r20', 'r25', 'r21'], ['r20', 'r24', 'r25'],
    ['r21', 'r25', 'r22'],
    ['r22', 'r25', 'r16'],
    ['r16', 'r25', 'c6']
  ];

  const bodyGeo = createSymmetricGeometry(bodyFaces, bodyHalf, bodyCenter);
  const bodyMesh = new THREE.Mesh(bodyGeo, matBody);
  root.add(bodyMesh);

  // Chest fur tufts (front view V-shaped hanging fur between front legs)
  const chestTuftGeo = new THREE.BufferGeometry();
  const chestTuftPos = [
    // Center tooth
    0.0, 0.62, 0.88,
    0.18, 1.15, 0.84,
    -0.18, 1.15, 0.84,
    // Left tooth
    0.28, 0.70, 0.84,
    0.38, 1.18, 0.82,
    0.14, 1.18, 0.82,
    // Right tooth
    -0.28, 0.70, 0.84,
    -0.14, 1.18, 0.82,
    -0.38, 1.18, 0.82
  ];
  chestTuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(chestTuftPos, 3));
  chestTuftGeo.computeVertexNormals();
  const chestTuftMesh = new THREE.Mesh(chestTuftGeo, matBodyDark);
  root.add(chestTuftMesh);

  // ==========================================
  // 2. HEAD & SNOUT & MOUTH (头部与鼻吻)
  // ==========================================
  const headGroup = new THREE.Group();
  headGroup.name = 'HeadGroup';

  // Head center spine points [y, z]:
  const headCenter = [
    [2.04, 0.94], // c0: Forehead top under horn boss
    [1.82, 1.25], // c1: Forehead / brow bridge
    [1.52, 1.50], // c2: Snout bridge upper
    [1.32, 1.68], // c3: Snout bridge lower
    [1.18, 1.76], // c4: Snout tip / top of nostrils
    [1.08, 1.72], // c5: Mouth line center
    [0.96, 1.56], // c6: Lower jaw / chin
    [1.10, 1.15], // c7: Throat
    [1.30, 0.85]  // c8: Neck connection base
  ];

  // Head right half points [x, y, z]:
  const headHalf = [
    [0.34, 1.96, 0.96], // r0: Brow outer top under horn
    [0.40, 1.74, 1.18], // r1: Upper cheek / outer eye corner
    [0.32, 1.50, 1.38], // r2: Mid cheek / below eye
    [0.22, 1.26, 1.58], // r3: Snout side upper
    [0.18, 1.12, 1.68], // r4: Snout side / nostril corner
    [0.15, 1.02, 1.54], // r5: Mouth corner
    [0.22, 1.08, 1.25], // r6: Lower jaw side
    [0.34, 1.35, 0.92], // r7: Rear jaw / neck socket
    [0.15, 1.65, 1.30]  // r8: Brow inner / eye socket
  ];

  const headFaces = [
    // Forehead / brow
    ['c0', 'r8', 'c1'], ['c0', 'r0', 'r8'],
    ['c1', 'r8', 'r1'], ['r0', 'r1', 'r8'],
    // Brow to cheek
    ['c1', 'r8', 'c2'],
    ['c2', 'r8', 'r2'], ['r8', 'r1', 'r2'],
    // Snout bridge
    ['c2', 'r3', 'c3'], ['c2', 'r2', 'r3'],
    ['c3', 'r4', 'c4'], ['c3', 'r3', 'r4'],
    // Snout front & mouth
    ['c4', 'r4', 'c5'],
    ['c5', 'r4', 'r5'],
    ['c5', 'r5', 'c6'],
    // Jaw & cheeks
    ['c6', 'r5', 'r6'],
    ['r3', 'r5', 'r4'], ['r3', 'r6', 'r5'],
    ['r2', 'r6', 'r3'],
    ['r1', 'r7', 'r2'], ['r2', 'r7', 'r6'],
    // Throat & neck
    ['c6', 'r6', 'c7'],
    ['c7', 'r6', 'r7'],
    ['c7', 'r7', 'c8'],
    ['c8', 'r0', 'c0'], ['c8', 'r7', 'r0']
  ];

  const headGeo = createSymmetricGeometry(headFaces, headHalf, headCenter);
  const headMesh = new THREE.Mesh(headGeo, matHead);
  headGroup.add(headMesh);

  // Distinct Terracotta Snout Plate (橙色鼻吻面片)
  const snoutGeo = new THREE.BufferGeometry();
  const snoutPos = [
    // Front hexagonal plate
    0.0, 1.18, 1.765,   -0.18, 1.12, 1.685,  -0.15, 1.02, 1.545,
    0.0, 1.18, 1.765,   -0.15, 1.02, 1.545,   0.0, 1.00, 1.625,

    0.0, 1.18, 1.765,    0.0, 1.00, 1.625,    0.15, 1.02, 1.545,
    0.0, 1.18, 1.765,    0.15, 1.02, 1.545,   0.18, 1.12, 1.685,

    // Top bevel slope
    0.0, 1.30, 1.695,   -0.18, 1.12, 1.685,  -0.20, 1.25, 1.595,
    0.0, 1.30, 1.695,    0.0, 1.18, 1.765,   -0.18, 1.12, 1.685,

    0.0, 1.30, 1.695,    0.18, 1.12, 1.685,   0.0, 1.18, 1.765,
    0.0, 1.30, 1.695,    0.20, 1.25, 1.595,   0.18, 1.12, 1.685
  ];
  snoutGeo.setAttribute('position', new THREE.Float32BufferAttribute(snoutPos, 3));
  snoutGeo.computeVertexNormals();
  const snoutMesh = new THREE.Mesh(snoutGeo, matSnout);
  headGroup.add(snoutMesh);

  // Nostril facets (深色鼻孔)
  const nostrilGeo = new THREE.BufferGeometry();
  const nostrilPos = [
    // Left nostril triangle
    0.02, 1.13, 1.77,  0.10, 1.11, 1.72,  0.02, 1.06, 1.75,
    // Right nostril triangle
    -0.02, 1.13, 1.77, -0.02, 1.06, 1.75, -0.10, 1.11, 1.72
  ];
  nostrilGeo.setAttribute('position', new THREE.Float32BufferAttribute(nostrilPos, 3));
  nostrilGeo.computeVertexNormals();
  const nostrilMesh = new THREE.Mesh(nostrilGeo, matNostrils);
  headGroup.add(nostrilMesh);

  // Eyes (Slanted dark polygons on sides of brow)
  const eyesGeo = new THREE.BufferGeometry();
  const eyesPos = [
    // Left eye (x > 0)
    0.29, 1.66, 1.29,  0.35, 1.70, 1.21,  0.32, 1.61, 1.23,
    // Right eye (x < 0)
    -0.29, 1.66, 1.29, -0.32, 1.61, 1.23, -0.35, 1.70, 1.21
  ];
  eyesGeo.setAttribute('position', new THREE.Float32BufferAttribute(eyesPos, 3));
  eyesGeo.computeVertexNormals();
  const eyesMesh = new THREE.Mesh(eyesGeo, matEyes);
  headGroup.add(eyesMesh);

  // Ears (Small triangular fins protruding behind horn curve)
  const earGeo = new THREE.BufferGeometry();
  const earPos = [
    // Left ear
    0.38, 1.66, 0.98,  0.64, 1.62, 0.85,  0.40, 1.50, 0.94,
    // Right ear
    -0.38, 1.66, 0.98, -0.40, 1.50, 0.94, -0.64, 1.62, 0.85
  ];
  earGeo.setAttribute('position', new THREE.Float32BufferAttribute(earPos, 3));
  earGeo.computeVertexNormals();
  const earMesh = new THREE.Mesh(earGeo, matHead);
  headGroup.add(earMesh);

  // ==========================================
  // 3. BEARD (胡须 - 悬垂锯齿三角形胡须)
  // ==========================================
  const beardGeo = new THREE.BufferGeometry();
  const beardPos = [
    // Main central hanging beard lock (front facing)
    0.0, 0.40, 1.48,     -0.12, 0.78, 1.54,   0.12, 0.78, 1.54,
    -0.12, 0.78, 1.54,   -0.18, 0.58, 1.52,   -0.24, 0.90, 1.56,
    0.12, 0.78, 1.54,     0.24, 0.90, 1.56,    0.18, 0.58, 1.52,

    // Upper base quads connecting to chin
    -0.12, 0.78, 1.54,   0.12, 0.78, 1.54,    0.0, 1.02, 1.60,
    -0.24, 0.90, 1.56,  -0.12, 0.78, 1.54,   -0.16, 1.04, 1.58,
    -0.16, 1.04, 1.58,  -0.12, 0.78, 1.54,    0.0, 1.02, 1.60,

    0.12, 0.78, 1.54,    0.16, 1.04, 1.58,    0.0, 1.02, 1.60,
    0.12, 0.78, 1.54,    0.24, 0.90, 1.56,    0.16, 1.04, 1.58,

    // Outermost side teeth
    -0.24, 0.90, 1.56,  -0.22, 1.08, 1.52,   -0.28, 0.70, 1.50,
    0.24, 0.90, 1.56,    0.28, 0.70, 1.50,    0.22, 1.08, 1.52
  ];
  beardGeo.setAttribute('position', new THREE.Float32BufferAttribute(beardPos, 3));
  beardGeo.computeVertexNormals();
  const beardMesh = new THREE.Mesh(beardGeo, matBeard);
  headGroup.add(beardMesh);

  root.add(headGroup);

  // ==========================================
  // 4. HORNS (牛角 - 标志性巨型弯角)
  // ==========================================
  // Horn Boss (额冠骨质基底)
  const bossGeo = new THREE.BufferGeometry();
  const bossPos = [
    // Center forehead plate
    0.0, 2.18, 1.04,   -0.22, 2.14, 1.08,  -0.20, 1.96, 1.22,
    0.0, 2.18, 1.04,   -0.20, 1.96, 1.22,   0.0, 2.00, 1.24,
    0.0, 2.18, 1.04,    0.0, 2.00, 1.24,    0.20, 1.96, 1.22,
    0.0, 2.18, 1.04,    0.20, 1.96, 1.22,   0.22, 2.14, 1.08,

    // Lateral wings
    -0.22, 2.14, 1.08,  -0.42, 2.06, 1.00,  -0.36, 1.88, 1.14,
    -0.22, 2.14, 1.08,  -0.36, 1.88, 1.14,  -0.20, 1.96, 1.22,

    0.22, 2.14, 1.08,    0.20, 1.96, 1.22,   0.36, 1.88, 1.14,
    0.22, 2.14, 1.08,    0.36, 1.88, 1.14,   0.42, 2.06, 1.00,

    // Top slope connecting boss back to top of head
    0.0, 2.18, 1.04,    0.0, 2.22, 0.88,   -0.25, 2.18, 0.90,
    0.0, 2.18, 1.04,    0.25, 2.18, 0.90,   0.0, 2.22, 0.88,

    -0.22, 2.14, 1.08, -0.25, 2.18, 0.90,  -0.45, 2.08, 0.88,
    0.22, 2.14, 1.08,   0.45, 2.08, 0.88,   0.25, 2.18, 0.90
  ];
  bossGeo.setAttribute('position', new THREE.Float32BufferAttribute(bossPos, 3));
  bossGeo.computeVertexNormals();
  const bossMesh = new THREE.Mesh(bossGeo, matHornBoss);
  root.add(bossMesh);

  // Procedural Swept Horns with Parallel Transport Frame
  // Exactly matching front, side, and top views:
  // Starts at boss, sweeps back-out, drops down cheek, then curves forward-out-up into sharp hooked tips!
  function createHornHalf(isLeft) {
    const sign = isLeft ? 1 : -1;
    const spine = [
      { p: new THREE.Vector3(sign * 0.38, 2.06, 1.04), rx: 0.16, ry: 0.18 },
      { p: new THREE.Vector3(sign * 0.58, 1.96, 0.98), rx: 0.15, ry: 0.16 }, // sweeps back slightly
      { p: new THREE.Vector3(sign * 0.72, 1.66, 1.02), rx: 0.13, ry: 0.14 }, // drops down cheek
      { p: new THREE.Vector3(sign * 0.80, 1.34, 1.14), rx: 0.11, ry: 0.12 }, // lowest dip
      { p: new THREE.Vector3(sign * 0.90, 1.48, 1.28), rx: 0.09, ry: 0.10 }, // curving forward & up
      { p: new THREE.Vector3(sign * 0.98, 1.70, 1.38), rx: 0.06, ry: 0.07 }, // flaring outward & forward-up
      { p: new THREE.Vector3(sign * 1.04, 1.84, 1.42), rx: 0.005, ry: 0.005 } // sharp hooked tip!
    ];

    const ringCount = spine.length;
    const segments = 6;
    const vertices = [];
    const indices = [];

    const tangent0 = new THREE.Vector3().subVectors(spine[1].p, spine[0].p).normalize();
    let initialUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(tangent0.dot(initialUp)) > 0.9) initialUp = new THREE.Vector3(0, 0, 1);
    let normal = new THREE.Vector3().crossVectors(tangent0, initialUp).normalize();
    let binormal = new THREE.Vector3().crossVectors(normal, tangent0).normalize();

    let prevTangent = tangent0;

    for (let i = 0; i < ringCount; i++) {
      const s = spine[i];
      let tangent;
      if (i === 0) {
        tangent = tangent0;
      } else if (i === ringCount - 1) {
        tangent = new THREE.Vector3().subVectors(spine[i].p, spine[i - 1].p).normalize();
      } else {
        tangent = new THREE.Vector3().subVectors(spine[i + 1].p, spine[i - 1].p).normalize();
      }

      const axis = new THREE.Vector3().crossVectors(prevTangent, tangent);
      const angle = Math.asin(Math.min(1, Math.max(-1, axis.length())));
      if (axis.lengthSq() > 1e-6) {
        axis.normalize();
        normal.applyAxisAngle(axis, angle);
        binormal.applyAxisAngle(axis, angle);
      }
      prevTangent = tangent;

      for (let j = 0; j < segments; j++) {
        const theta = (j / segments) * Math.PI * 2;
        const cos = Math.cos(theta) * s.rx;
        const sin = Math.sin(theta) * s.ry;
        const v = new THREE.Vector3().copy(s.p)
          .addScaledVector(normal, cos)
          .addScaledVector(binormal, sin);
        vertices.push(v.x, v.y, v.z);
      }
    }

    for (let i = 0; i < ringCount - 1; i++) {
      for (let j = 0; j < segments; j++) {
        const nextJ = (j + 1) % segments;
        const v0 = i * segments + j;
        const v1 = i * segments + nextJ;
        const v2 = (i + 1) * segments + nextJ;
        const v3 = (i + 1) * segments + j;

        if (isLeft) {
          indices.push(v0, v1, v2);
          indices.push(v0, v2, v3);
        } else {
          indices.push(v0, v2, v1);
          indices.push(v0, v3, v2);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  const leftHornMesh = new THREE.Mesh(createHornHalf(true), matHorn);
  const rightHornMesh = new THREE.Mesh(createHornHalf(false), matHorn);
  root.add(leftHornMesh);
  root.add(rightHornMesh);

  // ==========================================
  // 5. LEGS & HOOVES (四肢与蹄子)
  // ==========================================
  function createLeg(posX, posZ, isFront) {
    const legGroup = new THREE.Group();
    legGroup.name = (isFront ? 'Front' : 'Rear') + (posX > 0 ? 'Left' : 'Right') + 'Leg';

    const legTopW = isFront ? 0.18 : 0.20;
    const legTopD = isFront ? 0.22 : 0.24;
    const legBotW = 0.14;
    const legBotD = 0.16;

    const yTop = 0.95;
    const yBot = 0.18;

    // Rear leg hock shift
    const hockShift = isFront ? 0.0 : -0.06;

    const legVerts = [
      posX - legTopW, yTop, posZ - legTopD, // 0: back-right
      posX + legTopW, yTop, posZ - legTopD, // 1: back-left
      posX + legTopW, yTop, posZ + legTopD, // 2: front-left
      posX - legTopW, yTop, posZ + legTopD, // 3: front-right

      posX - legBotW, yBot, posZ - legBotD + hockShift, // 4
      posX + legBotW, yBot, posZ - legBotD + hockShift, // 5
      posX + legBotW, yBot, posZ + legBotD + hockShift, // 6
      posX - legBotW, yBot, posZ + legBotD + hockShift  // 7
    ];

    const legIndices = [
      3, 2, 6, 3, 6, 7, // Front
      1, 0, 4, 1, 4, 5, // Back
      2, 1, 5, 2, 5, 6, // Left
      0, 3, 7, 0, 7, 4  // Right
    ];

    const legGeo = new THREE.BufferGeometry();
    legGeo.setAttribute('position', new THREE.Float32BufferAttribute(legVerts, 3));
    legGeo.setIndex(legIndices);
    legGeo.computeVertexNormals();
    const legMesh = new THREE.Mesh(legGeo, matLegs);
    legGroup.add(legMesh);

    // Hoof
    const hoofTopW = legBotW;
    const hoofTopD = legBotD;
    const hoofBotW = legBotW * 1.15;
    const hoofBotD = legBotD * 1.35;
    const forwardSlant = isFront ? 0.04 : -0.02;

    const hoofVerts = [
      posX - hoofTopW, yBot, posZ - hoofTopD + hockShift,
      posX + hoofTopW, yBot, posZ - hoofTopD + hockShift,
      posX + hoofTopW, yBot, posZ + hoofTopD + hockShift,
      posX - hoofTopW, yBot, posZ + hoofTopD + hockShift,

      posX - hoofBotW, 0.0, posZ - hoofBotD + hockShift + forwardSlant * 0.5,
      posX + hoofBotW, 0.0, posZ - hoofBotD + hockShift + forwardSlant * 0.5,
      posX + hoofBotW, 0.0, posZ + hoofBotD + hockShift + forwardSlant,
      posX - hoofBotW, 0.0, posZ + hoofBotD + hockShift + forwardSlant
    ];

    const hoofIndices = [
      3, 2, 6, 3, 6, 7,
      1, 0, 4, 1, 4, 5,
      2, 1, 5, 2, 5, 6,
      0, 3, 7, 0, 7, 4,
      4, 5, 6, 4, 6, 7
    ];

    const hoofGeo = new THREE.BufferGeometry();
    hoofGeo.setAttribute('position', new THREE.Float32BufferAttribute(hoofVerts, 3));
    hoofGeo.setIndex(hoofIndices);
    hoofGeo.computeVertexNormals();
    const hoofMesh = new THREE.Mesh(hoofGeo, matHooves);
    legGroup.add(hoofMesh);

    return legGroup;
  }

  // Add 4 legs standing on ground (y = 0):
  root.add(createLeg(0.38, 0.40, true));   // Front Left
  root.add(createLeg(-0.38, 0.40, true));  // Front Right
  root.add(createLeg(0.35, -1.05, false)); // Rear Left
  root.add(createLeg(-0.35, -1.05, false));// Rear Right

  // ==========================================
  // 6. TAIL (尾巴 - 后部下垂聚拢毛束)
  // ==========================================
  const tailGeo = new THREE.BufferGeometry();
  const tailPos = [
    0.0, 1.60, -1.62,   -0.12, 1.45, -1.58,   0.12, 1.45, -1.58,
    -0.12, 1.45, -1.58,  0.0, 0.88, -1.56,    0.12, 1.45, -1.58,
    0.0, 1.60, -1.62,    0.0, 0.88, -1.56,   -0.12, 1.45, -1.58,
    0.0, 1.60, -1.62,    0.12, 1.45, -1.58,   0.0, 0.88, -1.56
  ];
  tailGeo.setAttribute('position', new THREE.Float32BufferAttribute(tailPos, 3));
  tailGeo.computeVertexNormals();
  const tailMesh = new THREE.Mesh(tailGeo, matBodyDark);
  root.add(tailMesh);

  return root;
}

// Export to GLB when run directly
async function main() {
  const model = buildYakModel();

  const box = new THREE.Box3().setFromObject(model);
  console.log('Model Bounding Box:');
  console.log('  Min:', box.min);
  console.log('  Max:', box.max);
  console.log('  Size:', box.getSize(new THREE.Vector3()));
  console.log('  Center:', box.getCenter(new THREE.Vector3()));

  const exporter = new GLTFExporter();
  const glbBuffer = await new Promise((resolve, reject) => {
    exporter.parse(model, resolve, reject, { binary: true });
  });

  const outPath = process.argv[2] || '/Users/allure/.gemini/antigravity/brain/f235c3ab-7d1e-4165-b3e2-34305697abdc/scratch/new_yak.glb';
  fs.writeFileSync(outPath, Buffer.from(glbBuffer));
  console.log(`Exported new yak model to ${outPath} (${glbBuffer.byteLength} bytes)`);
}

if (process.argv[1]?.includes('generate_yak')) {
  main();
}
