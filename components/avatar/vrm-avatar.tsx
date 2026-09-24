"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils, type VRMHumanBoneName } from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  type VRMAnimation,
} from "@pixiv/three-vrm-animation";
import { VISEMES, type Emotion, type Gesture, type Visemes } from "@/lib/avatar";

export type { Gesture };

type Props = {
  url: string;
  emotion: Emotion;
  gesture: Gesture;
  /** Bump to replay the same gesture. */
  gestureKey: number;
  /** Viseme weights 0..1 driven from outside (TTS). */
  mouth: Visemes;
  className?: string;
};

type BoneName = "spine" | "chest" | "neck" | "head";
type Pose = Partial<Record<BoneName, [number, number, number]>>;

/** Small rotation offsets layered on top of the VRMA clips. */
const POSES: Record<"bow" | Emotion, Pose> = {
  bow: { spine: [0.4, 0, 0], chest: [0.15, 0, 0], neck: [0.25, 0, 0] },
  neutral: {},
  happy: { head: [0, 0, 0.08], neck: [-0.05, 0, 0] },
  relaxed: { head: [0.05, 0, 0.05] },
  sad: { spine: [0.08, 0, 0], neck: [0.3, 0, 0], head: [0.15, 0, 0.05] },
  angry: { neck: [-0.1, 0, 0], head: [-0.05, 0, 0], chest: [-0.05, 0, 0] },
  surprised: { neck: [-0.15, 0, 0], spine: [-0.05, 0, 0] },
};

const BONES: BoneName[] = ["spine", "chest", "neck", "head"];
const BOW_DURATION = 2.4;

/** VRMA clips: idle loops; gestures play once (wave) or loop while active (think). */
const CLIPS = {
  idle: "/anims/idle.vrma",
  wave: "/anims/Goodbye.vrma",
  think: "/anims/Thinking.vrma",
} as const;
type ClipName = keyof typeof CLIPS;

const FINGERS = ["Index", "Middle", "Ring", "Little"] as const;
const SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;

/** Close the T-pose finger spread into a relaxed, lightly curled hand. */
function relaxFingers(vrm: VRM) {
  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? -1 : 1;
    FINGERS.forEach((finger, i) => {
      SEGMENTS.forEach((seg, j) => {
        const node = vrm.humanoid.getNormalizedBoneNode(
          `${side}${finger}${seg}` as VRMHumanBoneName,
        );
        if (!node) return;
        node.rotation.set(0, j === 0 ? sign * (i - 1.5) * 0.08 : 0, sign * (j === 0 ? 0.25 : 0.35));
      });
    });
    for (const seg of ["Metacarpal", "Proximal", "Distal"] as const) {
      const node = vrm.humanoid.getNormalizedBoneNode(
        `${side}Thumb${seg}` as VRMHumanBoneName,
      );
      if (node) node.rotation.set(0, sign * -0.25, seg === "Metacarpal" ? 0 : sign * 0.2);
    }
  }
}

export default function VrmAvatar({
  url,
  emotion,
  gesture,
  gestureKey,
  mouth,
  className,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ emotion, gesture, gestureKey, mouth, gestureStart: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  state.current.emotion = emotion;
  state.current.mouth = mouth;
  if (state.current.gestureKey !== gestureKey || state.current.gesture !== gesture) {
    state.current.gesture = gesture;
    state.current.gestureKey = gestureKey;
    state.current.gestureStart = performance.now() / 1000;
  }

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "absolute inset-0 h-full w-full";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xfff1e6, 1.6);
    key.position.set(1, 2, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffb7c5, 0.6);
    rim.position.set(-2, 1, -1);
    scene.add(rim);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let vrm: VRM | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const actions: Partial<Record<ClipName, THREE.AnimationAction>> = {};
    let current: ClipName = "idle";
    let waveDone = -1;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    const loadClip = async (v: VRM, m: THREE.AnimationMixer, name: ClipName) => {
      const gltf = await loader.loadAsync(CLIPS[name]);
      const anim = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
      if (!anim || disposed) return;
      const clip = createVRMAnimationClip(anim, v);
      // Keep body bone tracks only; fingers, expressions and look-at stay under our control.
      clip.tracks = clip.tracks.filter(
        (tr) => tr.name.endsWith(".quaternion") && !/Thumb|Index|Middle|Ring|Little/.test(tr.name),
      );
      const action = m.clipAction(clip);
      if (name === "wave") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions[name] = action;
    };

    const play = (name: ClipName) => {
      const next = actions[name];
      if (!next || name === current) return;
      const prev = actions[current];
      next.reset().play();
      if (prev) next.crossFadeFrom(prev, 0.35, false);
      current = name;
    };

    loader
      .loadAsync(url)
      .then(async (gltf) => {
        if (disposed) return;
        const loaded = gltf.userData.vrm as VRM;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(loaded);
        loaded.scene.traverse((o) => {
          o.frustumCulled = false;
        });
        scene.add(loaded.scene);
        vrm = loaded;
        if (vrm.lookAt) vrm.lookAt.target = camera;

        relaxFingers(vrm);

        mixer = new THREE.AnimationMixer(loaded.scene);
        await loadClip(loaded, mixer, "idle");
        actions.idle?.play();
        void Promise.all([loadClip(loaded, mixer, "wave"), loadClip(loaded, mixer, "think")]);

        const head = vrm.humanoid.getNormalizedBoneNode("head");
        const headY = head ? head.getWorldPosition(new THREE.Vector3()).y : 1.4;
        camera.position.set(0, headY - 0.25, 2.6);
        camera.lookAt(0, headY - 0.3, 0);
        setStatus("ready");
      })
      .catch((e) => {
        console.error("VRM load failed", e);
        if (!disposed) setStatus("error");
      });

    const clock = new THREE.Clock();
    let nextBlink = 2;
    let blinkT = -1;
    const tmp = new THREE.Euler();
    const offset: Record<BoneName, THREE.Euler> = {
      spine: new THREE.Euler(),
      chest: new THREE.Euler(),
      neck: new THREE.Euler(),
      head: new THREE.Euler(),
    };

    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      if (!vrm) return;

      const s = state.current;
      const now = performance.now() / 1000;
      const phase = now - s.gestureStart;
      let g: Gesture = s.gesture;
      if (g === "bow" && phase > BOW_DURATION) g = "none";
      if (g === "wave") {
        if (current === "wave" && actions.wave && !actions.wave.isRunning()) waveDone = s.gestureKey;
        if (waveDone === s.gestureKey) g = "none";
      }

      // Undo last frame's offsets so bones the clip doesn't touch don't drift.
      for (const name of BONES) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (!node) continue;
        node.rotation.x -= offset[name].x;
        node.rotation.y -= offset[name].y;
        node.rotation.z -= offset[name].z;
      }

      play(g === "wave" || g === "think" ? g : "idle");
      mixer?.update(dt);

      const target: Pose = { ...POSES[s.emotion] };
      if (g === "bow") Object.assign(target, POSES.bow);

      for (const name of BONES) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (!node) continue;
        const [x, y, z] = target[name] ?? [0, 0, 0];
        tmp.set(x, y, z);
        if (name === "head") tmp.y += Math.sin(t * 0.7) * 0.04;
        if (g === "bow") {
          const k = phase < 0.5 ? phase / 0.5 : phase > 1.8 ? Math.max(0, 1 - (phase - 1.8) / 0.6) : 1;
          tmp.x *= k;
        }
        if (s.emotion === "happy" && name === "spine") tmp.x += Math.sin(t * 4) * 0.01;
        // VRM 0.x normalized bones sit in a frame rotated 180° around Y.
        if (vrm.meta.metaVersion === "0") {
          tmp.x = -tmp.x;
          tmp.z = -tmp.z;
        }
        const k = 1 - Math.exp(-dt * 8);
        offset[name].x += (tmp.x - offset[name].x) * k;
        offset[name].y += (tmp.y - offset[name].y) * k;
        offset[name].z += (tmp.z - offset[name].z) * k;
        node.rotation.x += offset[name].x;
        node.rotation.y += offset[name].y;
        node.rotation.z += offset[name].z;
      }

      const em = vrm.expressionManager;
      if (em) {
        const want: Record<string, number> = {
          happy: s.emotion === "happy" ? 1 : 0,
          sad: s.emotion === "sad" ? 1 : 0,
          angry: s.emotion === "angry" ? 1 : 0,
          surprised: s.emotion === "surprised" ? 1 : 0,
          relaxed: s.emotion === "relaxed" || g === "think" ? 0.6 : 0,
        };
        for (const [k, v] of Object.entries(want)) {
          const cur = em.getValue(k) ?? 0;
          em.setValue(k, cur + (v - cur) * (1 - Math.exp(-dt * 6)));
        }
        for (const v of VISEMES) {
          const cur = em.getValue(v) ?? 0;
          em.setValue(v, cur + (s.mouth[v] - cur) * (1 - Math.exp(-dt * 25)));
        }

        if (blinkT < 0 && t > nextBlink) {
          blinkT = 0;
          nextBlink = t + 2.5 + Math.random() * 3;
        }
        if (blinkT >= 0) {
          blinkT += dt;
          const v = blinkT < 0.08 ? blinkT / 0.08 : Math.max(0, 1 - (blinkT - 0.08) / 0.1);
          em.setValue("blink", v);
          if (blinkT > 0.2) blinkT = -1;
        }
      }

      if (vrm.lookAt && g === "think") {
        vrm.lookAt.target = null;
        vrm.lookAt.yaw = 20;
        vrm.lookAt.pitch = 15;
      } else if (vrm.lookAt) {
        vrm.lookAt.target = camera;
      }

      vrm.update(dt);
      renderer.render(scene, camera);
    };
    let raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [url]);

  return (
    <div ref={host} className={`relative ${className ?? ""}`}>
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
          {status === "loading" ? "Đang tải model…" : "Không tải được model"}
        </div>
      )}
    </div>
  );
}
