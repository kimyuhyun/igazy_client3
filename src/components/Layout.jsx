import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
    LogOut,
    Moon,
    Sun,
    User,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    UserCircle,
    Code,
    LayoutDashboard,
    BarChart,
    Ruler,
    Settings,
    Play,
} from "lucide-react";
import menu from "../utils/Menus";
import useVariableStore from "../stores/useVariableStore";

const iconMap = {
    ruler: Ruler,
    play: Play,
    settings: Settings,
};

export default function Layout({ children }) {
    const { isGlobalSideBarOpen, setGlobalSideBarOpen } = useVariableStore();
    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
    const [profileOpen, setProfileOpen] = useState(false);
    const [currentMenuName, setCurrentMenuName] = useState("");
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        console.log("useEffect 1");
        document.body.style.overflow = !isDesktop && sidebarOpen ? "hidden" : "";
        setSidebarOpen(isGlobalSideBarOpen);
    }, [sidebarOpen, isDesktop]);

    useEffect(() => {
        console.log("useEffect 2");

        // const storedTheme = localStorage.getItem("theme");
        // if (storedTheme === "dark") {
        //     setIsDarkMode(true);
        //     document.documentElement.classList.add("dark");
        // } else if (storedTheme === "light") {
        //     setIsDarkMode(false);
        //     document.documentElement.classList.remove("dark");
        // } else {
        //     const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        //     setIsDarkMode(systemPrefersDark);
        //     document.documentElement.classList.toggle("dark", systemPrefersDark);
        // }
        setIsDarkMode(false);

        const handleResize = () => {
            const isNowDesktop = window.innerWidth >= 768;
            setIsDesktop(isNowDesktop);
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        console.log("useEffect 3");

        const activeMenu = menu.find((item) => item.link === location.pathname);
        if (activeMenu) {
            setCurrentMenuName(activeMenu.title);
        } else {
            setCurrentMenuName("");
        }
    }, [location.pathname]);

    const toggleSidebar = () => {
        if (sidebarOpen) {
            setSidebarOpen(false);
            setGlobalSideBarOpen(false);
        } else {
            setSidebarOpen(true);
            setGlobalSideBarOpen(true);
        }
    };

    const toggleDarkMode = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        localStorage.setItem("theme", newMode ? "dark" : "light");
        document.documentElement.classList.toggle("dark", newMode);
    };

    return (
        <div className="flex min-h-screen bg-gray-50 dark:bg-stone-900 relative overflow-x-hidden">
            {!isDesktop && sidebarOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-20" onClick={toggleSidebar}></div>
            )}

            <aside
                className={`
                    fixed inset-y-0 left-0 z-30 w-64 bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out delay-75
                    ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
                `}
            >
                <div className="flex items-center justify-between py-3 h-[53px]">
                    <h2 className="ml-4 text-lg font-black italic text-white">
                        {/* <Link to={`/`}>IGazy client3</Link> */}
                        IGazy client3
                    </h2>
                    <button
                        className="mr-2 flex items-center justify-center size-8 text-white hover:bg-white hover:text-black rounded"
                        onClick={toggleSidebar}
                    >
                        <ChevronLeft />
                    </button>
                </div>
                <nav className="flex flex-col gap-2 p-4">
                    {menu
                        .filter((item) => item.link !== "/") // "/" 링크인 항목 제외
                        .map((item, i) => {
                            const IconComponent = iconMap[item.icon] || LayoutDashboard;
                            // const isActive = location.pathname === item.link;
                            // "/" 경로일 때는 측정("/measure") 메뉴를 활성화
                            const isActive =
                                location.pathname === item.link ||
                                (location.pathname === "/" && item.link === "/measure");

                            return (
                                <div key={i}>
                                    <Link
                                        to={item.link}
                                        className={`
                                            w-full flex items-center justify-between px-3 py-2 font-semibold rounded transition 
                                            hover:bg-white hover:text-blue-800
                                            ${isActive ? "bg-white text-blue-800" : "text-gray-200"}
                                        `}
                                    >
                                        <h1 className="flex items-center gap-4">
                                            <IconComponent className="size-4" />
                                            {item.title}
                                        </h1>
                                        <ChevronRight className="size-4" />
                                    </Link>
                                </div>
                            );
                        })}
                </nav>
            </aside>

            <div
                className={`flex-1 flex flex-col transition-all duration-300 overflow-x-hidden ${isDesktop && sidebarOpen ? "ml-64" : "ml-0"
                    }`}
            >
                <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between md:justify-between gap-4 px-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800 h-[53px]">
                    <div className="flex items-center">
                        <button
                            className="mr-2 flex items-center justify-center size-8 text-black hover:bg-gray-200 rounded"
                            onClick={toggleSidebar}
                        >
                            <ChevronRight className="dark:text-white dark:hover:text-gray-600" />
                        </button>

                        <div
                            className={`
                                text-lg font-semibold text-gray-800 dark:text-white hidden md:block
                                transition-all
                                ${isDesktop && sidebarOpen ? `ml-[220px]` : `ml-0`}
                            `}
                        >
                            {currentMenuName}
                        </div>
                    </div>

                    {/* <div className="flex items-center gap-3 relative">
                        <button onClick={toggleDarkMode}>
                            {isDarkMode ? (
                                <Sun className="w-6 h-6 text-yellow-400" />
                            ) : (
                                <Moon className="w-6 h-6 text-gray-700 dark:text-white" />
                            )}
                        </button>
                    </div> */}
                </header>

                <main className="p-4 mt-[53px]">{children}</main>
            </div>
        </div>
    );
}
