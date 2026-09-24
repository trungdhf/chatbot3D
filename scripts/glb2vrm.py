"""Convert a Mixamo-rigged GLB with ARKit blendshapes into VRM 1.0 by injecting the VRMC_vrm extension."""
import json
import struct
import sys

src, dst = sys.argv[1], sys.argv[2]
data = open(src, "rb").read()
json_len = struct.unpack("<I", data[12:16])[0]
gltf = json.loads(data[20 : 20 + json_len])
bin_chunk = data[20 + json_len :]

nodes = gltf["nodes"]
by_name = {n.get("name"): i for i, n in enumerate(nodes)}

BONES = {
    "hips": "Hips", "spine": "Spine", "chest": "Spine1", "upperChest": "Spine2",
    "neck": "Neck", "head": "Head", "leftEye": "LeftEye", "rightEye": "RightEye",
    "leftShoulder": "LeftShoulder", "leftUpperArm": "LeftArm", "leftLowerArm": "LeftForeArm", "leftHand": "LeftHand",
    "rightShoulder": "RightShoulder", "rightUpperArm": "RightArm", "rightLowerArm": "RightForeArm", "rightHand": "RightHand",
    "leftUpperLeg": "LeftUpLeg", "leftLowerLeg": "LeftLeg", "leftFoot": "LeftFoot", "leftToes": "LeftToeBase",
    "rightUpperLeg": "RightUpLeg", "rightLowerLeg": "RightLeg", "rightFoot": "RightFoot", "rightToes": "RightToeBase",
}
for side in ("Left", "Right"):
    for finger in ("Thumb", "Index", "Middle", "Ring", "Little"):
        mx = "Pinky" if finger == "Little" else finger
        for k, seg in (("Metacarpal", 1), ("Proximal", 2), ("Distal", 3)) if finger == "Thumb" else (("Proximal", 1), ("Intermediate", 2), ("Distal", 3)):
            BONES[f"{side.lower()}{finger}{k}"] = f"{side}Hand{mx}{seg}"

human_bones = {}
for vrm_name, node_name in BONES.items():
    if node_name in by_name:
        human_bones[vrm_name] = {"node": by_name[node_name]}
    else:
        print("missing bone", vrm_name, node_name)

# Morph targets: node -> {targetName: index}
targets = {}
for i, n in enumerate(nodes):
    if "mesh" not in n:
        continue
    names = gltf["meshes"][n["mesh"]].get("extras", {}).get("targetNames")
    if names:
        targets[i] = {name: k for k, name in enumerate(names)}


def binds(spec):
    out = []
    for node, tmap in targets.items():
        for name, w in spec:
            if name in tmap:
                out.append({"node": node, "index": tmap[name], "weight": w})
    return out


PRESETS = {
    "happy": [("mouthSmileLeft", 1), ("mouthSmileRight", 1), ("cheekSquintLeft", 0.6), ("cheekSquintRight", 0.6), ("eyeSquintLeft", 0.4), ("eyeSquintRight", 0.4)],
    "sad": [("mouthFrownLeft", 1), ("mouthFrownRight", 1), ("browInnerUp", 1), ("browDownLeft", 0.3), ("browDownRight", 0.3), ("eyeLookDownLeft", 0.3), ("eyeLookDownRight", 0.3)],
    "angry": [("browDownLeft", 1), ("browDownRight", 1), ("noseSneerLeft", 0.6), ("noseSneerRight", 0.6), ("mouthPressLeft", 0.6), ("mouthPressRight", 0.6), ("eyeSquintLeft", 0.5), ("eyeSquintRight", 0.5)],
    "surprised": [("eyeWideLeft", 1), ("eyeWideRight", 1), ("browInnerUp", 1), ("browOuterUpLeft", 1), ("browOuterUpRight", 1), ("jawOpen", 0.5)],
    "relaxed": [("eyeBlinkLeft", 0.7), ("eyeBlinkRight", 0.7), ("mouthSmileLeft", 0.4), ("mouthSmileRight", 0.4)],
    "neutral": [],
    "aa": [("jawOpen", 0.7)],
    "ih": [("mouthStretchLeft", 0.6), ("mouthStretchRight", 0.6), ("jawOpen", 0.2)],
    "ou": [("mouthPucker", 0.8), ("mouthFunnel", 0.5), ("jawOpen", 0.2)],
    "ee": [("mouthSmileLeft", 0.6), ("mouthSmileRight", 0.6), ("jawOpen", 0.25)],
    "oh": [("mouthFunnel", 0.9), ("jawOpen", 0.5)],
    "blink": [("eyeBlinkLeft", 1), ("eyeBlinkRight", 1)],
    "blinkLeft": [("eyeBlinkLeft", 1)],
    "blinkRight": [("eyeBlinkRight", 1)],
    "lookUp": [("eyeLookUpLeft", 1), ("eyeLookUpRight", 1)],
    "lookDown": [("eyeLookDownLeft", 1), ("eyeLookDownRight", 1)],
    "lookLeft": [("eyeLookOutLeft", 1), ("eyeLookInRight", 1)],
    "lookRight": [("eyeLookInLeft", 1), ("eyeLookOutRight", 1)],
}
preset = {}
for name, spec in PRESETS.items():
    b = binds(spec)
    if b or name == "neutral":
        preset[name] = {"morphTargetBinds": b, "isBinary": False, "overrideBlink": "none", "overrideLookAt": "none", "overrideMouth": "none"}

gltf.setdefault("extensionsUsed", [])
if "VRMC_vrm" not in gltf["extensionsUsed"]:
    gltf["extensionsUsed"].append("VRMC_vrm")
gltf.setdefault("extensions", {})["VRMC_vrm"] = {
    "specVersion": "1.0",
    "meta": {
        "name": "Avatar",
        "version": "1.0",
        "authors": ["Trung"],
        "licenseUrl": "https://vrm.dev/licenses/1.0/",
        "avatarPermission": "onlyAuthor",
        "allowExcessivelyViolentUsage": False,
        "allowExcessivelySexualUsage": False,
        "commercialUsage": "personalNonProfit",
        "allowPoliticalOrReligiousUsage": False,
        "allowAntisocialOrHateUsage": False,
        "creditNotation": "required",
        "allowRedistribution": False,
        "modification": "prohibited",
    },
    "humanoid": {"humanBones": human_bones},
    "firstPerson": {"meshAnnotations": []},
    "lookAt": {"type": "expression", "offsetFromHeadBone": [0, 0.06, 0], "rangeMapHorizontalInner": {"inputMaxValue": 90, "outputScale": 1}, "rangeMapHorizontalOuter": {"inputMaxValue": 90, "outputScale": 1}, "rangeMapVerticalDown": {"inputMaxValue": 90, "outputScale": 1}, "rangeMapVerticalUp": {"inputMaxValue": 90, "outputScale": 1}},
    "expressions": {"preset": preset, "custom": {}},
}

js = json.dumps(gltf, separators=(",", ":")).encode()
js += b" " * ((4 - len(js) % 4) % 4)
total = 12 + 8 + len(js) + len(bin_chunk)
with open(dst, "wb") as f:
    f.write(b"glTF" + struct.pack("<II", 2, total))
    f.write(struct.pack("<I", len(js)) + b"JSON" + js)
    f.write(bin_chunk)
print("bones", len(human_bones), "expressions", sorted(preset), "->", dst)
