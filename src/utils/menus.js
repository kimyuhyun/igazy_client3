// hidden: true 인 항목은 숨김. URL 에 ?token=kkyyhh 가 한 번이라도 들어오면 그 탭이 닫힐 때까지 보인다 (Layout.jsx, 2026-10-28).
export const DEV_MENU_TOKEN = "kkyyhh";
export const DEV_MENU_KEY = "igazy_dev_menu"; // sessionStorage 키

/** URL 쿼리의 token 을 확인해 sessionStorage 에 기억하고, 숨김 메뉴를 보여줄지 돌려준다 */
export const devMenuVisible = () => {
    try {
        const token = new URLSearchParams(window.location.search).get("token");
        if (token === DEV_MENU_TOKEN) sessionStorage.setItem(DEV_MENU_KEY, "1");
        return sessionStorage.getItem(DEV_MENU_KEY) === "1";
    } catch {
        return false;
    }
};

const menu = [
    {
        link: "/",
    },
    {
        icon: "ruler",
        title: "측정",
        link: "/measure",
    },
    {
        icon: "play",
        title: "영상",
        link: "/video",
    },
    {
        icon: "settings",
        title: "설정",
        link: "/config",
    },
    {
        icon: "camera",
        title: "모션 설정",
        hidden: true,
        link: "/motion_config",
    },
    {
        icon: "",
        title: "X축 캘리브레이션",
        hidden: true,
        link: "/x_axis_cali",
    },
    {
        icon: "",
        title: "측정 테스트",
        hidden: true,
        link: "/kyh_test",
    },
    {
        icon: "",
        title: "윤부지름수동측정",
        hidden: true,
        link: "/limbus_test",
    },
];
export default menu;
