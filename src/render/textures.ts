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
 * Hand-painted grass texture anchored to standard palette #2F5D50 (within <=10% RGB).
 */
export function createPainterlyGrassTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(101);

  ctx.fillStyle = '#2F5D50';
  ctx.fillRect(0, 0, size, size);

  const palette = ['#346658', '#2a5549', '#386c5c', '#2b584b'];
  for (let i = 0; i < 360; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 32;
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 700; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 6 + rand() * 12;
    const ang = -Math.PI / 2 + (rand() - 0.5) * 0.8;
    ctx.strokeStyle = rand() > 0.5 ? '#3d7463' : '#264d42';
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export function createBambooHatTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#C9B48A';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#9e875e';
  ctx.lineWidth = 2;
  for (let y = 8; y < size; y += 14) {
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createPaperLanternTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#FFB347');
  grad.addColorStop(0.5, '#FFE9B0');
  grad.addColorStop(1, '#FFB347');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#b8762c';
  ctx.lineWidth = 2;
  for (let y = 18; y < size; y += 22) {
    ctx.globalAlpha = 0.3;
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
 * Torn unlit paper lantern texture (distinguishable without color for colorblind accessibility).
 */
export function createTornLanternTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5B5F6E';
  ctx.fillRect(0, 0, size, size);

  // Horizontal pleats
  ctx.strokeStyle = '#3f4350';
  ctx.lineWidth = 2;
  for (let y = 18; y < size; y += 22) {
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Jagged tear marks on unlit paper
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#141722';
  ctx.lineWidth = 4;
  const tears: Array<Array<[number, number]>> = [
    [[48, 52], [62, 88], [50, 128], [72, 168]],
    [[145, 70], [165, 110], [150, 148], [176, 190]],
    [[208, 44], [198, 92], [216, 134]],
  ];
  for (const path of tears) {
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i][0], path[i][1]);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGlowSpriteTexture(
  innerColor = 'rgba(255, 246, 194, 1)',
  midColor = 'rgba(255, 229, 138, 0.55)',
  outerColor = 'rgba(255, 179, 71, 0)',
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.38, midColor);
  grad.addColorStop(1, outerColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Sky dome anchored to standard night sky #0E1430 and fog #1B2350.
 */
export function createSkyDome(): {
  mesh: THREE.Mesh;
  uniforms: {
    uTopColor: { value: THREE.Color };
    uBottomColor: { value: THREE.Color };
  };
} {
  const uniforms = {
    uTopColor: { value: new THREE.Color(0x0e1430) },
    uBottomColor: { value: new THREE.Color(0x1b2350) },
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
      uniform vec3 uBottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = mix(uBottomColor, uTopColor, smoothstep(-0.05, 0.65, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 20), mat);
  return { mesh, uniforms };
}
