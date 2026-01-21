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

            request.onsuccess = () => {
                resolve(data);
            };
            request.onerror = () => {
                console.error("❌ 저장 실패:", request.error);
                reject(request.error);
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
                // 청크에서 이미지 불러오기
                const odImages = [];
                const osImages = [];

                // OD 이미지 청크 불러오기
                for (let i = 0; i < result.zipData.odChunkCount; i++) {
                    const chunk = await new Promise((res, rej) => {
                        const chunkRequest = chunkStore.get(`${filePath}_od_${i}`);
                        chunkRequest.onsuccess = () => res(chunkRequest.result);
                        chunkRequest.onerror = () => rej(chunkRequest.error);
                    });

                    if (chunk?.data) {
                        odImages.push(...chunk.data);
                    }
                }

                // OS 이미지 청크 불러오기
                for (let i = 0; i < result.zipData.osChunkCount; i++) {
                    const chunk = await new Promise((res, rej) => {
                        const chunkRequest = chunkStore.get(`${filePath}_os_${i}`);
                        chunkRequest.onsuccess = () => res(chunkRequest.result);
                        chunkRequest.onerror = () => rej(chunkRequest.error);
                    });

                    if (chunk?.data) {
                        osImages.push(...chunk.data);
                    }
                }

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
                items.push({
                    filePath: cursor.value.filePath,
                    lastAccessed: cursor.value.lastAccessed,
                });
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
