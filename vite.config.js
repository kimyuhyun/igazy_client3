// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig(({ command }) => ({
    // GitHub Pages 는 /igazy_client3/ 아래에서 서비스된다. 로컬 개발은 그대로 /
    base: command === "build" ? "/igazy_client3/" : "/",
    plugins: [react()],
    build: {
        outDir: "./dist",
        rollupOptions: {
            output: {
                // three.js 와 R3F 는 거의 바뀌지 않으므로 별도 청크로 떼어 둔다.
                // 같이 묶어 두면 DevicePose3D.jsx 를 한 줄만 고쳐도 해시가 바뀌어 ~1MB 를 다시 받게 된다.
                // 객체형({ r3f: [...] })은 그 패키지의 의존성(앱도 쓰는 zustand 등)까지 끌어가서
                // index 가 r3f 청크를 정적으로 import 하게 된다. 함수형으로 지정한 패키지만 분리한다.
                manualChunks(id) {
                    // 모든 청크가 공유하는 기반(react · zustand · rollup commonjs 헬퍼)을 먼저 vendor 로 묶는다.
                    // 안 묶어 두면 rollup 이 이것들을 r3f 청크에 넣어 버려 index 까지 r3f 를 정적으로 import 하게 된다.
                    // 가상 모듈(\0 로 시작: commonjs 헬퍼, vite preload 헬퍼 등)도 공용이므로 vendor 로
                    if (id.startsWith("\0") || id.includes("commonjsHelpers") || id.includes("vite/preload-helper"))
                        return "vendor";
                    if (!id.includes("node_modules")) return undefined;
                    if (/node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store)\//.test(id)) return "vendor";
                    if (/node_modules\/three\//.test(id)) return "three";
                    if (
                        /node_modules\/(@react-three|three-stdlib|react-reconciler|its-fine|suspend-react|maath|@use-gesture|react-use-measure|tunnel-rat|camera-controls|detect-gpu|stats-gl|meshline|three-mesh-bvh|troika-three-text|troika-worker-utils|troika-three-utils|webgl-sdf-generator|bidi-js|hls\.js|glsl-noise|@mediapipe|@monogrid|utility-types|scheduler)\//.test(
                            id,
                        )
                    )
                        return "r3f";
                    return undefined;
                },
            },
        },
    },
    css: {
        postcss: {
            plugins: [tailwindcss(), autoprefixer()],
        },
    },
}));
