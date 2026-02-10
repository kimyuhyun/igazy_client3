export function transformFileData(files, formatFileSize) {
    const arr = files.map((o) => {
        const fileName = o.fileName;
        const tmp = fileName.split("_");
        const date = tmp[2]?.split("-") || [];

        return {
            num: tmp[0] || "N/A",
            name1: tmp[1] || "N/A",
            fileName,
            fileSize: formatFileSize ? formatFileSize(o.fileSize) : o.fileSize,
            filePath: o.filePath,
            date: date.length >= 5 ? `${date[0]}-${date[1]}-${date[2]} ${date[3]}:${date[4]}` : "N/A",
            timestamp: date.length >= 5 ? `${date[0]}${date[1]}${date[2]}${date[3]}${date[4]}` : "0",
        };
    });

    arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return arr;
}
