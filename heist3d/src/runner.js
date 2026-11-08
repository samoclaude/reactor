// Вор от первого лица: W/S/A/D, мышь (захват курсора по клику), Shift — красться (медленно и тихо).
// Упирается в стены и мебель по растру проходимости из world.js.
import * as THREE from "three";
import { rasterFree } from "./world.js";

export const EYE = 1.62;
const RADIUS = 0.24,
  WALK = 3.5, // обычный шаг: около комнаты за такт, охрана рядом слышит
  SNEAK = 1.8, // Shift: крадётся, около полкомнаты за такт, бесшумно
  ACC = 12,
  SENS = 0.0022;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Runner {
  constructor(camera, canvas) {
    this.cam = camera;
    this.canvas = canvas;
    this.yaw = 0;
    this.pitch = 0;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.keys = new Set();
    this.enabled = false;
    this.locked = false;
    this.bob = 0;
    this.stepPhase = 0;
    this.onStep = null;
    this.lookYaw = 0;
    this.lookPitch = 0; // для крупных планов: камеру ведёт не мышь
    this.sens = 1; // ползунок «Мышь» в настройках
    canvas.addEventListener("click", () => {
      if (this.enabled && !this.locked && !this.closeup)
        canvas.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * SENS * this.sens;
      this.pitch = clamp(
        this.pitch - e.movementY * SENS * this.sens,
        -1.25,
        1.25,
      );
    });
    addEventListener("keydown", (e) => {
      if (e.target && e.target.tagName === "INPUT") return;
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }
  place(x, z, yaw) {
    this.pos.set(x, EYE, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.vel.set(0, 0);
  }
  unlock() {
    // мышь отпускает сама игра (брифинг, итоги, меню) — это не Esc игрока
    if (document.pointerLockElement) {
      this.selfUnlock = true;
      document.exitPointerLock();
    }
  }
  free(R, x, z) {
    const r = RADIUS,
      d = r * 0.7071;
    return (
      rasterFree(R, x, z) &&
      rasterFree(R, x + r, z) &&
      rasterFree(R, x - r, z) &&
      rasterFree(R, x, z + r) &&
      rasterFree(R, x, z - r) &&
      rasterFree(R, x + d, z + d) &&
      rasterFree(R, x - d, z + d) &&
      rasterFree(R, x + d, z - d) &&
      rasterFree(R, x - d, z - d)
    );
  }
  update(dt, R, canMove) {
    const k = this.keys,
      on = (c) => k.has(c);
    let fx = 0,
      fz = 0;
    if (canMove && !this.closeup) {
      if (on("KeyW") || on("ArrowUp")) fz -= 1;
      if (on("KeyS") || on("ArrowDown")) fz += 1;
      if (on("KeyA") || on("ArrowLeft")) fx -= 1;
      if (on("KeyD") || on("ArrowRight")) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len) {
      fx /= len;
      fz /= len;
    }
    const sp = on("ShiftLeft") || on("ShiftRight") ? SNEAK : WALK,
      s = Math.sin(this.yaw),
      c = Math.cos(this.yaw);
    const tx = (fx * c + fz * s) * sp,
      tz = (-fx * s + fz * c) * sp,
      a = 1 - Math.exp(-ACC * dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.y += (tz - this.vel.y) * a;
    // движение по осям отдельно, мелкими шагами: так вор скользит вдоль стены и не проходит сквозь углы
    const n = Math.max(
      1,
      Math.ceil((Math.hypot(this.vel.x, this.vel.y) * dt) / 0.05),
    );
    const v0 = Math.hypot(this.vel.x, this.vel.y);
    let hit = false;
    for (let i = 0; i < n; i++) {
      const nx = this.pos.x + (this.vel.x * dt) / n;
      if (this.free(R, nx, this.pos.z)) this.pos.x = nx;
      else ((hit = hit || Math.abs(this.vel.x) > 1.2), (this.vel.x = 0));
      const nz = this.pos.z + (this.vel.y * dt) / n;
      if (this.free(R, this.pos.x, nz)) this.pos.z = nz;
      else ((hit = hit || Math.abs(this.vel.y) > 1.2), (this.vel.y = 0));
    }
    // уткнулся в стену на ходу — шорох куртки (не чаще раза в 0,8 с)
    this.bumpT = (this.bumpT || 0) + dt;
    if (hit && v0 > 1.5 && this.bumpT > 0.8 && this.onBump) {
      this.bumpT = 0;
      this.onBump();
    }
    // шаги и лёгкое покачивание
    const v = Math.hypot(this.vel.x, this.vel.y);
    // идёт быстрее, чем крадётся: охрана рядом это слышит
    this.loud = v > SNEAK + 0.3;
    if (v > 0.3) {
      const prev = this.stepPhase;
      // шагов в секунду: обычным шагом ~3,5, крадучись ~2,25; один шаг — пол-оборота фазы
      this.stepPhase += dt * Math.PI * (0.9 + 0.75 * v);
      if (
        Math.floor(prev / Math.PI) !== Math.floor(this.stepPhase / Math.PI) &&
        this.onStep
      )
        this.onStep(this.loud);
    }
    // остановился после ходьбы — мягкий последний шаг
    if (v > 1) this.moving = true;
    else if (this.moving && v < 0.3) {
      this.moving = false;
      if (this.onStop) this.onStop();
    }
    this.bob +=
      ((v > 0.3
        ? // ниже всего голова в момент шага — тогда же и звук
          -Math.cos(this.stepPhase * 2) * 0.025 * Math.min(1, v / SNEAK)
        : 0) -
        this.bob) *
      Math.min(1, dt * 10);
    if (!this.closeup) {
      this.cam.position.set(this.pos.x, EYE + this.bob, this.pos.z);
      this.cam.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    }
    return v;
  }
}
