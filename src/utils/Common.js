export const getAccessToken = () => {
    const token = localStorage.getItem("access_token");
    if (token && token !== "undefined") {
        return token;
    }
    return null;
};

export const getRefreshToken = () => {
    const token = localStorage.getItem("refresh_token");
    if (token && token !== "undefined") {
        return token;
    }
    return null;
};

export const removeToken = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
};

export const setToken = (accessToken, refreshToken) => {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
};

export const utilConvertToMillis = (strTime) => {
    const time = new Date(strTime).getTime() / 1000;
    const currentTime = Math.floor(new Date().getTime() / 1000);
    const inputTime = time;
    const diffTime = currentTime - inputTime;
    var postTime;
    switch (true) {
        case diffTime < 60:
            postTime = "방금";
            break;
        case diffTime < 3600:
            postTime = parseInt(diffTime / 60) + "분 전";
            break;
        case diffTime < 86400:
            postTime = parseInt(diffTime / 3600) + "시간 전";
            break;
        case diffTime < 604800:
            postTime = parseInt(diffTime / 86400) + "일 전";
            break;
        case diffTime > 604800:
            var date = new Date(time * 1000);
            var month = date.getMonth() + 1;
            var day = date.getDate();
            if (date.getMonth() + 1 < 10) {
                month = "0" + date.getMonth() + 1;
            }
            if (date.getDate() < 10) {
                day = "0" + date.getDate();
            }
            postTime = date.getFullYear() + "-" + month + "-" + day;
            break;
        default:
            postTime = time;
    }
    return postTime;
};

export const replaceAll = (str, searchStr, replaceStr) => {
    if (str === "") {
        return str;
    }
    return str.split(searchStr).join(replaceStr);
};

export const getToday = () => {
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = String(now.getMonth() + 1).padStart(2, "0");
    const todayDate = String(now.getDate()).padStart(2, "0");
    return `${todayYear}-${todayMonth}-${todayDate}`;
};

export const getTodayTime = () => {
    const now = new Date(); // 현재 날짜 및 시간
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1;
    const todayDate = now.getDate();
    const week = ["일", "월", "화", "수", "목", "금", "토"];
    const dayOfWeek = week[now.getDay()];
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return `${todayYear}년 ${todayMonth}월 ${todayDate}일 ${hours}시 ${minutes}분 ${dayOfWeek}요일`;
};

export const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};
