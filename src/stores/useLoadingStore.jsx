// stores/useLoadingStore.js
import { create } from "zustand";

const useLoadingStore = create((set) => ({
    isLoading: false,
    setLoading: (val) => set({ isLoading: val }),
}));

export default useLoadingStore;
