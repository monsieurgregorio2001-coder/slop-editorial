// The Certificate of Authenticity: a gilded seal on a plinth. Procedural geometry only,
// no assets. Tiers: "webgpu" (three/webgpu WebGPURenderer, guarded), "webgl" (WebGLRenderer),
// and the poster sequence handled by the page (no 3D at all).

type T = typeof import("three");

export type SealHandle = {
  renderer: "webgpu" | "webgl";
  setLight(p: number): void;
  setLean(nx: number, ny: number): void;
  rotate(dy: number, dx: number): void;
  setPose(y: number): void;
  zoom(d: number): void;
  setAuto(on: boolean): void;
  resize(): void;
  dispose(): void;
};

function makeEnv(THREE: T): any {
  // A small studio of soft light panels, rendered once into a PMREM.
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x0b0a14);
  const panel = (w: number, h: number, pos: [number, number, number], i: number, col = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(10, 3, [0, 8, 2], 6);
  panel(2.5, 9, [-7, 2, 3], 4, 0xfff1d6);
  panel(2.5, 9, [7, 1, -2], 3, 0xd6d9ff);
  panel(8, 2, [0, -3, 6], 1.5);
  panel(6, 6, [0, 2, -9], 2.4, 0xffe2b0);
  return s;
}

function build(THREE: T) {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a92f, metalness: 1, roughness: 0.24, envMapIntensity: 1.3 });
  const goldSoft = new THREE.MeshStandardMaterial({ color: 0xb98a24, metalness: 1, roughness: 0.4, envMapIntensity: 1 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x1b1438, metalness: 0.2, roughness: 0.22, envMapIntensity: 0.9 });

  // Plinth: base, shaft, cap, with gold trim.
  const cyl = (rt: number, rb: number, h: number, y: number, mat: any, seg = 64) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.y = y; g.add(m); return m; };
  cyl(2.2, 2.3, 0.3, 0.15, stone);
  cyl(1.7, 1.9, 0.25, 0.42, stone);
  cyl(1.35, 1.45, 1.9, 1.5, stone, 48);
  cyl(1.75, 1.45, 0.3, 2.6, stone);
  const trim = (r: number, y: number) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 16, 96), gold); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); };
  trim(1.9, 0.56); trim(1.78, 2.76); trim(1.46, 2.45);
  cyl(0.12, 0.12, 2.6, 4.0, gold, 24);

  // The seal: a scalloped rosette, a ring, a recessed field and a raised check mark.
  const seal = new THREE.Group(); seal.position.y = 6.2; g.add(seal);
  const rose = new THREE.Shape();
  const N = 28, R = 1.62;
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const r = R + 0.11 * Math.cos(a * N);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) rose.moveTo(x, y); else rose.lineTo(x, y);
  }
  const roseGeo = new THREE.ExtrudeGeometry(rose, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 4, curveSegments: 4 });
  roseGeo.translate(0, 0, -0.1);
  seal.add(new THREE.Mesh(roseGeo, gold));
  for (const side of [1, -1]) {
    const face = new THREE.Group(); if (side < 0) face.rotation.y = Math.PI; seal.add(face);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.06, 20, 128), goldSoft); ring.position.z = 0.17; face.add(ring);
    const field = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.04, 96), goldSoft); field.rotation.x = Math.PI / 2; field.position.z = 0.14; face.add(field);
    const chk = new THREE.Shape();
    chk.moveTo(-0.74, 0.04); chk.lineTo(-0.56, 0.22); chk.lineTo(-0.2, -0.14); chk.lineTo(0.52, 0.62); chk.lineTo(0.72, 0.44); chk.lineTo(-0.2, -0.58); chk.lineTo(-0.74, 0.04);
    const cg = new THREE.ExtrudeGeometry(chk, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
    const cm = new THREE.Mesh(cg, gold); cm.position.set(0, -0.06, 0.16); face.add(cm);
    // A ring of beads inside the scallops.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), gold);
      b.position.set(Math.cos(a) * 1.42, Math.sin(a) * 1.42, 0.17); face.add(b);
    }
  }

  // Ribbon tails.
  const ribMat = new THREE.MeshStandardMaterial({ color: 0xd1337a, metalness: 0.1, roughness: 0.45, envMapIntensity: 0.8 });
  const tail = new THREE.Shape();
  tail.moveTo(0, 0); tail.lineTo(0.62, 0); tail.lineTo(0.62, -1.3); tail.lineTo(0.31, -1.0); tail.lineTo(0, -1.3); tail.lineTo(0, 0);
  const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.04, bevelEnabled: false });
  const t1 = new THREE.Mesh(tg, ribMat); t1.position.set(-0.7, -1.3, -0.12); t1.rotation.z = 0.14; seal.add(t1);
  const t2 = new THREE.Mesh(tg, ribMat); t2.position.set(0.08, -1.3, -0.12); t2.rotation.z = -0.14; seal.add(t2);
  return { group: g, seal };
}

export async function mountSeal(host: HTMLElement, opts: { tier: "webgpu" | "webgl"; dpr?: number }): Promise<SealHandle> {
  let kind: "webgpu" | "webgl" = opts.tier;
  let THREE: T;
  let renderer: any;

  if (kind === "webgpu") {
    try {
      THREE = (await import("three/webgpu")) as unknown as T;
      renderer = new (THREE as any).WebGPURenderer({ antialias: true, alpha: true });
      await Promise.race([renderer.init(), new Promise((_, rej) => setTimeout(() => rej(new Error("WebGPU init timed out")), 4000))]);
    } catch {
      kind = "webgl";
    }
  }
  if (kind === "webgl") {
    THREE = await import("three");
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  }
  const dpr = Math.min(opts.dpr ?? devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE!.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.outputColorSpace = THREE!.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";
  host.appendChild(renderer.domElement);

  const scene = new THREE!.Scene();
  const cam = new THREE!.PerspectiveCamera(26, 1, 0.1, 100);
  const pm = new THREE!.PMREMGenerator(renderer);
  const envScene = makeEnv(THREE!);
  const envRT = typeof (pm as any).fromSceneAsync === "function" ? await (pm as any).fromSceneAsync(envScene, 0.03) : pm.fromScene(envScene, 0.03);
  scene.environment = envRT.texture;

  const { group, seal } = build(THREE!);
  scene.add(group);

  const key = new THREE!.DirectionalLight(0xfff0d8, 2.2); key.position.set(3, 8, 6); scene.add(key);
  const rim = new THREE!.DirectionalLight(0xffd9a0, 1.6); rim.position.set(-6, 3, -5); scene.add(rim);

  let rotY = -0.35, rotX = 0.05, camZ = 24, auto = true, lean = { x: 0, y: 0 }, light = 0;
  const target = new THREE!.Vector3(0, 4.0, 0);
  let raf = 0, last = performance.now(), disposed = false;

  const size = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  };
  const frame = (now: number) => {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (auto) rotY += dt * 0.28;
    // The plinth holds still. The seal turns and bobs a little.
    seal.rotation.y = rotY + lean.x * 0.25;
    seal.rotation.x = rotX + lean.y * 0.08;
    seal.position.y = 6.2 + Math.sin(now / 1600) * 0.04;
    cam.position.set(0, 4.6, camZ); cam.lookAt(target);
    key.position.set(3 + lean.x * 7, 8 + lean.y * -3, 6);
    if ("environmentRotation" in scene) (scene as any).environmentRotation.y = lean.x * 0.9;
    // Scroll-driven product lighting: dark, then the key light blooms, then it warms.
    key.intensity = 0.2 + light * 3.4;
    rim.intensity = 0.1 + Math.max(0, light - 0.25) * 2.2;
    renderer.toneMappingExposure = 0.32 + light * 0.62;
    (scene as any).environmentIntensity = 0.25 + light * 1.1;
    renderer.render(scene, cam);
  };
  size();
  const loop = (now: number) => { frame(now); raf = requestAnimationFrame(loop); };
  if (typeof renderer.setAnimationLoop === "function" && kind === "webgpu") renderer.setAnimationLoop((t: number) => frame(t)); else raf = requestAnimationFrame(loop);

  return {
    renderer: kind,
    setLight: (p) => { light = Math.min(1, Math.max(0, p)); },
    setLean: (nx, ny) => { lean = { x: nx, y: ny }; },
    setPose: (y) => { auto = false; rotY = y; },
    rotate: (dy, dx) => { rotY += dy; rotX = Math.max(-0.5, Math.min(0.5, rotX + dx)); },
    zoom: (d) => { camZ = Math.max(14, Math.min(30, camZ + d)); },
    setAuto: (on) => { auto = on; },
    resize: size,
    dispose: () => {
      disposed = true; cancelAnimationFrame(raf);
      if (typeof renderer.setAnimationLoop === "function") renderer.setAnimationLoop(null);
      scene.traverse((o: any) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x: any) => x.dispose?.()); });
      envRT.dispose(); pm.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
