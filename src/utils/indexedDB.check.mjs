// updateZipMetaInDB 자체 검사
// 실행: fake-indexeddb가 있는 디렉터리로 복사해서 `node indexedDB.check.mjs`
//       (mkdir /tmp/t && cd /tmp/t && npm i fake-indexeddb && cp <이 파일> . && node indexedDB.check.mjs): 이미지 청크가 살아남고 메타만 바뀌는지, 이름 변경 시 키가 옮겨지는지
import "fake-indexeddb/auto";
import assert from "node:assert";
const m = await import("/Users/hongkim/reactjs/igazy_client_3/src/utils/indexedDB.js");
const { saveZipToDB, getZipFromDB, updateZipMetaInDB, getAllZipsFromDB } = m;

const OLD = "file:///x/3333_a_2026-01-01.zip";
const NEW = "file:///x/8888_b_2026-01-01.zip";
const img = (n) => Array.from({ length: n }, (_, i) => `img${i}`);   // 청크(50개) 여러 개 되게

await saveZipToDB(OLD, "3333_a_2026-01-01.zip", {
    patient_num: "3333", patient_name: "a", limbus_mm: "12.12", limbus_px: "300.0",
    axial_length: "24.0", acd: "3.6", od: [1, 2], os: [3, 4],
    odImages: img(120), osImages: img(120),
});

let z = await getZipFromDB(OLD);
assert.equal(z.odImages.length, 120, "저장 직후 od 이미지");
assert.equal(z.axial_length, "24.0", "saveZipToDB가 AL을 보존해야 한다");

// 1) 이름 그대로 — 메타만 갱신
assert.equal(await updateZipMetaInDB(OLD, OLD, "3333_a_2026-01-01.zip",
    { axial_length: "25.5", acd: "3.1" }), true);
z = await getZipFromDB(OLD);
assert.equal(z.axial_length, "25.5"); assert.equal(z.acd, "3.1");
assert.equal(z.odImages.length, 120, "이미지가 유지돼야 한다");
assert.equal(z.osImages.length, 120);
assert.equal(z.patient_num, "3333", "안 건드린 필드는 그대로");
console.log("  1) 이름 동일: 메타 갱신 + 이미지 240장 유지 OK");

// 2) 이름 변경 — 키와 청크가 옮겨져야 한다
assert.equal(await updateZipMetaInDB(OLD, NEW, "8888_b_2026-01-01.zip",
    { patient_num: "8888", patient_name: "b" }), true);
assert.equal(await getZipFromDB(OLD), null, "옛 키는 사라져야 한다");
z = await getZipFromDB(NEW);
assert.ok(z, "새 키로 읽혀야 한다");
assert.equal(z.odImages.length, 120, "이름 변경 후에도 이미지 유지");
assert.equal(z.osImages.length, 120);
assert.equal(z.odImages[119], "img119", "청크 순서 유지");
assert.equal(z.patient_num, "8888");
assert.equal(z.axial_length, "25.5", "이전 수정값 유지");
const rows = await getAllZipsFromDB();
assert.equal(rows.length, 1, "레코드가 중복되지 않아야 한다");
assert.equal(rows[0].fileName, "8888_b_2026-01-01.zip");
console.log("  2) 이름 변경: 키·청크 이동, 이미지 240장 유지, 레코드 1개 OK");

// 3) 캐시에 없는 파일 → false
assert.equal(await updateZipMetaInDB("file:///x/none.zip", "file:///x/none.zip", "none.zip", {}), false);
console.log("  3) 캐시 없음 → false OK");
// 4) fileName을 null로 넘겨도 기존 이름이 유지돼야 한다 (AL/ACD 백필 경로)
assert.equal(await updateZipMetaInDB(NEW, NEW, null, { axial_length: "21.0", acd: "2.9" }), true);
const r2 = (await getAllZipsFromDB())[0];
assert.equal(r2.fileName, "8888_b_2026-01-01.zip", "fileName 유지");
const z4 = await getZipFromDB(NEW);
assert.equal(z4.axial_length, "21.0"); assert.equal(z4.acd, "2.9");
assert.equal(z4.odImages.length, 120, "백필 후에도 이미지 유지");
console.log("  4) fileName null 백필: 이름 유지 + AL/ACD 갱신 OK");
console.log("전부 통과");
