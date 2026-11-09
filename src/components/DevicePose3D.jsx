// DevicePose3D.jsx
// 아이게이지 하드웨어의 현재 자세(pitch / roll / yaw)를 3D로 보여주는 라이브 뷰.
//
// 성능: 자세값은 WebSocket 프레임마다(눈마다) 들어오므로 React state를 쓰지 않는다.
//   부모가 poseRef.current 에 { pitch, roll, yaw, t } 를 써 넣고,
//   여기서는 useFrame(매 렌더 프레임)에서 읽어 모델 회전 · 숫자 표시를 직접 갱신한다.
import React, { useRef, useMemo, useEffect, useCallback, memo, useLayoutEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { RotateCcw } from "lucide-react";
import useVariableStore from "../stores/useVariableStore";

// 축 부호 보정. 기기를 손으로 기울여 보고 화면과 반대로 움직이는 축은 -1 로 바꾼다.
//   pitch : 2026-10-22 실기기로 확인 — 펌웨어 pitch 는 앞(검사자 쪽)이 "아래로" 숙일 때 +.
//           그대로 그리면 화면이 반대로 움직여서 -1.
//   roll  +  : 보는 사람 기준 왼쪽(OD 쪽)이 아래로 기울어짐
//   yaw   +  : 위에서 볼 때 반시계 방향으로 회전
const AXIS_SIGN = { pitch: -1, roll: 1, yaw: 1 };

// 이 시간(ms) 동안 자세값이 안 오면 "데이터 없음" 표시
const STALE_MS = 1000;

// 스무딩 강도. 클수록 빨리 따라간다 (1/s).
const SMOOTHING = 12;

// 기본 3D 시점. 사용자가 마우스로 돌린 시점은 useVariableStore.POSE_CAM 에 저장돼 다음에도 쓰인다.
const DEFAULT_CAM = { position: [-3.4, 3.0, 4.3], target: [0, 1.2, -0.6] };
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const validCam = (c) => (c && isVec3(c.position) && isVec3(c.target) ? c : DEFAULT_CAM);

// 기준 그리드 (바닥 + 벽) 공통 설정: 0.25 칸, 1 단위마다 진한 선.
// 흐려지는 기준을 카메라가 아니라 그리드 중심(fadeFrom=0)으로 둬서, 시점을 멀리 빼도 모델 주변 선이 사라지지 않는다.
const GRID_PROPS = {
    cellSize: 0.25,
    cellColor: "#d1d5db",
    sectionSize: 1,
    sectionColor: "#9ca3af",
    fadeFrom: 0,
    fadeDistance: 30,
    fadeStrength: 1,
    side: THREE.DoubleSide,
};
const WALL = 4; // 벽 그리드까지의 거리(= 벽 한 변의 절반)

// 안경(렌즈 링) 색 — 고정. 자세가 적절한지는 사람이 판단하므로 상태에 따라 색을 바꾸지 않는다 (숫자 표시도 마찬가지).
const COLOR_RIM = new THREE.Color("#d1d5db");

const DEG = Math.PI / 180;

const normDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const fmt = (v) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}°` : "--");

// 기기 모델 — 아이게이지 헤드셋 (실물 사진 기준, 2026-10-19).
//   전면 커버(흰 판) 아래에 iGAZY 로고 하우징이 있고 그 밑에 두꺼운 렌즈 링 2개가 매달려 있다.
//   머리띠(검정 밴드) 양옆에 흰 패드, 뒤통수에 다이얼 달린 패드, 전면 커버 뒤에 검정 이마 쿠션. (정수리 스트랩은 사용자 요청으로 그리지 않는다)
// 좌표계: +Z = 보는 사람(검사자) 쪽, 환자는 -Z 쪽에서 +Z 방향을 본다. 회전 중심(원점)은 렌즈 링 사이(IMU 가 든 전면부 근처).
// 환자를 마주 보면 환자의 오른쪽 눈(OD)이 보는 사람의 왼쪽이므로 OD 를 -X 에 둔다.
// 치수는 렌즈 링 지름(=1.0)을 기준으로 사진에서 잰 비율이고, 전체를 MODEL_SCALE 로 줄여 이전 모델과 비슷한 크기로 맞춘다.
const MODEL_SCALE = 0.8;
const RING_R = 0.6; // 렌즈 링 바깥 반지름
const RING_W = 0.17; // 링 테두리 폭 (납작한 와셔 모양)
const RING_D = 0.24; // 링 두께(Z)
const EYE_X = 0.76; // 렌즈 중심 간격의 절반
const LENSES = [
    { x: -EYE_X, label: "OD" },
    { x: EYE_X, label: "OS" },
];
const HEAD_Y = 1.5; // 머리띠 높이 (전면 커버 가운데)
const HEAD_Z = -1.85; // 머리 중심 (머리띠 타원의 중심). 띠 앞쪽(HEAD_Z + HEAD_RZ)이 전면 커버 안에 묻히게 잡는다
const HEAD_RX = 1.45; // 머리띠 반지름 (좌우)
const HEAD_RZ = 1.6; // 머리띠 반지름 (앞뒤)
const COLOR_SHELL = "#f8fafc"; // 흰 플라스틱
const COLOR_STRAP = "#1f2937"; // 검정 밴드·쿠션

// 캔버스에 글자를 그려 텍스처로 만든다 (라벨 스프라이트 · 로고 데칼 공용)
function makeTextTexture(text, { color, bg, font, w = 128, h = 64 }) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (bg) {
        ctx.fillStyle = bg;
        if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(4, 4, w - 8, h - 8, 14);
            ctx.fill();
        } else {
            // roundRect 미지원(구형 WebView · Safari < 16) — 모서리만 각지고 동작은 같다
            ctx.fillRect(4, 4, w - 8, h - 8);
        }
    }
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// 항상 카메라를 보는 라벨. 기기와 함께 움직인다.
function TextSprite({ text, position, scale = 0.44 }) {
    const texture = useMemo(
        () => makeTextTexture(text, { color: "#374151", bg: "rgba(255,255,255,0.92)", font: "bold 40px sans-serif" }),
        [text],
    );
    useEffect(() => () => texture.dispose(), [texture]);

    return (
        <sprite position={position} scale={[scale, scale / 2, 1]}>
            <spriteMaterial map={texture} transparent depthTest={false} />
        </sprite>
    );
}

// 로고 하우징 앞면에 붙는 평면 데칼 (스프라이트와 달리 기기 표면을 따라 돈다)
function LogoDecal({ position, rotation }) {
    const texture = useMemo(
        () => makeTextTexture("iGAZY", { color: "#f59e0b", font: "bold 44px sans-serif", w: 256, h: 64 }),
        [],
    );
    useEffect(() => () => texture.dispose(), [texture]);
    return (
        <mesh position={position} rotation={rotation}>
            <planeGeometry args={[0.8, 0.2]} />
            <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
    );
}

// 2D 윤곽을 Z 방향으로 뽑아낸 지오메트리. 중심이 원점이고 두께 방향이 Z 다. (링 · 타원 패드 · 캡슐 패드 공용)
function extrudeCentered(shape, depth) {
    const g = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 2,
        curveSegments: 40,
    });
    g.translate(0, 0, -depth / 2);
    return g;
}
// 타원 판 (이마 쿠션 · 뒤통수 패드)
function ellipseGeometry(rx, ry, depth) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
    return extrudeCentered(shape, depth);
}
// 양 끝이 반원인 캡슐 판 (옆 패드). w = 전체 길이, h = 높이
function stadiumGeometry(w, h, depth) {
    const r = h / 2;
    const shape = new THREE.Shape();
    shape.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
    shape.absarc(-w / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
    shape.closePath();
    return extrudeCentered(shape, depth);
}

/**
 * @param ghost true 면 영점(0,0,0) 자세의 기준 형상 — 같은 모델을 반투명 회색 한 가지 재질로 그린다 (로고는 숨김).
 *   현재 자세 모델과 겹쳐 보여, 기기가 영점에서 얼마나 움직였는지 눈으로 바로 비교한다 (2026-10-28).
 */
function DeviceModel({ ghost = false }) {
    const rootRef = useRef(null);
    const ghostMat = useMemo(
        () => (ghost ? new THREE.MeshBasicMaterial({ color: "#9ca3af", transparent: true, opacity: 0.28, depthWrite: false }) : null),
        [ghost],
    );
    useLayoutEffect(() => {
        if (!ghost || !rootRef.current) return;
        rootRef.current.traverse((o) => {
            if (!o.isMesh) return;
            if (o.material?.map) o.visible = false; // 로고 데칼
            else o.material = ghostMat;
        });
    }, [ghost, ghostMat]);
    useEffect(() => () => ghostMat?.dispose(), [ghostMat]);
    // 두 링이 같은 재질·지오메트리를 공유한다 (색 고정 — 자세 판정은 사람이 한다)
    const rimMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: COLOR_RIM, roughness: 0.45, metalness: 0.1 }),
        [],
    );
    // 납작한 고리를 Z 로 뽑아낸 와셔 모양 (실물 링은 토러스가 아니라 두꺼운 판이다)
    const geo = useMemo(() => {
        const ringShape = new THREE.Shape();
        ringShape.absarc(0, 0, RING_R, 0, Math.PI * 2, false);
        const hole = new THREE.Path();
        hole.absarc(0, 0, RING_R - RING_W, 0, Math.PI * 2, true);
        ringShape.holes.push(hole);
        return {
            ring: extrudeCentered(ringShape, RING_D),
            foreheadPad: ellipseGeometry(1.0, 0.48, 0.14), // 전면 커버 뒤 검정 이마 쿠션 — 커버 폭에 가까운 넓은 타원
            sidePad: stadiumGeometry(1.1, 0.44, 0.12), // 옆 패드 (경첩 판 2장 중 큰 것)
            sidePadSmall: stadiumGeometry(0.62, 0.36, 0.1),
            rearPad: ellipseGeometry(0.62, 0.44, 0.18), // 뒤통수 패드 — 세로로 조금 납작한 타원
            rearCushion: ellipseGeometry(0.5, 0.36, 0.08), // 뒤통수 패드 안쪽(머리 닿는 면) 검정 쿠션
        };
    }, []);
    useEffect(
        () => () => {
            rimMat.dispose();
            Object.values(geo).forEach((g) => g.dispose());
        },
        [rimMat, geo],
    );

    return (
        <group ref={rootRef} scale={MODEL_SCALE}>
            {LENSES.map(({ x, label }) => (
                <group key={label} position={[x, 0, 0]}>
                    {/* 렌즈 링 */}
                    <mesh geometry={geo.ring} material={rimMat} />
                    {/* 링 안쪽: 카메라 모듈(어두운 통) + 렌즈 */}
                    <mesh position={[0, 0, -0.06]}>
                        <circleGeometry args={[RING_R - RING_W + 0.01, 40]} />
                        <meshStandardMaterial color="#374151" roughness={0.7} side={THREE.DoubleSide} />
                    </mesh>
                    <mesh position={[0, 0, -0.05]}>
                        <circleGeometry args={[0.14, 32]} />
                        <meshStandardMaterial color="#6b7280" roughness={0.2} metalness={0.6} />
                    </mesh>
                    <TextSprite text={label} position={[0, -(RING_R + 0.26), 0.2]} />
                </group>
            ))}

            {/* 두 링을 잇는 콧등 브리지 + 아래 코 탭 */}
            <RoundedBox args={[0.5, 0.16, RING_D]} radius={0.05} smoothness={2} position={[0, 0.14, 0]}>
                <meshStandardMaterial color={COLOR_SHELL} roughness={0.5} />
            </RoundedBox>
            <RoundedBox args={[0.16, 0.14, 0.1]} radius={0.03} smoothness={2} position={[0, -0.02, 0.05]}>
                <meshStandardMaterial color={COLOR_SHELL} roughness={0.5} />
            </RoundedBox>

            {/* 로고 하우징 — 링 위에 얹힌 둥근 블록 (렌즈 링과 전면 커버를 잇는다) */}
            <RoundedBox args={[1.7, 0.8, 0.55]} radius={0.26} smoothness={4} position={[0, 0.72, -0.1]}>
                <meshStandardMaterial color={COLOR_SHELL} roughness={0.5} />
            </RoundedBox>
            <LogoDecal position={[0, 0.74, 0.18]} rotation={[0, 0, 0]} />

            {/* 전면 커버 — 이마를 덮는 큰 흰 판 (카메라 보드 · IMU). 위가 살짝 뒤로 눕는다 */}
            <RoundedBox
                args={[2.4, 1.25, 0.5]}
                radius={0.3}
                smoothness={4}
                position={[0, 1.65, -0.1]}
                rotation={[-0.12, 0, 0]}
            >
                <meshStandardMaterial color={COLOR_SHELL} roughness={0.5} />
            </RoundedBox>

            {/* 이마 쿠션 — 전면 커버 뒤에 붙은 넓은 검정 타원 쿠션 (커버와 같은 기울기) */}
            <mesh geometry={geo.foreheadPad} position={[0, 1.62, -0.44]} rotation={[-0.12, 0, 0]}>
                <meshStandardMaterial color={COLOR_STRAP} roughness={0.9} />
            </mesh>

            {/* 머리띠 — 검정 납작 밴드 (타원). 토러스를 눕히고 세로로 늘려 띠 모양으로 */}
            <mesh position={[0, HEAD_Y, HEAD_Z]} rotation={[Math.PI / 2, 0, 0]} scale={[1, HEAD_RZ / HEAD_RX, 3.2]}>
                <torusGeometry args={[HEAD_RX, 0.05, 8, 72]} />
                <meshStandardMaterial color={COLOR_STRAP} roughness={0.8} />
            </mesh>

            {/* 양옆 패드 — 관자놀이 쪽 흰 캡슐 (경첩 판 2장이 겹친 모양). 판이 머리 옆면(YZ)에 놓이게 돌린다 */}
            {[-1, 1].map((s) => (
                <group key={s} position={[s * (HEAD_RX + 0.08), HEAD_Y, HEAD_Z + 0.1]} rotation={[0, Math.PI / 2, 0]}>
                    <mesh geometry={geo.sidePad}>
                        <meshStandardMaterial color={COLOR_SHELL} roughness={0.5} />
                    </mesh>
                    <mesh geometry={geo.sidePadSmall} position={[0.35, 0, s * 0.06]}>
                        <meshStandardMaterial color={COLOR_SHELL} roughness={0.5} />
                    </mesh>
                </group>
            ))}

            {/* 뒤통수 패드(타원) + 안쪽 검정 쿠션 + 조임 다이얼 */}
            <mesh geometry={geo.rearPad} position={[0, HEAD_Y, HEAD_Z - HEAD_RZ - 0.08]}>
                <meshStandardMaterial color={COLOR_SHELL} roughness={0.5} />
            </mesh>
            <mesh geometry={geo.rearCushion} position={[0, HEAD_Y, HEAD_Z - HEAD_RZ + 0.05]}>
                <meshStandardMaterial color={COLOR_STRAP} roughness={0.9} />
            </mesh>
            <mesh position={[0, HEAD_Y, HEAD_Z - HEAD_RZ - 0.26]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.25, 0.25, 0.16, 32]} />
                <meshStandardMaterial color={COLOR_SHELL} roughness={0.35} />
            </mesh>
        </group>
    );
}

// 기준 자세(0,0,0) = 영점이 잡힌 형상. 기기 전체를 반투명으로 그려 현재 자세와 겹쳐 본다 (예전엔 렌즈 링 2개만)
function ReferenceGhost() {
    return <DeviceModel ghost />;
}

// 벽 그리드 4장 — 낮은 시점에서 모델 위쪽에도 기준선이 보이게 한다.
// 카메라와 모델 사이에 벽이 끼면 방해만 되므로, 카메라가 벽 안쪽에 있을 때(벽이 모델 뒤에 있을 때)만 그 벽을 보인다.
const WALLS = [
    { pos: [0, WALL, -WALL], rot: [Math.PI / 2, 0, 0], n: [0, 0, 1] }, // 뒤(-Z)
    { pos: [0, WALL, WALL], rot: [Math.PI / 2, 0, 0], n: [0, 0, -1] }, // 앞(+Z)
    { pos: [-WALL, WALL, 0], rot: [0, 0, Math.PI / 2], n: [1, 0, 0] }, // 왼(-X)
    { pos: [WALL, WALL, 0], rot: [0, 0, Math.PI / 2], n: [-1, 0, 0] }, // 오른(+X)
];
function ReferenceWalls() {
    const groupRefs = useRef([]);
    useFrame(({ camera }) => {
        WALLS.forEach((w, i) => {
            const g = groupRefs.current[i];
            if (!g) return;
            // (카메라 − 벽 중심) · 안쪽 법선 > 0 이면 카메라가 벽 안쪽
            const p = camera.position;
            g.visible = (p.x - w.pos[0]) * w.n[0] + (p.z - w.pos[2]) * w.n[2] > 0;
        });
    });
    return WALLS.map((w, i) => (
        <group
            key={i}
            ref={(el) => {
                groupRefs.current[i] = el;
            }}
            position={w.pos}
            rotation={w.rot}
        >
            <Grid {...GRID_PROPS} args={[WALL * 2, WALL * 2]} />
        </group>
    ));
}

function PoseDriver({ poseRef, yawZeroRef, readoutRef, staleMs, yawZero }) {
    const groupRef = useRef(null);
    const targetEuler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
    const targetQuat = useRef(new THREE.Quaternion());

    // Canvas 가 frameloop="demand" 라서 필요할 때만 렌더를 요청한다.
    // 자세값은 React 를 거치지 않고 ref 로 들어오므로, 새 값(t 변경)이나 stale 전환을 가볍게 감시해 invalidate 한다.
    const invalidate = useThree((s) => s.invalidate);
    const frameloop = useThree((s) => s.frameloop);
    const lastT = useRef(-1);
    const lastFresh = useRef(null);
    useEffect(() => {
        // paused(frameloop="never") 동안은 감시 틱도 멈춘다. 복원되면 R3F 가 frameloop 변경 시 한 번 invalidate 하고,
        // 이 effect 가 다시 시작돼 바뀐 pose.t 를 감지한다.
        if (frameloop === "never") return undefined;
        let id;
        const tick = () => {
            const pose = poseRef.current;
            const t = pose?.t ?? 0;
            const fresh = !!pose && (staleMs == null || performance.now() - t < staleMs);
            if (t !== lastT.current || fresh !== lastFresh.current) invalidate();
            id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(id);
    }, [poseRef, staleMs, invalidate, frameloop]);

    // 부모가 전달한 기준 방향이 바뀌면 렌더를 요청한다
    useEffect(() => {
        invalidate();
    }, [yawZero, invalidate]);

    useFrame((_, dt) => {
        const pose = poseRef.current;
        // staleMs 가 null 이면(녹화 재생) 일시정지 중에도 마지막 값을 유지한다
        const fresh = !!pose && (staleMs == null || performance.now() - (pose.t ?? 0) < staleMs);
        lastT.current = pose?.t ?? 0;
        lastFresh.current = fresh;

        const pitch = fresh ? pose.pitch : NaN;
        const roll = fresh ? pose.roll : NaN;

        // yaw 는 헤딩이라 절대값에 의미가 없다. 영점을 빼서 상대 변화만 보여준다.
        // 영점 = 부모가 준 yawZero(녹화 재생: 0프레임 값이라 세션마다 같다) → 없으면 첫 유효 샘플(라이브).
        if (yawZeroRef.current === null) {
            if (Number.isFinite(yawZero)) yawZeroRef.current = yawZero;
            else if (Number.isFinite(pose?.yaw)) yawZeroRef.current = pose.yaw;
        }
        const yaw = fresh ? normDeg(pose.yaw - (yawZeroRef.current ?? 0)) : NaN;

        // 구버전 파일은 pitch(cam_angel)만 있으므로 roll / yaw 가 없으면 0 으로 그린다
        if (Number.isFinite(pitch)) {
            // 회전 순서 YXZ = yaw → pitch → roll (기기 기준 내재 회전)
            // three.js 의 +X 회전은 정면(+Z)을 아래로 숙이므로 pitch 는 부호를 뒤집는다.
            targetEuler.current.set(
                -pitch * AXIS_SIGN.pitch * DEG,
                (Number.isFinite(yaw) ? yaw : 0) * AXIS_SIGN.yaw * DEG,
                -(Number.isFinite(roll) ? roll : 0) * AXIS_SIGN.roll * DEG,
            );
            targetQuat.current.setFromEuler(targetEuler.current);
        }

        // 쿼터니언 slerp — yaw 가 ±180° 를 넘을 때도 튀지 않는다.
        // 목표에 거의 닿으면 스냅해서 멈추고, 아직 멀면 다음 프레임 렌더를 이어서 요청한다.
        if (groupRef.current) {
            const q = groupRef.current.quaternion;
            q.slerp(targetQuat.current, 1 - Math.exp(-SMOOTHING * dt));
            if (q.angleTo(targetQuat.current) > 0.002) invalidate();
            else q.copy(targetQuat.current);
        }

        // 숫자 표시는 값이 바뀐 칸만 쓴다 (같은 문자열을 매 프레임 다시 쓰면 스타일 재계산·GC 만 생긴다)
        const r = readoutRef.current;
        const last = (r.__last ??= {});
        const put = (key, el, text) => {
            if (el && last[key] !== text) {
                el.textContent = text;
                last[key] = text;
            }
        };
        put("pitch", r.pitch, fmt(pitch));
        put("roll", r.roll, fmt(roll));
        put("yaw", r.yaw, fmt(yaw));
        const staleDisplay = Number.isFinite(pitch) ? "none" : "flex";
        if (r.stale && last.stale !== staleDisplay) {
            r.stale.style.display = staleDisplay;
            last.stale = staleDisplay;
        }
    });

    return (
        <group ref={groupRef} position={[0, 0.8, 0]}>
            <DeviceModel />
        </group>
    );
}

/**
 * @param {Object} props
 * @param {React.MutableRefObject<{pitch:number, roll:number, yaw:number, t:number}>} props.poseRef
 *        부모가 값을 써 넣는 ref (WebSocket 수신 또는 재생 프레임 변경 시). t = performance.now()
 * @param {number|null} [props.staleMs] 이 시간 동안 갱신이 없으면 "데이터 없음". null 이면 끄기(녹화 재생용)
 * @param {boolean} [props.compact] PiP 처럼 작게 띄울 때
 * @param {React.ReactNode} [props.headerExtra] 헤더 오른쪽 끝에 붙일 버튼 (최소화 등)
 * @param {Object} [props.headerProps] 헤더 div 에 펼칠 props (FloatingPanel 의 드래그 핸들용)
 * @param {boolean} [props.paused] true 면 렌더 루프를 완전히 멈춘다 (PiP 최소화 등 안 보일 때)
 * @param {number} [props.yawZero] yaw 영점(°). 녹화 재생이면 0프레임 yaw 를 넘겨 세션마다 같은 값이 나오게 한다. NaN 이면 첫 샘플
 */
const EMPTY_PROPS = {};

const DevicePose3D = ({
    poseRef,
    staleMs = STALE_MS,
    compact = false,
    headerExtra = null,
    headerProps = EMPTY_PROPS,
    paused = false,
    yawZero = NaN,
    className = "",
}) => {
    const controlsRef = useRef(null);

    // 저장된 시점은 마운트 때 한 번만 읽는다 (저장할 때마다 Canvas 가 리렌더되지 않게 구독하지 않음)
    const initialCam = useRef(validCam(useVariableStore.getState().POSE_CAM)).current;
    const setPoseCam = useVariableStore((s) => s.setPoseCam);

    // 마우스로 돌리기가 끝나면 시점 저장 (useCallback: drei OrbitControls 가 onEnd 가 바뀔 때마다 리스너를 다시 거므로)
    const saveCam = useCallback(() => {
        const c = controlsRef.current;
        if (!c) return;
        setPoseCam({ position: c.object.position.toArray(), target: c.target.toArray() });
    }, [setPoseCam]);
    const resetCam = useCallback(() => {
        const c = controlsRef.current;
        if (!c) return;
        c.object.position.set(...DEFAULT_CAM.position);
        c.target.set(...DEFAULT_CAM.target);
        c.update();
        setPoseCam(null);
    }, [setPoseCam]);
    const levelCam = useCallback(() => {
        const c = controlsRef.current;
        if (!c) return;
        const distance = Math.max(c.minDistance, Math.min(c.maxDistance, c.object.position.distanceTo(c.target)));
        // 정면(+Z)에 맞춰 벽 그리드의 가로·세로가 화면 축과 나란하도록 한다.
        c.object.position.copy(c.target).add(new THREE.Vector3(0, 0, distance));
        c.update();
        setPoseCam({ position: c.object.position.toArray(), target: c.target.toArray() });
    }, [setPoseCam]);
    const verticalCam = useCallback(() => {
        const c = controlsRef.current;
        if (!c) return;
        const distance = Math.max(c.minDistance, Math.min(c.maxDistance, c.object.position.distanceTo(c.target)));
        // 방위각도 0으로 고정해 바닥 그리드가 대각선으로 보이지 않게 한다.
        // 극점만 미세하게 피하는 것은 OrbitControls의 회전 안정성을 위한 것이다.
        const offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(distance, 1e-6, 0));
        c.object.position.copy(c.target).add(offset);
        c.update();
        setPoseCam({ position: c.object.position.toArray(), target: c.target.toArray() });
    }, [setPoseCam]);
    const sideCam = useCallback(() => {
        const c = controlsRef.current;
        if (!c) return;
        const distance = Math.max(c.minDistance, Math.min(c.maxDistance, c.object.position.distanceTo(c.target)));
        // 측면(+X)에서 수평으로 바라본다. 기기 자세는 바꾸지 않는다.
        c.object.position.copy(c.target).add(new THREE.Vector3(distance, 0, 0));
        c.update();
        setPoseCam({ position: c.object.position.toArray(), target: c.target.toArray() });
    }, [setPoseCam]);
    const yawZeroRef = useRef(null); // null = 아직 영점 안 잡음(yawZero 또는 첫 샘플로 자동 설정)
    const readoutRef = useRef({});

    const setReadout = (key) => (el) => {
        readoutRef.current[key] = el;
    };

    return (
        <div
            className={`relative flex flex-col h-full bg-white rounded-lg shadow border border-gray-200 overflow-hidden ${className}`}
        >
            <div
                {...headerProps}
                className={`shrink-0 flex items-center justify-between border-b border-gray-100 ${compact ? "px-2 py-1" : "px-3 py-2"}`}
            >
                <h3 className={`font-semibold text-gray-800 whitespace-nowrap ${compact ? "text-sm" : ""}`}>
                    기기 자세
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={levelCam}
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 whitespace-nowrap"
                        title="정면에서 그리드 가로·세로 정렬"
                        aria-label="정면에서 그리드 가로·세로 정렬"
                    >
                        Front
                    </button>
                    <button
                        type="button"
                        onClick={verticalCam}
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 whitespace-nowrap"
                        title="위에서 바닥 그리드 가로·세로 정렬"
                        aria-label="위에서 바닥 그리드 가로·세로 정렬"
                    >
                        Top
                    </button>
                    <button
                        type="button"
                        onClick={sideCam}
                        className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 whitespace-nowrap"
                        title="옆면에서 그리드 가로·세로 정렬"
                        aria-label="옆면에서 그리드 가로·세로 정렬"
                    >
                        Side
                    </button>
                    <button
                        onClick={resetCam}
                        className="p-1 rounded hover:bg-gray-100 text-gray-500"
                        title="시점 초기화"
                        aria-label="시점 초기화"
                    >
                        <RotateCcw className="size-3.5" />
                    </button>
                    {headerExtra}
                </div>
            </div>

            {/* compact(PiP)는 패널 크기를 따라 늘어나고, 아니면 고정 높이 */}
            <div className={`relative ${compact ? "flex-1 min-h-[7rem]" : "h-72"}`}>
                {/* demand: 자세가 바뀌거나 마우스로 돌릴 때만 그린다 (정지 자세·일시정지 중 GPU 사용 없음) */}
                <Canvas
                    camera={{ position: initialCam.position, fov: 38 }}
                    dpr={[1, 2]}
                    frameloop={paused ? "never" : "demand"}
                >
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[3, 5, 4]} intensity={1.1} />
                    <directionalLight position={[-3, 2, -2]} intensity={0.3} />

                    <group position={[0, 0.8, 0]}>
                        <ReferenceGhost />
                    </group>
                    <PoseDriver
                        poseRef={poseRef}
                        yawZeroRef={yawZeroRef}
                        readoutRef={readoutRef}
                        staleMs={staleMs}
                        yawZero={yawZero}
                    />

                    {/* 기준 그리드 — 바닥(무한) + 카메라 반대편 벽 */}
                    <Grid {...GRID_PROPS} infiniteGrid />
                    <ReferenceWalls />
                    <OrbitControls
                        ref={controlsRef}
                        target={initialCam.target}
                        enablePan={false}
                        // damping 이 켜져 있으면 손을 뗀 뒤에도 카메라가 더 움직여 onEnd 에 저장한 시점과 멈춘 시점이 달라진다
                        enableDamping={false}
                        minDistance={3}
                        maxDistance={10}
                        onEnd={saveCam}
                    />
                </Canvas>

                <div
                    ref={setReadout("stale")}
                    className="absolute inset-0 hidden items-center justify-center pointer-events-none"
                >
                    <span className="text-sm text-gray-500 bg-white/80 px-2 py-1 rounded">자세 데이터 없음</span>
                </div>
            </div>

            <div
                className={`shrink-0 grid grid-cols-3 text-center border-t border-gray-100 font-mono ${compact ? "py-1" : "py-2"}`}
            >
                <div>
                    <div className="text-xs text-gray-500 font-sans">Pitch(Chin UP/DOWN)</div>
                    <div
                        ref={setReadout("pitch")}
                        className={`${compact ? "text-sm" : "text-lg"} font-semibold text-gray-800`}
                    >
                        --
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500 font-sans">Roll(Head tilt)</div>
                    <div
                        ref={setReadout("roll")}
                        className={`${compact ? "text-sm" : "text-lg"} font-semibold text-gray-800`}
                    >
                        --
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500 font-sans">
                        Yaw(Face turn)
                    </div>
                    <div
                        ref={setReadout("yaw")}
                        className={`${compact ? "text-sm" : "text-lg"} font-semibold text-gray-800`}
                    >
                        --
                    </div>
                </div>
            </div>
            {/* 예전의 "Pitch 권장 범위 -9~0°" 안내는 pitch 별 룩업테이블 시절 것이라 뺐다 (2026-10-23).
                지금 값은 미리보기 확인 시점 영점 대비 상대값이고, 각도 계산은 R 방식이라 pitch 에 의존하지 않는다. */}
            {!compact && (
                <div className="text-[11px] text-gray-400 text-center pb-2">
                    영점(미리보기 확인 시점) 대비 변화량
                </div>
            )}
        </div>
    );
};

// 라이브 뷰 부모가 WebSocket 메시지마다 리렌더되므로 props 가 같으면 R3F 트리를 다시 재조정하지 않게 memo
export default memo(DevicePose3D);
