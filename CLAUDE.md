# CLAUDE.md - iGazy Client 3.0

## Project Overview

iGazy Client 3.0은 사시(strabismus) 측정을 위한 안과용 눈 추적 애플리케이션입니다. 실시간 비디오 처리, 동공 추적, 데이터 시각화 및 리포트 생성 기능을 제공합니다.

## Tech Stack

- **Build Tool**: Vite 7.2.4
- **Framework**: React 19.2.0
- **Routing**: React Router v7.6.2
- **State Management**: Zustand 5.0.6 (localStorage persistence)
- **Styling**: Tailwind CSS 3.4.1
- **Charts**: Chart.js 4.5.1 + React-Chartjs-2
- **HTTP Client**: Axios 1.10.0
- **File Processing**: JSZip 3.10.1

## Project Structure

```
src/
├── main.jsx              # 앱 진입점
├── App.jsx               # 라우터 설정 (basename: /igazy_client3)
├── components/           # 재사용 가능한 UI 컴포넌트
│   ├── DualDetectorFrame.jsx   # 실시간 WebSocket 프레임 캡처
│   ├── DualLiveFrame.jsx       # 라이브 프레임 미리보기
│   ├── DualImagePlayer.jsx     # 저장된 비디오 재생
│   ├── LiveGraph.jsx           # 차트 시각화 (X/Y 축)
│   ├── Layout.jsx              # 메인 레이아웃 + 사이드바
│   ├── Popup.jsx               # 모달 다이얼로그
│   └── ...
├── pages/                # 페이지 컴포넌트
│   ├── Measure.jsx       # 메인 측정 인터페이스
│   ├── Video.jsx         # 비디오 파일 관리
│   ├── Config.jsx        # 시스템 설정 (IP, MAX_FRAME)
│   ├── PDReport.jsx      # PD 리포트 생성
│   └── LimbusTest.jsx    # 수동 캘리브레이션
├── stores/               # Zustand 상태 관리
│   ├── useLoadingStore.js     # 로딩 상태
│   ├── useVariableStore.js    # 전역 설정 (IP, 환자 정보 등)
│   └── useMyTableStore.js     # 캘리브레이션 테이블
└── utils/                # 유틸리티 함수
    ├── EyeWsClient.js         # WebSocket 클라이언트
    ├── indexedDB.js           # IndexedDB 캐시 관리
    ├── ChartDataProcessor.js  # 데이터 스무딩/보간
    ├── hideRegionAnalyzer.js  # 눈 깜빡임 감지
    └── Common.js              # 토큰 및 유틸리티
```

## Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Measure | 기본 랜딩 (측정 페이지) |
| `/measure` | Measure | 눈 사시 측정 |
| `/video` | Video | 비디오 파일 관리 |
| `/config` | Config | 시스템 설정 |
| `/pd_report` | PDReport | PD 리포트 |
| `/limbus_test` | LimbusTest | Limbus 직경 테스트 |

## Key Commands

```bash
npm run dev      # 개발 서버 시작
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 미리보기
npm run lint     # ESLint 실행
```

## API Endpoints

백엔드 서버: `http://{IP}:8080`

- `GET /api/live` - 라이브 프레임 스트림 시작
- `GET /api/pupil` - 동공 감지 스트림 시작
- `GET /api/stop` - 스트림 중지
- `GET /api/save` - 결과 저장 (쿼리 파라미터로 환자 정보)
- `GET /api/save/progress` - 저장 진행률 폴링
- `GET /api/zip/list` - 저장된 ZIP 파일 목록
- `GET /api/zip/download` - ZIP 파일 다운로드

WebSocket 서버: `ws://{IP}:3000`
- 실시간 프레임 데이터 수신 (frameIndex, frameBase64, eye, x, y, isHide)

## State Management

**useVariableStore** (persistent):
- `IP`: 디바이스 IP 주소
- `MAX_FRAME`: 최대 비디오 프레임
- `LIMBUS_MM/PX`: Limbus 캘리브레이션 값
- `PATIENT_NAME/NUM`: 환자 정보
- `DISTANCE/ANGLE`: 측정 결과

## Data Flow

1. 디바이스 → 백엔드 서버 (8080) → WebSocket (3000)
2. `EyeWsClient` → `DualDetectorFrame` (캔버스 렌더링)
3. 프레임 데이터 → `ChartDataProcessor` (스무딩)
4. `LiveGraph` (시각화) → `PDReport` (리포트)
5. 결과 → IndexedDB/ZIP 저장

## Important Patterns

- **ForwardRef**: DualDetectorFrame, DualImagePlayer에서 프레임 제어용 imperative handle
- **IndexedDB Chunking**: 이미지 50개 단위로 청크 저장
- **Moving Average**: 25프레임 윈도우로 데이터 스무딩
- **WebSocket Pub-Sub**: onLive, onPupil, onStatus 등 이벤트 리스너

## Eye Data Constants

- `LEFT = 0` (OS - 왼쪽 눈)
- `RIGHT = 1` (OD - 오른쪽 눈)
- `X_AXIS = 0`, `Y_AXIS = 1`

## ZIP File Structure

```
{filename}.zip
├── results.json         # 메타데이터 + 측정 배열
├── od/*.jpg            # OD(오른쪽 눈) 이미지
└── os/*.jpg            # OS(왼쪽 눈) 이미지
```

## Deployment

GitHub Pages 배포용으로 설정됨:
- basename: `/`
- 빌드 출력: `./dist`
