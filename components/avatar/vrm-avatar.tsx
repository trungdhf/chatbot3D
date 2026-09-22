"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { Emotion, Gesture } from "@/lib/avatar";

export type { Gesture };

type Props = {
  url: string;
  emotion: Emotion;
  gesture: Gesture;
  /** Bump to replay the same gesture. */
  gestureKey: number;
  /** 0..1 mouth openness driven from outside (TTS). */
  mouth: number;
  className?: string;
};

type BoneName =
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "leftUpperArm"
  | "leftLowerArm"
  | "rightUpperArm"
  | "rightLowerArm"
  | "rightHand";

type Pose = Partial<Record<BoneName, [number, number, number]>>;

// VRM rest pose is a T-pose; arms hang by default.
const IDLE: Pose = {
  leftUpperArm: [0, 0, -1.25],
  rightUpperArm: [0, 0, 1.25],
  leftLowerArm: [0, 0, -0.1],
  rightLowerArm: [0, 0, 0.1],
};

const POSES: Record<Exclude<Gesture, "none"> | Emotion, Pose> = {
  wave: {
    rightUpperArm: [0.2, -0.3, -0.2],
    rightLowerArm: [0, 0, -1.9],
    rightHand: [0, 0, -0.3],
    head: [0, 0, -0.08],
  },
  bow: { spine: [0.4, 0, 0], chest: [0.15, 0, 0], neck: [0.25, 0, 0] },
  think: {
    rightUpperArm: [-0.55, 0, 1.4],
    rightLowerArm: [1.7, 0, -2.15],
    rightHand: [0, 0.3, -0.5],
    neck: [-0.05, 0.25, 0.15],
    head: [0, 0.1, 0.05],
  },
  neutral: {},
  happy: { head: [0, 0, 0.08], neck: [-0.05, 0, 0] },
  relaxed: { head: [0.05, 0, 0.05] },
  sad: { spine: [0.08, 0, 0], neck: [0.3, 0, 0], head: [0.15, 0, 0.05] },
  angry: { neck: [-0.1, 0, 0], head: [-0.05, 0, 0], chest: [-0.05, 0, 0] },
  surprised: { neck: [-0.15, 0, 0], spine: [-0.05, 0, 0] },
};

const GESTURE_DURATION: Record<Exclude<Gesture, "none">, number> = {
  wave: 3,
  bow: 2.4,
  think: Infinity,
};

const BONES: BoneName[] = [
  "spine",
  "chest",
  "neck",
  "head",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
];

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
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader
      .loadAsync(url)
      .then((gltf) => {
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

    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      if (!vrm) return;

      const s = state.current;
      const now = performance.now() / 1000;
      let g: Gesture = s.gesture;
      if (g !== "none" && now - s.gestureStart > GESTURE_DURATION[g]) g = "none";

      const target: Pose = { ...IDLE, ...POSES[s.emotion] };
      if (g !== "none") Object.assign(target, POSES[g]);
      const phase = now - s.gestureStart;

      for (const name of BONES) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (!node) continue;
        const [x, y, z] = target[name] ?? [0, 0, 0];
        tmp.set(x, y, z);
        // Breathing + gesture-specific motion layered on the target pose.
        if (name === "chest") tmp.x += Math.sin(t * 1.6) * 0.015;
        if (name === "head") tmp.y += Math.sin(t * 0.7) * 0.04;
        if (g === "wave" && name === "rightLowerArm") tmp.x += Math.sin(phase * 9) * 0.35;
        if (g === "bow") {
          const k = phase < 0.5 ? phase / 0.5 : phase > 1.8 ? Math.max(0, 1 - (phase - 1.8) / 0.6) : 1;
          tmp.x *= k;
        }
        if (g === "think" && name === "head") tmp.y += Math.sin(phase * 1.3) * 0.05;
        if (s.emotion === "happy" && name === "spine") tmp.x += Math.sin(t * 4) * 0.01;
        // VRM 0.x normalized bones sit in a frame rotated 180° around Y.
        if (vrm.meta.metaVersion === "0") {
          tmp.x = -tmp.x;
          tmp.z = -tmp.z;
        }
        const k = 1 - Math.exp(-dt * 8);
        node.rotation.x += (tmp.x - node.rotation.x) * k;
        node.rotation.y += (tmp.y - node.rotation.y) * k;
        node.rotation.z += (tmp.z - node.rotation.z) * k;
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
        const m = s.mouth;
        em.setValue("aa", m);
        em.setValue("oh", m * 0.3);

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
