// 셔터 플래그 읽기 (2026-11-02). 값의 뜻은 "그 눈이 보임"(셔터 열림) — true = 보임, false = 가려짐.
// 안드로이드는 results.json 에 `is_visible`, WebSocket 에 `isVisible` 로 보낸다. 예전 파일·예전 APK 는 같은 값을
// 반대 이름 `is_hide` / `isHide` 로 담았으므로 둘 다 읽는다. 쓰는 쪽은 새 이름만 쓴다.

/** results.json 프레임 객체(또는 React 가 만든 같은 꼴) → true/false, 키가 없으면 undefined */
export const isEyeVisible = (r) => (r == null ? undefined : (r.is_visible ?? r.is_hide));

/** WebSocket 프레임 메시지 → true/false, 키가 없으면 undefined */
export const wsEyeVisible = (data) => (data == null ? undefined : (data.isVisible ?? data.isHide));
