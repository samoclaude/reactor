// Улица для меню и сценок: особняк за оградой, мокрый асфальт с отражениями, фонари со светом в дожде,
// деревья, небо с облаками и луной, дождь с брызгами, снег. Модели — street.glb (tools/models/street.py),
// текстуры — Poly Haven. Отражения в асфальте — второй кадр «из-под земли» в маленькую текстуру.
import * as THREE from "three";
import { glowSprite } from "./world.js";

export const GATE_Z = -7.4,
  HOUSE_Z = -24;
const TEX = "assets/textures/";
const NOREFLECT = 1; // слой: дождь, снег и брызги в лужах не отражаются

export async function loadStreet(gltfLoader) {
  const tl = new THREE.TextureLoader(),
    tex = {};
  const jobs = [];
  for (const n of [
    "asphalt",
    "paving",
    "gravel",
    "grass",
    "slate",
    "sandstone",
  ])
    for (const k of ["col", "nrm", "rgh"])
      jobs.push(
        tl.loadAsync(`${TEX}${n}_${k}.jpg`).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          if (k === "col") t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          tex[n + "_" + k] = t;
        }),
      );
  jobs.push(
    gltfLoader
      .loadAsync("assets/models/street.glb")
      .then((g) => (tex.glb = g.scene)),
  );
  // фасады новых зданий (музей, банк, офис, ювелирка); нет файла — на их месте будет особняк
  jobs.push(
    gltfLoader
      .loadAsync("assets/models/facades.glb")
      .then((g) => (tex.facades = g.scene))
      .catch((e) => console.warn("фасады не загрузились", e)),
  );
  await Promise.all(jobs);
  return tex;
}

// одна текстура с разным шагом на разных поверхностях: копия делит картинку
function rep(t, x, y) {
  const c = t.clone();
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}
function pbr(tex, name, rx, ry, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: rep(tex[name + "_col"], rx, ry),
    normalMap: rep(tex[name + "_nrm"], rx, ry),
    roughnessMap: rep(tex[name + "_rgh"], rx, ry),
    ...extra,
  });
}

/* ---------- окна: атлас из четырёх комнат (шторы, книги, жалюзи, люстра) ---------- */
function windowAtlas() {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext("2d");
  const room = (k, wall, glow) => {
    const x0 = k * 256;
    const gr = g.createRadialGradient(x0 + 128, 170, 10, x0 + 128, 250, 330);
    gr.addColorStop(0, glow);
    gr.addColorStop(1, wall);
    g.fillStyle = gr;
    g.fillRect(x0, 0, 256, 512);
    return x0;
  };
  const curtains = (x0, col, open) => {
    for (const side of [0, 1]) {
      const w = 128 - open;
      const cx = side ? x0 + 256 - w : x0;
      const gr = g.createLinearGradient(cx, 0, cx + w, 0);
      for (let i = 0; i <= 8; i++)
        gr.addColorStop(i / 8, i % 2 ? col : "rgba(0,0,0,0.85)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(cx, 0);
      g.lineTo(cx + w, 0);
      // подхват шторы: у края уже, к низу снова шире
      g.quadraticCurveTo(
        side ? cx + w * 0.55 : cx + w * 0.45,
        300,
        side ? cx : cx + w,
        512,
      );
      g.lineTo(side ? cx + w : cx, 512);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "rgba(40,20,8,0.9)";
    g.fillRect(x0, 0, 256, 26); // ламбрекен
  };
  // 0: тёплая гостиная, бордовые шторы, торшер
  let x = room(0, "#3a1d0c", "#ffcf8a");
  g.fillStyle = "rgba(20,10,4,0.7)";
  g.fillRect(x + 150, 330, 8, 182);
  g.fillStyle = "#fff0c0";
  g.beginPath();
  g.ellipse(x + 154, 320, 34, 20, 0, 0, Math.PI * 2);
  g.fill();
  curtains(x, "rgba(120,20,24,0.95)", 70);
  // 1: библиотека — полки с книгами
  x = room(1, "#2a1608", "#f7b96a");
  for (let r = 0; r < 6; r++)
    for (let b = 0; b < 26; b++) {
      const h = 50 + ((b * 37 + r * 11) % 22);
      g.fillStyle = `hsl(${(b * 47 + r * 90) % 360},35%,${12 + ((b * 13) % 14)}%)`;
      g.fillRect(x + 6 + b * 9.5, 80 + r * 72 + (70 - h), 8, h);
    }
  curtains(x, "rgba(90,60,20,0.9)", 100);
  // 2: жалюзи наполовину опущены
  x = room(2, "#331c0a", "#ffd9a0");
  g.fillStyle = "rgba(255,240,200,0.25)";
  g.beginPath();
  g.ellipse(x + 128, 60, 60, 14, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 26; i++) {
    g.fillStyle = i % 2 ? "rgba(60,35,15,0.95)" : "rgba(150,110,60,0.95)";
    g.fillRect(x, i * 11, 256, 9);
  }
  // 3: люстра, шторы открыты, картина
  x = room(3, "#2e1a0c", "#ffe2a8");
  g.fillStyle = "rgba(30,15,5,0.8)";
  g.fillRect(x + 70, 250, 116, 86);
  g.fillStyle = "rgba(200,150,70,0.6)";
  g.fillRect(x + 78, 258, 100, 70);
  const ch = g.createRadialGradient(x + 128, 90, 2, x + 128, 90, 70);
  ch.addColorStop(0, "rgba(255,255,230,1)");
  ch.addColorStop(1, "rgba(255,220,150,0)");
  g.fillStyle = ch;
  g.fillRect(x + 40, 20, 176, 150);
  curtains(x, "rgba(30,60,50,0.95)", 104);
  // переплёт рисует модель, здесь — лёгкий отблеск на стекле
  const sh = g.createLinearGradient(0, 0, 1024, 512);
  sh.addColorStop(0, "rgba(255,255,255,0.06)");
  sh.addColorStop(1, "rgba(0,0,0,0.1)");
  g.fillStyle = sh;
  g.fillRect(0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- лужи: мягкий шум, повторяется по улице ---------- */
function puddleTexture() {
  const N = 256,
    cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, N, N);
  let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.filter = "blur(10px)";
  for (let i = 0; i < 70; i++) {
    const x = rnd() * N,
      y = rnd() * N,
      r = 8 + rnd() * 34;
    g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.5})`;
    for (const dx of [-N, 0, N])
      for (const dy of [-N, 0, N]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, r * 1.6, r, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ---------- небо: облака, луна, звёзды в ясную ночь ---------- */
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uCloud: { value: 1 },
      uMoon: { value: new THREE.Vector3(-0.35, 0.42, -0.84).normalize() },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform float uTime, uFlash, uCloud; uniform vec3 uMoon;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n2(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 col = mix(vec3(0.03,0.034,0.048), vec3(0.004,0.006,0.012), pow(h, 0.45));
        col += vec3(0.045,0.032,0.02) * exp(-h*9.0);           // зарево города у горизонта
        vec2 uv = d.xz / (d.y + 0.12);
        float c = fbm(uv*0.9 + vec2(uTime*0.012, uTime*0.004));
        float cov = smoothstep(0.62 - 0.38*uCloud, 0.95 - 0.2*uCloud, c) * smoothstep(0.0, 0.12, d.y);
        float m = max(dot(d, uMoon), 0.0);
        vec3 cloud = vec3(0.028,0.031,0.042) + vec3(0.3,0.32,0.38)*pow(m, 10.0) + vec3(0.04,0.028,0.018)*exp(-h*5.0);
        // звёзды: только где нет облаков
        vec2 sp = d.xz/(d.y+0.3)*90.0; float st = step(0.997, h21(floor(sp))) * smoothstep(0.1,0.4,h);
        col += vec3(0.8,0.85,1.0) * st * (1.0 - cov) * (1.0 - uCloud);
        col += vec3(0.95,0.95,1.0) * smoothstep(0.99955, 0.9998, m) * (1.0 - cov*0.92);   // диск луны
        col += vec3(0.2,0.23,0.3) * pow(m, 90.0) + vec3(0.06,0.07,0.1) * pow(m, 8.0);      // ореол
        col = mix(col, cloud, cov);
        col *= 1.0 + uFlash * 7.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/* ---------- конус света от фонаря: виден в дожде и тумане ---------- */
function coneMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDensity: { value: 1 },
      uColor: { value: new THREE.Color(0xffc27a) },
    },
    vertexShader: `varying float vH; varying vec3 vN, vV;
      void main(){ vH = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vH; varying vec3 vN, vV; uniform float uDensity; uniform vec3 uColor;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.6);
        float a = edge * (0.25 + 0.75*pow(vH, 1.3)) * 0.16 * uDensity;
        gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

/* ---------- дождь и снег, подсвеченные фонарями ---------- */
const LAMPS_MAX = 8;
function litLinesMaterial(points) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLamps: {
        value: Array.from({ length: LAMPS_MAX }, () => new THREE.Vector4()),
      },
      uBase: { value: new THREE.Color(0x8fa4c4) },
      uOpacity: { value: 0.3 },
      uSize: { value: 0.07 },
      uFlash: { value: 0 },
    },
    vertexShader: `uniform vec4 uLamps[${LAMPS_MAX}]; uniform float uSize; varying float vLit;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); float l = 0.0;
        for(int i=0;i<${LAMPS_MAX};i++){ vec3 d = wp.xyz-uLamps[i].xyz; l += uLamps[i].w/(1.0+dot(d,d)*0.5); }
        vLit = l; vec4 mv = viewMatrix*wp; gl_Position = projectionMatrix*mv;
        ${points ? "gl_PointSize = uSize * 900.0 / -mv.z;" : ""} }`,
    fragmentShader: `uniform vec3 uBase; uniform float uOpacity, uFlash; varying float vLit;
      void main(){ ${points ? "vec2 p = gl_PointCoord-0.5; float r = dot(p,p); if (r > 0.25) discard; float soft = 1.0 - r*4.0;" : "float soft = 1.0;"}
        vec3 c = uBase*(0.35 + uFlash*3.0) + vec3(1.0,0.78,0.5)*vLit*1.6;
        gl_FragColor = vec4(c, uOpacity*soft*(0.55 + min(vLit,1.5))); }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
}

/* ---------- брызги: кольца на лужах, расходятся и гаснут ---------- */
function splashMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLamps: {
        value: Array.from({ length: LAMPS_MAX }, () => new THREE.Vector4()),
      },
      uRate: { value: 1 },
      uOn: { value: 1 },
    },
    vertexShader: `attribute float aPhase; uniform float uTime, uRate; uniform vec4 uLamps[${LAMPS_MAX}];
      varying float vF, vLit, vSq;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); float l = 0.0;
        for(int i=0;i<${LAMPS_MAX};i++){ vec3 d = wp.xyz-uLamps[i].xyz; l += uLamps[i].w/(1.0+dot(d,d)*0.35); }
        vLit = l; vF = fract(uTime*uRate*1.7 + aPhase);
        vec4 mv = viewMatrix*wp; vec3 vd = normalize(cameraPosition - wp.xyz);
        vSq = max(abs(vd.y), 0.15);
        gl_Position = projectionMatrix*mv; gl_PointSize = 0.22*900.0 / -mv.z; }`,
    fragmentShader: `varying float vF, vLit, vSq; uniform float uOn;
      void main(){ vec2 p = (gl_PointCoord-0.5)*2.0; p.y /= vSq; float r = length(p);
        float ring = smoothstep(0.12, 0.0, abs(r - vF)) * (1.0 - vF);
        float a = ring * uOn * (0.25 + vLit*1.3);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.75,0.82,0.95)*0.6 + vec3(1.0,0.8,0.55)*vLit, a*0.7); }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
}

/* ---------- мокрый асфальт: отражение, лужи, рябь от капель ---------- */
/* ---------- погода на всём: снег ложится на то, что смотрит вверх; в дождь камень темнеет и блестит ---------- */
const WX = { uSnow: { value: 0 }, uWetAll: { value: 0 } };
// road: на дороге слякоть с колеями, мокрый блеск у неё свой (wetRoad)
export function weatherize(mat, road = false) {
  if (!mat || !mat.isMeshStandardMaterial || mat.userData.wx) return;
  mat.userData.wx = true;
  const prev = mat.onBeforeCompile,
    prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, WX);
    if (road) sh.defines = Object.assign(sh.defines || {}, { WX_ROAD: 1 });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWxPos;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        { vec4 wxp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wxp = instanceMatrix * wxp;
          #endif
          vWxPos = (modelMatrix * wxp).xyz; }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uSnow, uWetAll; varying vec3 vWxPos;
        float wxH(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float wxN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(wxH(i), wxH(i+vec2(1,0)), f.x), mix(wxH(i+vec2(0,1)), wxH(i+vec2(1,1)), f.x), f.y); }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        { float up = inverseTransformDirection(normal, viewMatrix).y;
          float nz = wxN(vWxPos.xz * 1.7) * 0.6 + wxN(vWxPos.xz * 6.0) * 0.4;
          float cov = uSnow * smoothstep(0.3, 0.7, up + (nz - 0.5) * 0.5);
          #ifdef WX_ROAD
          // по дороге ездят: в колеях снег раскатан до мокрого асфальта
          float az = abs(vWxPos.z), tr = min(abs(az - 1.2), abs(az - 2.8));
          cov *= 0.8 * smoothstep(0.06, 0.3, tr + (nz - 0.5) * 0.22);
          #endif
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.71, 0.77), cov);
          roughnessFactor = mix(roughnessFactor, 0.9, cov);
          #ifndef WX_ROAD
          float wt = uWetAll * (1.0 - cov);
          diffuseColor.rgb *= 1.0 - 0.3 * wt;
          roughnessFactor *= 1.0 - 0.15 * wt - 0.4 * wt * smoothstep(0.2, 0.8, up);
          #endif
        }`,
      );
  };
  mat.customProgramCacheKey = () =>
    (prevKey ? prevKey.call(mat) : "") + (road ? "|wxr" : "|wx");
}

function wetRoad(mat, puddles) {
  const u = {
    tMirror: { value: null },
    uMirror: { value: new THREE.Matrix4() },
    uPuddle: { value: puddles },
    uWet: { value: 1 },
    uTime: { value: 0 },
    uRain: { value: 1 },
    uBlur: { value: 1.5 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform mat4 uMirror; varying vec4 vMirror; varying vec2 vW;",
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n{ vec4 wp = modelMatrix*vec4(transformed,1.0); vMirror = uMirror*wp; vW = wp.xz; }",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D tMirror, uPuddle; uniform float uWet, uTime, uRain, uBlur; varying vec4 vMirror; varying vec2 vW;
        float rh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        // рябь от капель: в каждой клетке своё кольцо со своим временем
        vec2 ripple(vec2 p){ vec2 acc = vec2(0.0);
          for (int k=0;k<2;k++){ vec2 q = p*(k==0?3.2:4.7) + float(k)*7.3; vec2 c = floor(q), f = fract(q)-0.5;
            float ph = fract(uTime*(0.9+0.4*rh(c)) + rh(c+3.1)); vec2 o = vec2(rh(c+1.7), rh(c+5.3))-0.5;
            vec2 d = f - o*0.5; float r = length(d); float w = sin((r - ph*0.5)*60.0) * smoothstep(0.08,0.0,abs(r-ph*0.5)) * (1.0-ph);
            acc += normalize(d+1e-4) * w; }
          return acc; }
        float puddleMask(){ return smoothstep(0.55, 0.72, texture2D(uPuddle, vW*0.05).r); }`,
      )
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\nfloat pud = puddleMask() * uWet; diffuseColor.rgb *= mix(1.0, 0.6, uWet) * (1.0 - 0.45*pud);",
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, roughnessFactor*0.5, uWet); roughnessFactor = mix(roughnessFactor, 0.04, pud);",
      )
      .replace(
        "#include <opaque_fragment>",
        `{ vec2 rp = ripple(vW) * uRain * (0.3 + pud);
          vec4 mc = vMirror; mc.xy += (rp*0.012 + (texture2D(normalMap, vNormalMapUv).xy*2.0-1.0)*0.012*(1.0-pud)) * mc.w;
          // размытие вдоль вертикали экрана: на мокром асфальте огни тянутся полосами
          vec2 su = mc.xy / mc.w; float br = uBlur * (1.0 - pud) * 0.006 + 0.0015;
          vec3 refl = texture2D(tMirror, su).rgb * 0.28
            + (texture2D(tMirror, su + vec2(br, 0.0)).rgb + texture2D(tMirror, su - vec2(br, 0.0)).rgb) * 0.14
            + (texture2D(tMirror, su + vec2(0.0, br*3.0)).rgb + texture2D(tMirror, su - vec2(0.0, br*3.0)).rgb) * 0.16
            + (texture2D(tMirror, su + vec2(0.0, br*6.0)).rgb + texture2D(tMirror, su - vec2(0.0, br*6.0)).rgb) * 0.06;
          vec3 vv = normalize(vViewPosition); float ndv = clamp(dot(normalize(vNormal), vv), 0.0, 1.0);
          float fres = 0.08 + 0.92*pow(1.0-ndv, 4.0);
          outgoingLight += refl * uWet * mix(0.1, 0.9, pud) * mix(0.5, 1.0, fres); }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => "wetroad";
  return u;
}

// отражение в плоскости y = 0: камера «под землёй» смотрит вверх, кадр — в маленькую текстуру
class Mirror {
  constructor() {
    this.rt = new THREE.WebGLRenderTarget(256, 128, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(0);
    this.mat = new THREE.Matrix4();
    this.scale = 0.33;
  }
  render(renderer, scene, cam, hide) {
    const w = Math.max(64, Math.round(renderer.domElement.width * this.scale)),
      h = Math.max(32, Math.round(renderer.domElement.height * this.scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const c = this.cam,
      p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld),
      rot = new THREE.Matrix4().extractRotation(cam.matrixWorld),
      look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(p),
      up = new THREE.Vector3(0, 1, 0).applyMatrix4(rot);
    c.position.set(p.x, -p.y, p.z);
    c.up.set(up.x, -up.y, up.z);
    c.lookAt(look.x, -look.y, look.z);
    c.far = cam.far;
    c.updateMatrixWorld();
    c.projectionMatrix.copy(cam.projectionMatrix);
    this.mat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.mat.multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    // косой срез ближней плоскости: всё, что ниже асфальта, не попадает в отражение
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(
        c.matrixWorldInverse,
      ),
      cp = new THREE.Vector4(
        plane.normal.x,
        plane.normal.y,
        plane.normal.z,
        plane.constant,
      ),
      pm = c.projectionMatrix.elements,
      q = new THREE.Vector4(
        (Math.sign(cp.x) + pm[8]) / pm[0],
        (Math.sign(cp.y) + pm[9]) / pm[5],
        -1,
        (1 + pm[10]) / pm[14],
      );
    cp.multiplyScalar(2 / cp.dot(q));
    pm[2] = cp.x;
    pm[6] = cp.y;
    pm[10] = cp.z + 1 - 0.003;
    pm[14] = cp.w;
    for (const o of hide) o.visible = false;
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, c);
    renderer.setRenderTarget(was);
    for (const o of hide) o.visible = true;
  }
}

// копии узла street.glb: у каждой детали (материала) свой InstancedMesh
function instances(node, mats, list) {
  const out = [];
  node.updateMatrixWorld(true);
  node.traverse((ch) => {
    if (!ch.isMesh) return;
    const im = new THREE.InstancedMesh(
      ch.geometry,
      mats(ch.material),
      list.length,
    );
    const local = ch.matrixWorld.clone(),
      m = new THREE.Matrix4();
    list.forEach((M, i) => im.setMatrixAt(i, m.multiplyMatrices(M, local)));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    out.push(im);
  });
  return out;
}
const TRS = (x, y, z, ry = 0, s = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
    new THREE.Vector3(s, s, s),
  );

/* ---------- участки зданий: особняк (строится в buildStreet) и четыре фасада из facades.glb ---------- */
// вывеска: название здания золотыми буквами на тёмном (у банка, офиса, ювелирки), подсвечена
function signTexture(text, wide = 8) {
  const cv = document.createElement("canvas");
  cv.width = wide > 8 ? 2048 : 1024;
  cv.height = Math.max(64, Math.round(cv.width / wide));
  const g = cv.getContext("2d");
  g.fillStyle = "#0d0c0a";
  g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = "#8a6a32";
  g.lineWidth = 4;
  g.strokeRect(6, 6, cv.width - 12, cv.height - 12);
  let fs = cv.height * 0.62;
  g.font = `600 ${fs}px "PT Serif", Georgia, serif`;
  const w = g.measureText(text).width;
  if (w > cv.width * 0.88) {
    fs *= (cv.width * 0.88) / w;
    g.font = `600 ${fs}px "PT Serif", Georgia, serif`;
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  const gr = g.createLinearGradient(0, cv.height * 0.2, 0, cv.height * 0.8);
  gr.addColorStop(0, "#f6dc98");
  gr.addColorStop(0.5, "#c89a48");
  gr.addColorStop(1, "#8a6224");
  g.fillStyle = gr;
  g.fillText(text, cv.width / 2, cv.height / 2 + fs * 0.04);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // UV вывески в модели перевёрнута по вертикали — разворачиваем, иначе буквы вверх ногами
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.y = -1;
  return t;
}
// баннер выставки на фасаде музея: полотно 1,7 × 6,4 м (UV 0..1, низ — v = 0). Латунная эмблема-кольцо и полосы
// по краям — в самой модели (кольцо на высоте v ≈ 0,62), здесь только ткань и надпись под эмблемой
function bannerTexture(red) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 960;
  const g = cv.getContext("2d"),
    W = cv.width,
    H = cv.height;
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, red ? "#4a0c18" : "#101f44");
  bg.addColorStop(0.5, red ? "#661424" : "#1a2f60");
  bg.addColorStop(1, red ? "#4a0c18" : "#101f44");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const gold = (y0, y1) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, "#f2d38e");
    gr.addColorStop(1, "#b08438");
    return gr;
  };
  const line = (text, y, fs, weight = 600) => {
    g.font = `${weight} ${fs}px "PT Serif", Georgia, serif`;
    const w = g.measureText(text).width;
    if (w > W * 0.78) {
      fs *= (W * 0.78) / w;
      g.font = `${weight} ${fs}px "PT Serif", Georgia, serif`;
    }
    g.fillStyle = gold(y - fs / 2, y + fs / 2);
    g.fillText(text, W / 2, y);
  };
  // верх (v 0,93…0,7): «выставка», под ней — эмблема; ниже эмблемы — название и годы
  line("ВЫСТАВКА", H * 0.13, 30, 400);
  g.fillStyle = "#b08438";
  g.fillRect(W * 0.3, H * 0.17, W * 0.4, 2);
  const [a, b] = red ? ["ЗОЛОТО", "ВОСТОКА"] : ["ЭПОХА", "ПАРУСОВ"];
  line(a, H * 0.52, 46);
  line(b, H * 0.58, 46);
  g.fillRect(W * 0.3, H * 0.63, W * 0.4, 2);
  line(red ? "XII–XVIII вв." : "1500–1800", H * 0.67, 26, 400);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.flipY = false; // UV у моделей glTF идёт сверху вниз — без этого надпись вверх ногами
  return t;
}
// стеклянная стена небоскрёба: сетка импостов и окна этажей, часть горит (UV в метрах, текстура — 12 × 16 м)
function curtainMaterial(env) {
  const W = 512,
    H = 683,
    cw = W / 4, // стекло 3 м — как импосты в модели фасада
    fh = H / 4; // этаж 4 м
  const col = document.createElement("canvas"),
    lit = document.createElement("canvas");
  col.width = lit.width = W;
  col.height = lit.height = H;
  const g = col.getContext("2d"),
    e = lit.getContext("2d");
  let sd = 5;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "#3a4250";
  g.fillRect(0, 0, W, H);
  e.fillStyle = "#000";
  e.fillRect(0, 0, W, H);
  for (let f = 0; f < 4; f++) {
    let prev = false;
    for (let c = 0; c < 4; c++) {
      const x = c * cw,
        y = f * fh;
      // стекло чуть разного тона, перекрытие этажа — глухая полоса
      const t = 40 + ((rnd() * 18) | 0);
      g.fillStyle = `rgb(${t},${t + 8},${t + 18})`;
      g.fillRect(x + 2, y + 2, cw - 4, fh * 0.78);
      g.fillStyle = "#23272e";
      g.fillRect(x, y + fh * 0.8, cw, fh * 0.2);
      // горящие окна идут кусками (офис, где задержались), внутри — потолочные лампы полосами
      const on = rnd() < 0.22 || (prev && rnd() < 0.5);
      prev = on;
      if (on) {
        const warm = rnd() < 0.7;
        const gr = e.createLinearGradient(0, y, 0, y + fh * 0.78);
        gr.addColorStop(0, warm ? "#ffe2b0" : "#d8e6ff");
        gr.addColorStop(1, warm ? "#7a5a30" : "#506080");
        e.fillStyle = gr;
        e.fillRect(x + 3, y + 3, cw - 6, fh * 0.76);
        e.fillStyle = "rgba(255,255,255,.55)";
        e.fillRect(x + 3, y + 8, cw - 6, 3);
      }
    }
  }
  // импосты: светлые вертикали и горизонтали
  g.fillStyle = "#8a929c";
  for (let c = 0; c <= 4; c++) g.fillRect(c * cw - 1.5, 0, 3, H);
  for (let f = 0; f <= 4; f++) g.fillRect(0, f * fh - 1.5, W, 3);
  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 12, 1 / 16);
    t.offset.y = -9 / 16; // этажи модели начинаются с 9 м
    t.anisotropy = 4;
    return t;
  };
  return new THREE.MeshStandardMaterial({
    name: "curtain",
    map: mk(col, true),
    emissiveMap: mk(lit, true),
    emissive: 0xffffff,
    emissiveIntensity: 1.3,
    color: 0xffffff,
    metalness: 0.85,
    roughness: 0.12,
    envMap: env,
    envMapIntensity: 1.2,
  });
}
// свет участка: два общих источника (крыльцо и вход), у каждого здания стоят по-своему — иначе шейдеры пересобираются
const LOT_LIGHT = {
  mansion: [
    [0, 4.2, HOUSE_Z + 2.6, 0xffb868, 18, 9],
    [0, 3.6, GATE_Z + 0.7, 0xffc070, 14, 10],
  ],
  museum: [
    [0, 3.2, GATE_Z - 10, 0xffd2a0, 30, 16],
    [0, 3.4, GATE_Z + 0.7, 0xffc070, 12, 9],
  ],
  bank: [
    [0, 4.6, GATE_Z + 1.8, 0xffcf96, 22, 11],
    [0, 3.2, GATE_Z + 0.9, 0xffc070, 10, 8],
  ],
  office: [
    [0, 4.0, GATE_Z - 4, 0xfff0d8, 30, 16],
    [0, 3.2, GATE_Z + 0.9, 0xd8e4ff, 10, 8],
  ],
  jewelry: [
    [0, 2.4, GATE_Z + 1.6, 0xffd8a8, 18, 9],
    [0, 3.2, GATE_Z + 0.9, 0xffc070, 10, 8],
  ],
};
function buildLots(s, st, tex, pick, MAT) {
  const F = tex.facades;
  st.lots = {};
  st.bannerM = {}; // ткань баннеров музея (общая на все копии)
  // мощение вместо газона: у городских зданий за тротуаром камень
  const cityGround = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 44),
    pbr(tex, "paving", 70, 22, { color: 0x7a766f }),
  );
  cityGround.rotation.x = -Math.PI / 2;
  cityGround.position.set(0, 0.12, GATE_Z - 22.2); // ниже мощения фасадов: без мерцания
  s.add(cityGround);
  st.cityGround = cityGround;
  st.ground.push([cityGround.material, [0x7a766f, 1], [0x5c5954, 0.5], [0xdfe5ee, 1]]);
  st.curtain = curtainMaterial(st.env);
  for (const id of ["museum", "bank", "office", "jewelry"]) {
    const src = F && F.getObjectByName(id);
    const grp = new THREE.Group();
    grp.visible = false;
    s.add(grp);
    st.lotGroups[id] = grp;
    const L = (st.lots[id] = { id, group: grp, signs: [] });
    if (!src) continue;
    const o = src.clone(true);
    o.position.set(0, 0.15, GATE_Z);
    o.traverse((m) => {
      if (!m.isMesh) return;
      const n = m.material.name || "";
      if (n === "curtain") m.material = st.curtain;
      else if (n === "sign") {
        // пропорции таблички: у банка ~4,6:1, у бутика ~16,6:1 — надпись рисуется под них
        m.geometry.computeBoundingBox();
        const sz = m.geometry.boundingBox.getSize(new THREE.Vector3());
        m.userData.aspect = Math.max(sz.x, sz.z) / Math.max(0.01, sz.y);
        m.material = new THREE.MeshStandardMaterial({
          name: "sign",
          color: 0x222222,
          emissive: 0xffffff,
          emissiveIntensity: 0.9,
          roughness: 0.4,
        });
        L.signs.push(m);
      } else if (n === "glass_lobby") {
        // стекло вестибюля небоскрёба: прозрачное, с отражением неба — видно колонны, ресепшн и свет внутри
        m.material = new THREE.MeshStandardMaterial({
          name: "glass_lobby",
          color: 0x0c121a,
          metalness: 0.7,
          roughness: 0.06,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          envMap: st.env,
          envMapIntensity: 1.2,
        });
      } else if (n === "banner_red" || n === "banner_blue") {
        // баннеры выставки у музея: ткань с надписью (у красных и синих своя выставка)
        const red = n === "banner_red";
        m.material = st.bannerM[n] ||= new THREE.MeshStandardMaterial({
          name: n,
          map: bannerTexture(red),
          roughness: 0.92,
        });
      } else if (/^flag_/.test(n)) {
        // флаги у небоскрёба — корпоративные (тёмно-синий с золотом), а не похожие на флаги стран
        m.material = m.material.clone();
        m.material.color.set(n === "flag_white" ? 0xc8a24a : 0x1e2c4a);
      } else m.material = pick(m.material);
    });
    grp.add(o);
    grp.updateMatrixWorld(true);
    L.door = o.getObjectByName(id + "_door") || null;
    const en = o.getObjectByName(id + "_entry");
    if (en) L.entry = en.getWorldPosition(new THREE.Vector3());
    if (L.door) {
      // створка открывается внутрь участка: петля слева от входа — поворот против часовой, справа — по часовой
      L.door0 = L.door.rotation.y;
      const hx = L.door.getWorldPosition(new THREE.Vector3()).x;
      L.doorSign = L.entry && L.entry.x < hx ? -1 : 1;
    }
  }
  // name — название здания на вывеске (Банк, Ломбард, Бутик…)
  st.setLot = (id, name = "") => {
    if (!st.lotGroups[id] || (id !== "mansion" && !st.lots[id].group.children.length)) id = "mansion";
    for (const [k, g] of Object.entries(st.lotGroups)) g.visible = k === id;
    cityGround.visible = id !== "mansion";
    st.lot = st.lots[id] || null;
    st.lotId = id;
    const LL = LOT_LIGHT[id];
    [st.porch, st.gateL].forEach((l, i) => {
      if (!l) return;
      const [x, y, z, c, k, d] = LL[i];
      l.position.set(x, y, z);
      l.color.set(c);
      l.intensity = k;
      l.distance = d;
    });
    if (st.lot && name && st.lot.signName !== name) {
      st.lot.signName = name;
      for (const m of st.lot.signs) {
        if (m.material.emissiveMap) m.material.emissiveMap.dispose();
        m.material.emissiveMap = signTexture(name.toUpperCase(), m.userData.aspect || 8);
        m.material.map = m.material.emissiveMap;
        m.material.needsUpdate = true;
      }
    }
  };
  void MAT;
}

export function buildStreet(s, tex, renderer) {
  const std = (color, rough = 0.8, metal = 0) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
    });
  const st = { lamps: [], hide: [], cones: [] };
  // участок особняка: дом, ограда, ворота, газон, двор — прячется, когда дело в другом здании (st.setLot)
  const lotM = new THREE.Group();
  s.add(lotM);
  st.lotGroups = { mansion: lotM };
  // небо и свет
  st.sky = makeSky();
  s.add(st.sky);
  st.hemi = new THREE.HemisphereLight(0x4a5c80, 0x0e0c0a, 0.32);
  s.add(st.hemi);
  st.moon = new THREE.DirectionalLight(0x9fb4e0, 0.22);
  st.moon.position.set(-14, 18, -30);
  s.add(st.moon);
  // окружение для бликов на стёклах и мокром камне: небо, свёрнутое в кубическую карту
  {
    const es = new THREE.Scene(),
      sk = makeSky();
    sk.material.uniforms.uCloud.value = 0.8;
    es.add(sk);
    const pm = new THREE.PMREMGenerator(renderer);
    st.env = pm.fromScene(es, 0.02).texture;
    pm.dispose();
    s.environment = st.env;
    s.environmentIntensity = 0.22;
  }

  // ---- асфальт, бордюры, тротуары, газоны ----
  const puddles = puddleTexture();
  const roadMat = pbr(tex, "asphalt", 30, 2, { color: 0x9a9a9a });
  st.road = wetRoad(roadMat, puddles);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(140, 8), roadMat);
  road.rotation.x = -Math.PI / 2;
  s.add(road);
  st.hide.push(road);
  st.roadMat = roadMat;
  const curb = std(0x5d5c5a, 0.6);
  const walk = pbr(tex, "paving", 90, 2.2, { color: 0x8c8780 });
  const lawn = pbr(tex, "grass", 50, 14, { color: 0x4a5a40 });
  for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(140, 0.16, 0.28), curb);
    c.position.set(0, 0.08, sz * 4.0);
    s.add(c);
    const w = new THREE.Mesh(new THREE.BoxGeometry(140, 0.15, 3.3), walk);
    w.position.set(0, 0.075, sz * 5.79);
    s.add(w);
  }
  const lawnG = new THREE.Mesh(new THREE.PlaneGeometry(140, 44), lawn);
  lawnG.rotation.x = -Math.PI / 2;
  lawnG.position.set(0, 0.14, GATE_Z - 22.2);
  lotM.add(lawnG);
  const lawnN = new THREE.Mesh(new THREE.PlaneGeometry(140, 20), lawn);
  lawnN.rotation.x = -Math.PI / 2;
  lawnN.position.set(0, 0.14, 17.6);
  s.add(lawnN);
  // гравийная дорожка от ворот к крыльцу и площадка перед ним
  const grav = pbr(tex, "gravel", 1.4, 4.5, { color: 0x7d776c });
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 11.2), grav);
  drive.rotation.x = -Math.PI / 2;
  drive.position.set(0, 0.155, GATE_Z - 5.7);
  lotM.add(drive);
  const court = new THREE.Mesh(
    new THREE.CircleGeometry(7, 40),
    pbr(tex, "gravel", 4, 4, { color: 0x7d776c }),
  );
  court.rotation.x = -Math.PI / 2;
  court.position.set(0, 0.157, HOUSE_Z + 6.2);
  lotM.add(court);
  // земля по погоде: [материал, сухо, мокро, снег] — цвет, шероховатость
  st.ground = [
    [walk, [0x8c8780, 1], [0x6a6660, 0.45], [0xdfe5ee, 1]],
    [curb, [0x5d5c5a, 0.6], [0x4a4948, 0.25], [0xd0d6de, 0.9]],
    [lawn, [0x4a5a40, 1], [0x3a4a32, 0.8], [0xe2e8f0, 1]],
    [grav, [0x7d776c, 1], [0x5d584f, 0.6], [0xdde3ec, 1]],
    [court.material, [0x7d776c, 1], [0x5d584f, 0.6], [0xdde3ec, 1]],
  ];
  // разметка, люк, решётка ливнёвки
  const paint = std(0x9a978c, 0.5);
  const dash = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3, 0.006, 0.12),
    paint,
    24,
  );
  for (let i = 0; i < 24; i++) dash.setMatrixAt(i, TRS(-69 + i * 6, 0.003, 0));
  s.add(dash);
  const manhole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.01, 24),
    std(0x1a1a1c, 0.35, 0.8),
  );
  manhole.position.set(2.8, 0.005, 1.6);
  s.add(manhole);
  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.012, 0.36),
    std(0x101012, 0.4, 0.9),
  );
  grate.position.set(-6.2, 0.006, -3.7);
  s.add(grate);

  // ---- особняк ----
  const g = tex.glb;
  const stoneMat = pbr(tex, "sandstone", 0.5, 0.5, { color: 0x7c7b78 });
  const darkMat = pbr(tex, "sandstone", 0.5, 0.5, { color: 0x5e5c58 });
  const slateMat = pbr(tex, "slate", 0.45, 0.45, { color: 0x8a909a });
  const atlas = windowAtlas();
  const litMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: atlas,
    emissiveIntensity: 1.7,
    roughness: 0.2,
  });
  const darkGlass = new THREE.MeshStandardMaterial({
    color: 0x05070b,
    roughness: 0.06,
    metalness: 1,
    envMapIntensity: 0.9,
  });
  const lampGlass = new THREE.MeshBasicMaterial({ color: 0xffd7a0 });
  const MAT = {
    stone: stoneMat,
    darkstone: darkMat,
    slate: slateMat,
    trim: std(0xa8a49c, 0.75),
    iron: std(0x16181b, 0.45, 0.7),
    frame: std(0xd5cfc3, 0.5),
    wood: std(0x24160d, 0.55),
    win_lit: litMat,
    win_dark: darkGlass,
    lamp_glass: lampGlass,
    brass: std(0x9a7a3a, 0.3, 0.9),
    leaves: std(0x162214, 0.9),
    leaves2: std(0x1c2a17, 0.9),
    bark: std(0x2a221c, 0.95),
    brick: std(0x4a2a22, 0.9),
    hyd: std(0x6e1813, 0.45, 0.3),
  };
  st.mats = MAT;
  const pick = (m) => MAT[m.name] || m;
  const house = g.getObjectByName("mansion").clone(true);
  house.traverse((o) => {
    if (o.isMesh) o.material = pick(o.material);
  });
  house.position.set(0, 0.15, HOUSE_Z);
  lotM.add(house);
  // свет крыльца: бра у двери и фонарь под портиком
  for (const sx of [-1.75, 1.75]) {
    const gs = glowSprite(0xffc070, 1.1, 0.9);
    gs.position.set(sx, 0.15 + 1.2 + 2.47, HOUSE_Z + 1.25);
    lotM.add(gs);
  }
  const porch = new THREE.PointLight(0xffb868, 18, 9, 1.6);
  porch.position.set(0, 4.2, HOUSE_Z + 2.6);
  s.add(porch);
  st.porch = porch;
  // ---- ограда, столбы, ворота ----
  const bays = [],
    piers = [];
  for (const sx of [-1, 1]) {
    let x = 2.35;
    for (let k = 0; x < 62; k++) {
      bays.push(TRS(sx * (x + 1.5), 0.15, GATE_Z));
      x += 3;
      if (k % 2 === 1) {
        piers.push(TRS(sx * (x + 0.32), 0.15, GATE_Z));
        x += 0.64;
      }
    }
  }
  for (const im of instances(g.getObjectByName("fence_bay"), pick, bays))
    lotM.add(im);
  for (const im of instances(g.getObjectByName("pier"), pick, piers))
    lotM.add(im);
  for (const sx of [-1, 1]) {
    const gp = g.getObjectByName("gate_pier").clone(true);
    gp.traverse((o) => o.isMesh && (o.material = pick(o.material)));
    gp.position.set(sx * 1.95, 0.15, GATE_Z);
    lotM.add(gp);
    const gl = glowSprite(0xffc070, 1.4, 0.95);
    gl.position.set(sx * 1.95, 3.82, GATE_Z);
    lotM.add(gl);
    // створки закрыты; правую (калитку) вор распахивает внутрь в сценках — st.gateOpen
    const leaf = g.getObjectByName("gate_leaf").clone(true);
    leaf.traverse((o) => o.isMesh && (o.material = pick(o.material)));
    leaf.position.set(sx * 1.6, 0.15, GATE_Z);
    leaf.rotation.y = sx < 0 ? 0 : Math.PI;
    lotM.add(leaf);
    if (sx > 0) st.gateLeaf = leaf;
  }
  const gateL = new THREE.PointLight(0xffc070, 14, 10, 1.6);
  gateL.position.set(0, 3.6, GATE_Z + 0.7);
  s.add(gateL);
  st.gateL = gateL;
  st.lamps.push([new THREE.Vector3(-1.95, 3.7, GATE_Z), 0.5]);
  st.lamps.push([new THREE.Vector3(1.95, 3.7, GATE_Z), 0.5]);

  // ---- фонарные столбы: свет, ореол, конус в дожде ----
  const LP = [
    [-11, -4.55],
    [11, -4.55],
    [-4.4, 4.55],
    [40, 4.55], // не в кадре сценок у банка и офиса (камера там сдвигается до x ≈ 26)
    [-24, 4.55],
    [26, -4.55],
  ];
  for (const im of instances(
    g.getObjectByName("lamppost"),
    pick,
    LP.map(([x, z]) => TRS(x, 0.15, z)),
  ))
    s.add(im);
  const coneGeo = new THREE.CylinderGeometry(0.18, 2.6, 4.3, 24, 1, true);
  coneGeo.translate(0, -2.15, 0);
  const coneMat = coneMaterial();
  st.coneMat = coneMat;
  LP.forEach(([x, z], i) => {
    const y = 4.3;
    const gs = glowSprite(0xffc27a, 2.4, 0.9);
    gs.position.set(x, y, z);
    s.add(gs);
    const gs2 = glowSprite(0xfff0d0, 0.6, 1);
    gs2.position.set(x, y, z);
    s.add(gs2);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, y + 0.1, z);
    s.add(cone);
    st.lamps.push([new THREE.Vector3(x, y, z), 1]);
    // свет дают только три ближних к воротам фонаря: шейдер считает каждый источник
    if (i < 3) {
      const l = new THREE.PointLight(0xffc488, 60, 22, 1.5);
      l.position.set(x, y - 0.1, z);
      s.add(l);
    }
  });

  // ---- деревья, кусты, вазоны ----
  const trees = [],
    lotTrees = [],
    cyps = [];
  let sd = 9;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  // за оградой: у дома и вдоль участка; дальний лесок за домом
  for (const [x, z, sc] of [
    [-9, -12, 1.1],
    [9.5, -13, 1.2],
    [-20, -11, 1.3],
    [20, -12, 1.2],
    [-32, -10, 1.4],
    [33, -11, 1.3],
    [-46, -12, 1.5],
    [45, -13, 1.4],
    [-26, -30, 1.6],
    [26, -32, 1.7],
  ])
    lotTrees.push(TRS(x, 0.15, z, rnd() * 6, sc));
  for (let i = 0; i < 26; i++) {
    const x = -70 + i * 5.6 + rnd() * 3,
      z = -42 - rnd() * 12;
    trees.push(TRS(x, 0.15, z, rnd() * 6, 1.5 + rnd() * 0.8));
  }
  // на нашей стороне улицы, в лунках у тротуара — вне пути камеры сценок (у новых зданий она сдвигается до x ≈ 26)
  for (const x of [-16, 34, 47, -38])
    trees.push(TRS(x, 0.15, 6.2, rnd() * 6, 1.05));
  for (const [x, z] of [
    [-16.6, HOUSE_Z + 1.5],
    [16.6, HOUSE_Z + 1.5],
    [-7, -9.2],
    [7, -9.2],
  ])
    cyps.push(TRS(x, 0.15, z, rnd() * 6, 1.1));
  for (const im of instances(g.getObjectByName("tree"), pick, trees)) s.add(im);
  for (const im of instances(g.getObjectByName("tree"), pick, lotTrees))
    lotM.add(im);
  for (const im of instances(g.getObjectByName("cypress"), pick, cyps))
    lotM.add(im);
  // живая изгородь вдоль ограды изнутри (у ворот проход)
  const hedges = [];
  for (const sx of [-1, 1])
    for (let x = 3.2; x < 60; x += 3)
      hedges.push(TRS(sx * (x + 1.5), 0.15, GATE_Z - 0.9));
  for (const im of instances(g.getObjectByName("hedge"), pick, hedges))
    lotM.add(im);
  for (const im of instances(g.getObjectByName("topiary"), pick, [
    TRS(-5.6, 0.15, HOUSE_Z + 5.6),
    TRS(5.6, 0.15, HOUSE_Z + 5.6),
    TRS(-2.6, 0.15, GATE_Z - 1.4),
    TRS(2.6, 0.15, GATE_Z - 1.4),
  ]))
    lotM.add(im);
  // на нашей стороне — низкая каменная стенка и кусты за ней
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(140, 0.6, 0.4), stoneMat);
  wallN.position.set(0, 0.3, 7.65);
  s.add(wallN);
  const hedgesN = [];
  for (let x = -66; x < 66; x += 3) hedgesN.push(TRS(x, 0.15, 8.4));
  for (const im of instances(g.getObjectByName("hedge"), pick, hedgesN))
    s.add(im);
  // урна, скамейка, гидрант на тротуарах
  for (const [n, x, z, ry] of [
    ["bin", -8.6, -4.6, 0],
    ["bench", -14.5, -5.4, Math.PI],
    ["hydrant", 6.4, -4.7, 0.4],
    ["bin", 12.4, 4.7, 0],
    ["bench", 21, 5.6, 0],
  ]) {
    const o = g.getObjectByName(n).clone(true);
    o.traverse((c) => c.isMesh && (c.material = pick(c.material)));
    o.position.set(x, 0.15, z);
    o.rotation.y = ry;
    s.add(o);
  }

  // ---- новые здания: фасады из facades.glb на месте участка особняка ----
  buildLots(s, st, tex, pick, MAT);

  // ---- дождь, снег, брызги ----
  const N = 2600;
  st.seed = [];
  for (let i = 0; i < N; i++)
    st.seed.push([
      (Math.random() - 0.5) * 50,
      Math.random() * 14,
      -14 + Math.random() * 26,
    ]);
  st.rainGeo = new THREE.BufferGeometry();
  st.rainGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(N * 6), 3),
  );
  st.rainMat = litLinesMaterial(false);
  st.rain = new THREE.LineSegments(st.rainGeo, st.rainMat);
  st.rain.frustumCulled = false;
  s.add(st.rain);
  st.snowGeo = new THREE.BufferGeometry();
  st.snowGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(N * 3), 3),
  );
  st.snowMat = litLinesMaterial(true);
  st.snowMat.uniforms.uBase.value.set(0xdde6f4);
  st.snowMat.uniforms.uOpacity.value = 0.85;
  st.snow = new THREE.Points(st.snowGeo, st.snowMat);
  st.snow.frustumCulled = false;
  s.add(st.snow);
  const NS = 1400,
    sp = new Float32Array(NS * 3),
    ph = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    sp[i * 3] = (Math.random() - 0.5) * 44;
    const zone = Math.random();
    sp[i * 3 + 1] = zone < 0.7 ? 0.01 : 0.16;
    sp[i * 3 + 2] =
      zone < 0.7
        ? (Math.random() - 0.5) * 7.6
        : (Math.random() < 0.5 ? -1 : 1) * (4.2 + Math.random() * 3);
    ph[i] = Math.random();
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sg.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
  st.splashMat = splashMaterial();
  st.splash = new THREE.Points(sg, st.splashMat);
  st.splash.frustumCulled = false;
  s.add(st.splash);
  for (const o of [st.rain, st.snow, st.splash]) {
    o.layers.set(NOREFLECT);
    st.hide.push(o);
  }
  // фонари для подсветки дождя и брызг
  st.lampU = st.lamps
    .slice(0, LAMPS_MAX)
    .map(([p, w]) => new THREE.Vector4(p.x, p.y, p.z, w));
  while (st.lampU.length < LAMPS_MAX)
    st.lampU.push(new THREE.Vector4(0, -99, 0, 0));
  st.rainMat.uniforms.uLamps.value = st.lampU;
  st.snowMat.uniforms.uLamps.value = st.lampU;
  st.splashMat.uniforms.uLamps.value = st.lampU;

  // снег и мокрый камень — на всём, кроме окон и фонарей
  s.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const n = o.material.name || "";
    if (o.material === litMat || o.material === darkGlass) return;
    if (/lamp|glass|screen|led|curtain|sign|window|glow/.test(n)) return;
    weatherize(o.material, o.material === roadMat);
  });
  st.weatherize = weatherize;
  // калитка: 0 закрыта, 1 распахнута внутрь участка (у новых зданий — своя дверь или ворота)
  st.gateOpen = (k) => {
    const L = st.lot;
    if (L && L.door) L.door.rotation.y = L.door0 + L.doorSign * 1.45 * k;
    else if (st.gateLeaf) st.gateLeaf.rotation.y = Math.PI - 1.45 * k;
  };
  st.setLot("mansion");

  st.mirror = new Mirror();
  st.time = 0;
  st.groundFor = "";

  // погода: дождь сносит ветром, в грозу ливень косой, снег падает медленно и качается
  st.update = (dt, weather, flash) => {
    st.time += dt;
    const t = st.time,
      wet = weather === "rain" || weather === "storm",
      snow = weather === "snow",
      storm = weather === "storm";
    st.rain.visible = wet;
    st.snow.visible = snow;
    st.splash.visible = wet;
    if (st.groundFor !== weather) {
      st.groundFor = weather;
      const k = snow ? 3 : wet ? 2 : 1;
      for (const gr of st.ground) {
        gr[0].color.set(gr[k][0]);
        gr[0].roughness = gr[k][1];
      }
      st.road.uWet.value = wet ? 1 : snow ? 0.35 : 0.12;
      WX.uSnow.value = snow ? 1 : 0;
      WX.uWetAll.value = wet ? 1 : 0;
      st.sky.material.uniforms.uCloud.value = wet ? 1 : snow ? 0.85 : 0.25;
      coneMat.uniforms.uDensity.value = storm
        ? 1.4
        : wet
          ? 1.1
          : snow
            ? 0.9
            : 0.35;
      s.fog.density = storm ? 0.03 : wet ? 0.024 : snow ? 0.028 : 0.014;
    }
    st.road.uTime.value = t;
    st.road.uRain.value = storm ? 1.3 : wet ? 1 : 0;
    st.sky.material.uniforms.uTime.value = t;
    st.sky.material.uniforms.uFlash.value = flash;
    st.hemi.intensity = 0.9 + flash * 4;
    st.rainMat.uniforms.uOpacity.value = storm ? 0.42 : 0.3;
    st.rainMat.uniforms.uFlash.value = flash;
    st.splashMat.uniforms.uTime.value = t;
    st.splashMat.uniforms.uRate.value = storm ? 1.5 : 1;
    if (wet || snow) {
      const fall = snow ? 1.3 : storm ? 22 : 16,
        side = snow ? 0.4 : storm ? 6 : 2.4,
        p = (snow ? st.snowGeo : st.rainGeo).attributes.position.array;
      st.seed.forEach((r, i) => {
        r[1] -= dt * fall;
        r[0] -= dt * side * (snow ? Math.sin(t * 0.8 + i) : 1);
        if (r[1] < 0) {
          r[1] += 14;
          r[0] = (Math.random() - 0.5) * 50;
        }
        if (snow) p.set([r[0], r[1], r[2]], i * 3);
        else
          p.set(
            [r[0], r[1], r[2], r[0] + side * 0.03, r[1] + 0.5, r[2]],
            i * 6,
          );
      });
      (snow ? st.snowGeo : st.rainGeo).attributes.position.needsUpdate = true;
    }
  };
  // кадр: сначала отражение для асфальта, потом сама улица
  // дождь, снег и брызги лежат полосой ±25 м: у дальних зданий сценка сдвинута по улице — погода едет следом
  st.weatherAt = (x) => {
    for (const o of [st.rain, st.snow, st.splash]) o.position.x = x;
  };
  st.render = (renderer, scene, cam, mirrorScale) => {
    cam.layers.enable(NOREFLECT);
    st.mirror.scale = mirrorScale;
    st.road.uBlur.value = mirrorScale > 0.4 ? 2.2 : 1.4;
    st.mirror.render(renderer, scene, cam, [road]);
    st.road.tMirror.value = st.mirror.rt.texture;
    st.road.uMirror.value.copy(st.mirror.mat);
    renderer.render(scene, cam);
  };
  return st;
}
