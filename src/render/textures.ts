import * as THREE from 'three';

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hand-painted watercolor grass texture inspired by Hoa / Studio Ghibli palettes.
 */
export function createPainterlyGrassTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(101);

  // Soft jade-moss base
  const grad = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.55);
  grad.addColorStop(0, '#4f8c6e');
  grad.addColorStop(0.55, '#3b735c');
  grad.addColorStop(1, '#295449');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Watercolor blotches
  const palette = ['#5fa37c', '#457e63', '#6db386', '#326351', '#7ec292'];
  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 34;
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
    ctx.globalAlpha = 0.08 + rand() * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Painterly grass brush strokes
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 6 + rand() * 14;
    const ang = -Math.PI / 2 + (rand() - 0.5) * 0.9;
    ctx.strokeStyle = rand() > 0.45 ? '#86cfa0' : '#2a5646';
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 1.2 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Tiny meadow petals
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.fillStyle = rand() > 0.35 ? '#fff3c4' : '#ffd1dc';
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + rand() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/**
 * Woven bamboo texture for Mây's conical hat (nón lá).
 */
export function createBambooHatTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e7c986';
  ctx.fillRect(0, 0, size, size);

  // Concentric weave rings
  ctx.strokeStyle = '#c59d52';
  ctx.lineWidth = 2;
  for (let y = 8; y < size; y += 14) {
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Vertical bamboo ribs
  ctx.strokeStyle = '#b4873e';
  ctx.lineWidth = 1.5;
  for (let x = 0; x < size; x += 16) {
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Pleated warm paper lantern texture.
 */
export function createPaperLanternTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#ffae42');
  grad.addColorStop(0.5, '#fff0b8');
  grad.addColorStop(1, '#ff9830');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Horizontal paper pleats
  ctx.strokeStyle = '#c46a1c';
  ctx.lineWidth = 2;
  for (let y = 16; y < size; y += 22) {
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Soft radial glow sprite for fireflies, lantern halos, and moon.
 */
export function createGlowSpriteTexture(
  innerColor = 'rgba(255, 245, 200, 1)',
  midColor = 'rgba(255, 186, 82, 0.55)',
  outerColor = 'rgba(255, 140, 40, 0)',
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.35, midColor);
  grad.addColorStop(1, outerColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Gradient sky dome shader that transitions smoothly from misty indigo night to warm golden fairy-tale dusk.
 */
export function createSkyDome(): {
  mesh: THREE.Mesh;
  uniforms: {
    uTopColor: { value: THREE.Color };
    uMidColor: { value: THREE.Color };
    uBottomColor: { value: THREE.Color };
  };
} {
  const uniforms = {
    uTopColor: { value: new THREE.Color(0x0d1b38) },
    uMidColor: { value: new THREE.Color(0x213a5c) },
    uBottomColor: { value: new THREE.Color(0x3a5d73) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uBottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = mix(uBottomColor, uMidColor, smoothstep(-0.15, 0.28, h));
        col = mix(col, uTopColor, smoothstep(0.22, 0.82, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 20), mat);
  return { mesh, uniforms };
}
