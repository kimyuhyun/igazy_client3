// utils/indexedDB.js
/**
 * IndexedDB 유틸리티 모듈
 * 
 * ZIP 파일 데이터를 브라우저의 IndexedDB에 저장/관리합니다.
 * 대용량 이미지 데이터를 청크 단위로 분할하여 저장하여 성능을 최적화합니다.
 * 
 * 주요 개선사항:
 * - Promise anti-pattern 제거 (async executor 제거)
 * - 중첩 트랜잭션 문제 해결 (단일 트랜잭션 사용)
 * - readonly/readwrite 트랜잭션 적절히 분리
 * - 에러 핸들링 개선
 */

import { pickEyeJson } from "./eyeMeta";

const DB_NAME = "IGazyDB";
const STORE_NAME = "zipFiles";
const CHUNK_STORE_NAME = "zipChunks"; // 청크 저장용
const DB_VERSION = 2; // 버전 업그레이드

// IndexedDB 초기화
export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 메인 파일 정보 저장소
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "filePath" });
                objectStore.createIndex("lastAccessed", "lastAccessed", { unique: false });
                objectStore.createIndex("fileName", "fileName", { unique: false });
            }

            // 이미지 청크 저장소
            if (!db.objectStoreNames.contains(CHUNK_STORE_NAME)) {
                const chunkStore = db.createObjectStore(CHUNK_STORE_NAME, { keyPath: "id" });
                chunkStore.createIndex("filePath", "filePath", { unique: false });
            }
        };
    });
};

// 저장 공간 확인
export const checkStorageQuota = async () => {
    if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        return {
            usage: estimate.usage || 0,
            quota: estimate.quota || 0,
            available: (estimate.quota || 0) - (estimate.usage || 0),
        };
    }
    // null 대신 기본값 반환
    return {
        usage: 0,
        quota: 0,
        available: 0,
    };
};

// 배열을 청크로 나누기
const chunkArray = (array, chunkSize = 50) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
};

// 사용자가 직접 넣은 ZIP 결과의 키(뷰어, 2026-11-09). 기기 경로와 섞이지 않게 항상 이 접두사를 쓴다 —
// 보기·수정·삭제가 어느 원본(브라우저 저장분 / 기기 파일)을 대상으로 하는지는 이 접두사로만 판단한다 (Codex VIEWER R1)
export const LOCAL_PREFIX = "local/";
export const isLocalPath = (p) => typeof p === "string" && p.startsWith(LOCAL_PREFIX);

// ZIP 파일 저장 (청크 방식)
export const saveZipToDB = async (filePath, fileName, zipData) => {
    const db = await initDB();

    // odImages와 osImages가 제대로 전달되었는지 확인
    if (!zipData.odImages || !zipData.osImages) {
        console.error("❌ 이미지 데이터가 없습니다!", zipData);
        throw new Error("이미지 데이터가 없습니다");
    }

    return new Promise((resolve, reject) => {
        try {

            const transaction = db.transaction([STORE_NAME, CHUNK_STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);

            // OD/OS 이미지를 청크로 나누기 (50개씩)
            const odChunks = chunkArray(zipData.odImages, 50);
            const osChunks = chunkArray(zipData.osImages, 50);

            // 청크 저장
            for (let i = 0; i < odChunks.length; i++) {
                const chunkData = {
                    id: `${filePath}_od_${i}`,
                    filePath: filePath,
                    type: "od",
                    chunkIndex: i,
                    data: odChunks[i],
                };
                chunkStore.put(chunkData);
            }

            for (let i = 0; i < osChunks.length; i++) {
                const chunkData = {
                    id: `${filePath}_os_${i}`,
                    filePath: filePath,
                    type: "os",
                    chunkIndex: i,
                    data: osChunks[i],
                };
                chunkStore.put(chunkData);
            }

            // 같은 키에 더 짧은 결과를 다시 넣으면 번호가 큰 옛 청크가 남아 공간만 차지한다 → 같은 트랜잭션에서 이번에 쓰지 않은
            // 청크를 지운다(중단되면 옛 결과가 그대로 남는다) (Codex VIEWER R8)
            const keep = new Set([
                ...odChunks.map((_, i) => `${filePath}_od_${i}`),
                ...osChunks.map((_, i) => `${filePath}_os_${i}`),
            ]);
            const staleRequest = chunkStore.index("filePath").openKeyCursor(IDBKeyRange.only(filePath));
            staleRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) return;
                if (!keep.has(cursor.primaryKey)) chunkStore.delete(cursor.primaryKey);
                cursor.continue();
            };

            // 메타데이터만 메인 스토어에 저장 (이미지 제외)
            const data = {
                filePath,
                fileName,
                zipData: {
                    patient_num: zipData.patient_num,
                    patient_name: zipData.patient_name,
                    distance: zipData.distance,
                    angle: zipData.angle,
                    limbus_px: zipData.limbus_px,
                    limbus_mm: zipData.limbus_mm,
                    // IOL Master 값 (R 방식 계산용) — 빠뜨리면 캐시로 열 때 사라진다
                    axial_length: zipData.axial_length,
                    acd: zipData.acd,
                    // 자세 영점 — 빠뜨리면 캐시로 열 때 리포트가 상대 pitch 를 절대값으로 오인한다
                    pose_ref: zipData.pose_ref ?? null,
                    // 녹화 fps (25fps 전환 2026-10-27). 빠뜨리면 캐시로 열 때 옛 15fps 로 오인해 느리게 재생된다.
                    fps: zipData.fps,
                    // 좌표 기준 폭 — 캐시로 열 때 타원·아이콘 위치 환산에 쓴다
                    frame_width: zipData.frame_width,
                    // 배열 배치 방식(frame_index 자리). 없는 캐시는 옛 방식이라 Video 가 무시하고 다시 받는다
                    layout: zipData.layout,
                    // measure | record — 빠뜨리면 캐시로 연 녹화 파일에 결과보기가 생긴다
                    mode: zipData.mode,
                    // 눈별 윤부·AL·ACD (utils/eyeMeta.js EYE_JSON_KEYS). 없는 키는 undefined 로 둔다(옛 파일 = 단일 키 폴백).
                    // 방금 ZIP 에서 읽어 넣는 것이므로 눈별 키 확인은 끝난 상태 — 다음 열기 때 불필요한 메타 재조회를 막는다
                    ...pickEyeJson(zipData),
                    eye_meta_checked: true,
                    // 사용자가 ZIP 을 직접 넣은 결과(뷰어, 2026-11-09). 서버에 원본이 없을 수 있으므로 공간 확보 때 자동으로 지우지 않는다
                    imported: zipData.imported === true,
                    // 가져온 ZIP 크기(바이트). 서버 목록에 없는 행의 크기 표시용
                    file_size: zipData.file_size,
                    od: zipData.od,
                    os: zipData.os,
                    odImageCount: zipData.odImages.length,
                    osImageCount: zipData.osImages.length,
                    odChunkCount: odChunks.length,
                    osChunkCount: osChunks.length,
                },
                lastAccessed: Date.now(),
                savedAt: Date.now(),
            };


            const request = store.put(data);

            // put.onsuccess 는 "요청이 큐에 들어갔다"일 뿐이다. 커밋 단계(쿼터 등)에서 abort 되면 "저장됨" 뒤 실제론 비어 있었다
            // (RISK 리뷰 Claude 16 / Codex R09) → 트랜잭션 완료에서 resolve, abort/error 에서 reject.
            transaction.oncomplete = () => resolve(data);
            transaction.onabort = () => {
                console.error("❌ 저장 트랜잭션 중단:", transaction.error);
                reject(transaction.error || new Error("IndexedDB transaction aborted"));
            };
            transaction.onerror = () => {
                console.error("❌ 저장 트랜잭션 오류:", transaction.error);
            };
            request.onerror = () => {
                console.error("❌ 저장 실패:", request.error);
            };
        } catch (error) {
            console.error("❌ 저장 중 에러:", error);
            reject(error);
        }
    });
};

// ZIP 파일 불러오기 (청크 방식)
export const getZipFromDB = async (filePath) => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        // 읽기 전용이므로 readonly 사용
        const transaction = db.transaction([STORE_NAME, CHUNK_STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);

        const request = store.get(filePath);

        request.onsuccess = async () => {
            const result = request.result;
            if (!result) {
                resolve(null);
                return;
            }


            try {
                // 청크 get 을 같은 트랜잭션에 한꺼번에 넣고(순차 대기 제거, ZIPSPEED) chunkIndex 자리에 조립한다.
                // 완료 순서가 아니라 번호 순서로 붙여야 영상·결과 프레임 대응이 유지된다. 빠진 청크는 손상 캐시 → 실패.
                const getChunk = (key) =>
                    new Promise((res, rej) => {
                        const r = chunkStore.get(key);
                        r.onsuccess = () => res(r.result);
                        r.onerror = () => rej(r.error);
                    });
                const odCount = result.zipData.odChunkCount || 0;
                const osCount = result.zipData.osChunkCount || 0;
                const odReqs = Array.from({ length: odCount }, (_, i) => getChunk(`${filePath}_od_${i}`));
                const osReqs = Array.from({ length: osCount }, (_, i) => getChunk(`${filePath}_os_${i}`));
                const [odChunks, osChunks] = await Promise.all([Promise.all(odReqs), Promise.all(osReqs)]);
                const assemble = (chunks, eye) => {
                    const out = [];
                    chunks.forEach((c, i) => {
                        if (!c?.data) throw new Error(`캐시 손상: ${eye} 청크 ${i} 없음`);
                        for (const img of c.data) out.push(img);
                    });
                    return out;
                };
                const odImages = assemble(odChunks, "od");
                const osImages = assemble(osChunks, "os");

                // lastAccessed 업데이트 (별도 트랜잭션으로)
                updateLastAccessed(filePath).catch(err => {
                    console.warn("Failed to update lastAccessed:", err);
                });

                resolve({
                    ...result.zipData,
                    odImages,
                    osImages,
                });
            } catch (error) {
                reject(error);
            }
        };

        request.onerror = () => reject(request.error);
    });
};

/**
 * 캐시된 ZIP의 메타데이터만 갈아끼운다 (이미지는 그대로 둔다).
 *
 * 환자정보를 수정해도 이미지는 한 바이트도 바뀌지 않는다. 예전에는 캐시를 통째로
 * 지워서 37~110MB를 다시 내려받아야 했는데, 메타만 고치면 네트워크가 필요 없다.
 *
 * 파일명이 바뀌면 키(filePath)도 바뀌므로 청크의 id/filePath까지 옮긴다
 * (이것도 브라우저 안에서만 일어나고 다운로드는 없다).
 *
 * @returns {Promise<boolean>} 캐시가 없어서 아무것도 안 했으면 false
 */
// noOverwrite: 이름을 바꿀 목적지에 다른 결과가 이미 있으면 덮어쓰지 않고 code "DEST_EXISTS" 로 실패한다(직접 넣은 결과의 이름 변경용).
// 목적지 확인과 쓰기가 같은 트랜잭션이라 두 탭이 같은 이름으로 바꿔도 한쪽 결과가 사라지지 않는다 (Codex VIEWER 재확인 2)
export const updateZipMetaInDB = async (oldFilePath, newFilePath, newFileName, meta, { noOverwrite = false } = {}) => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, CHUNK_STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);

        const getRequest = store.get(oldFilePath);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
            const row = getRequest.result;
            if (!row) {
                resolve(false);
                return;
            }

            const renamed = newFilePath !== oldFilePath;
            const next = {
                ...row,
                filePath: newFilePath,
                fileName: newFileName || row.fileName,
                zipData: { ...row.zipData, ...meta },
                lastAccessed: Date.now(),
            };

            if (!renamed) {
                store.put(next);
            } else {
                if (noOverwrite) {
                    // add 는 같은 키가 있으면 ConstraintError 로 트랜잭션 전체를 되돌린다(원본 삭제·청크 이동도 함께 취소)
                    const addRequest = store.add(next);
                    addRequest.onerror = () => {
                        if (addRequest.error?.name === "ConstraintError")
                            reject(Object.assign(new Error("destination exists"), { code: "DEST_EXISTS" }));
                    };
                } else {
                    store.put(next);
                }
                store.delete(oldFilePath);
                // 청크 id는 `${filePath}_od_0` 꼴이라 이름이 바뀌면 같이 옮겨야 한다
                const cursorRequest = chunkStore.index("filePath").openCursor(IDBKeyRange.only(oldFilePath));
                cursorRequest.onerror = () => reject(cursorRequest.error);
                cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (!cursor) return;
                    const chunk = cursor.value;
                    chunkStore.delete(chunk.id);
                    chunkStore.put({
                        ...chunk,
                        id: `${newFilePath}_${chunk.type}_${chunk.chunkIndex}`,
                        filePath: newFilePath,
                    });
                    cursor.continue();
                };
            }

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
        };
    });
};

// lastAccessed 타임스탬프 업데이트 (별도 함수)
const updateLastAccessed = async (filePath) => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        const getRequest = store.get(filePath);

        getRequest.onsuccess = () => {
            const result = getRequest.result;
            if (result) {
                result.lastAccessed = Date.now();
                const putRequest = store.put(result);
                putRequest.onsuccess = () => resolve(true);
                putRequest.onerror = () => reject(putRequest.error);
            } else {
                resolve(false);
            }
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
};

// 모든 저장된 ZIP 목록
export const getAllZipsFromDB = async () => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);

        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// 특정 ZIP 파일 삭제 (청크 포함)
export const deleteZipFromDB = async (filePath) => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, CHUNK_STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);
        const chunkIndex = chunkStore.index("filePath");

        // 메인 데이터 삭제
        store.delete(filePath);

        // 관련 청크들 삭제
        const chunkRequest = chunkIndex.openCursor(IDBKeyRange.only(filePath));

        chunkRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                resolve(true);
            }
        };

        chunkRequest.onerror = () => reject(chunkRequest.error);
    });
};

// 모든 캐시 삭제
export const clearAllCache = async () => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, CHUNK_STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);

        const request1 = store.clear();
        const request2 = chunkStore.clear();

        let completed = 0;
        const checkComplete = () => {
            completed++;
            if (completed === 2) resolve(true);
        };

        request1.onsuccess = checkComplete;
        request2.onsuccess = checkComplete;
        request1.onerror = () => reject(request1.error);
        request2.onerror = () => reject(request2.error);
    });
};

// 오래된 파일 정리 (LRU 방식)
export const cleanupOldFiles = async (keepCount = 10) => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("lastAccessed");

        const request = index.openCursor();
        const items = [];

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                // 직접 넣은 결과(imported)는 자동 정리 대상이 아니다 — 지우는 건 사람이 고른다
                if (cursor.value.zipData?.imported !== true) {
                    items.push({
                        filePath: cursor.value.filePath,
                        lastAccessed: cursor.value.lastAccessed,
                    });
                }
                cursor.continue();
            } else {
                // lastAccessed 기준 정렬 (오래된 것부터)
                items.sort((a, b) => a.lastAccessed - b.lastAccessed);

                // 오래된 파일 삭제
                const toDelete = items.slice(0, Math.max(0, items.length - keepCount));
                const deletePromises = toDelete.map((item) => deleteZipFromDB(item.filePath));

                Promise.all(deletePromises)
                    .then(() => resolve(toDelete.length))
                    .catch(reject);
            }
        };

        request.onerror = () => reject(request.error);
    });
};

// 전체 용량 계산
export const calculateTotalSize = async () => {
    const allZips = await getAllZipsFromDB();
    const db = await initDB();

    return new Promise((resolve, reject) => {
        // 모든 청크를 하나의 트랜잭션으로 읽기
        const transaction = db.transaction([CHUNK_STORE_NAME], "readonly");
        const chunkStore = transaction.objectStore(CHUNK_STORE_NAME);

        let totalSize = 0;
        let pendingRequests = 0;

        // 모든 ZIP 파일의 청크 크기 계산
        for (const zip of allZips) {
            const filePath = zip.filePath;
            const odChunkCount = zip.zipData?.odChunkCount || 0;
            const osChunkCount = zip.zipData?.osChunkCount || 0;

            // OD 청크들
            for (let i = 0; i < odChunkCount; i++) {
                pendingRequests++;
                const request = chunkStore.get(`${filePath}_od_${i}`);

                request.onsuccess = () => {
                    if (request.result?.data) {
                        totalSize += request.result.data.reduce((sum, base64) => sum + (base64?.length || 0), 0);
                    }
                    pendingRequests--;
                    if (pendingRequests === 0) {
                        resolve(totalSize);
                    }
                };

                request.onerror = () => {
                    console.error("Error reading chunk:", request.error);
                    pendingRequests--;
                    if (pendingRequests === 0) {
                        resolve(totalSize);
                    }
                };
            }

            // OS 청크들
            for (let i = 0; i < osChunkCount; i++) {
                pendingRequests++;
                const request = chunkStore.get(`${filePath}_os_${i}`);

                request.onsuccess = () => {
                    if (request.result?.data) {
                        totalSize += request.result.data.reduce((sum, base64) => sum + (base64?.length || 0), 0);
                    }
                    pendingRequests--;
                    if (pendingRequests === 0) {
                        resolve(totalSize);
                    }
                };

                request.onerror = () => {
                    console.error("Error reading chunk:", request.error);
                    pendingRequests--;
                    if (pendingRequests === 0) {
                        resolve(totalSize);
                    }
                };
            }
        }

        // 청크가 없는 경우 즉시 반환
        if (pendingRequests === 0) {
            resolve(0);
        }

        transaction.onerror = () => reject(transaction.error);
    });
};

// 특정 파일이 DB에 있는지 확인
export const isZipInDB = async (filePath) => {
    const zip = await getZipFromDB(filePath);
    return zip !== null;
};
