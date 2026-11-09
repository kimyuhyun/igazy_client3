// 환자번호·이름 입력 규칙. ZIP 파일명이 "{번호}_{이름}_{yyyy-MM-dd-HH-mm-ss}.zip" 이라
// 파일명을 다시 읽을 때(transformFileData.js, Android ZipManagerAC) 어긋나는 입력을 막는다.
//   - 번호: "_" 가 들어가면 첫 "_" 에서 번호/이름이 갈라져 번호가 잘린다.
//   - 이름: 맨 앞 "_" 는 번호 뒤 구분자와 겹쳐 이름이 비어 보인다.
//   - 이름: 날짜 형식(yyyy-MM-dd-HH-mm-ss)이 들어가면 파일명 끝의 날짜와 구분되지 않는다.
// 반환값은 에러 문구, 문제없으면 "" (입력창 아래에 그대로 보여 준다).

const TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/;

export function validatePatientNum(num) {
    const v = String(num ?? "");
    if (v.includes("_")) return "환자번호에는 _ 를 넣을 수 없습니다.";
    return "";
}

export function validatePatientName(name) {
    const v = String(name ?? "");
    if (v.startsWith("_")) return "이름은 _ 로 시작할 수 없습니다.";
    if (TIMESTAMP_RE.test(v)) return "이름에 날짜 형식(yyyy-MM-dd-HH-mm-ss)은 넣을 수 없습니다.";
    return "";
}
