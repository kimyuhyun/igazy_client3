// ZIP 파일명 "{환자번호}_{이름}_{yyyy-MM-dd-HH-mm-ss}.zip" 을 목록 행으로 바꾼다.
// 날짜는 끝에서 정규식으로 뽑는다. 예전에는 "_" 로 쪼개 세 번째 조각을 날짜로 썼는데,
// 이름에 "_" 가 들어가면("임시저장2_3") 날짜가 "N/A" 가 되고 정렬도 맨 뒤로 밀렸다 (2026-10-22).
// Android ZipManagerAC 도 같은 정규식으로 끝에서 날짜를 읽는다.
const TIMESTAMP_RE = /_(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.zip$/i;

export function transformFileData(files, formatFileSize) {
    const arr = files.map((o) => {
        const fileName = o.fileName;
        const m = fileName.match(TIMESTAMP_RE);
        // 날짜 앞부분만 "{번호}_{이름}" 으로 본다. 이름 안의 "_" 는 그대로 둔다.
        const head = m ? fileName.slice(0, m.index) : fileName.replace(/\.zip$/i, "");
        const sep = head.indexOf("_");
        const num = sep >= 0 ? head.slice(0, sep) : head;
        const name1 = sep >= 0 ? head.slice(sep + 1) : "";

        return {
            num: num || "N/A",
            name1: name1 || "N/A",
            fileName,
            fileSize: formatFileSize ? formatFileSize(o.fileSize) : o.fileSize,
            fileSizeBytes: typeof o.fileSize === "number" ? o.fileSize : 0, // 정렬용 원값 (캐시 목록은 0)
            filePath: o.filePath,
            date: m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : "N/A",
            timestamp: m ? `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}` : "0",
        };
    });

    arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return arr;
}
