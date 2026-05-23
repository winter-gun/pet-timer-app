# Tauri 마이그레이션 계획서

작성일: 2026-05-23

## 왜 Tauri인가

현재 Electron + Win11 환경에서 **펫 윈도우의 투명 배경**이 불안정합니다 (`electron/main.ts` 상단 주석 참고 — DWM 가속, occlusion detection 우회 등 여러 해킹이 누적). Tauri는 Windows에서 WebView2를 사용하므로 시스템 컴포지터와 더 자연스럽게 호환되며, 투명 윈도우가 더 안정적입니다.

부수 효과:
- 번들 크기: ~150MB (Electron) → ~10MB (Tauri)
- 메모리 사용량: ~200MB → ~80MB
- 콜드 스타트 빠름

## 가장 큰 리스크: Firebase Auth

**Tauri WebView2에는 Electron의 `BrowserWindow` 같은 팝업 OAuth가 작동하지 않습니다.**

현재 코드 (`authStore.ts`): `signInWithPopup(auth, provider)` — Electron에서만 동작.

Tauri에서의 옵션:
1. **외부 브라우저 OAuth (권장)**
   - 시스템 기본 브라우저에서 OAuth 페이지 열기
   - `tauri-plugin-deep-link`로 결과를 앱으로 리디렉트 (예: `pettimer://auth/callback?code=...`)
   - Firebase의 `signInWithCustomToken` 또는 ID 토큰으로 로그인 완료
   - Google Cloud Console에서 데스크톱 OAuth client + 리디렉트 URI 추가 등록 필요
2. **Tauri WebView 내부 OAuth**
   - `signInWithRedirect` 시도 — WebView2의 쿠키 정책상 종종 실패
   - 권장하지 않음
3. **자체 백엔드 프록시**
   - 별도 OAuth 서버 운영 — 가장 무거움

선택: **옵션 1 (외부 브라우저 + deep link)**. 1~2일 소요.

## 마이그레이션 단계 (총 8~12일 추정)

### Phase 1 — 환경 구축 (1일)
- Rust toolchain + Tauri CLI 설치
- `npm create tauri-app` 으로 새 디렉토리 또는 동일 repo에 `src-tauri/` 추가
- 기존 Vite 빌드를 Tauri가 소비하도록 `tauri.conf.json` 설정
- `npm run tauri dev` 첫 실행 확인

### Phase 2 — 윈도우 구성 이식 (1~2일)
- `tauri.conf.json`의 `windows` 배열로 main + pet 두 윈도우 정의
- Pet 윈도우 옵션: `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true`
- 위치/크기 영속화: `tauri-plugin-store`로 교체 (electron-store 호환 API)
- Tray: `tauri-plugin-positioner` + `SystemTray` API

### Phase 3 — IPC 교체 (2일)
- `electron/preload.ts`의 `electronAPI`를 Tauri의 `invoke` + `emit`/`listen`로 1:1 매핑
- 주요 채널:
  - `main:show / main:hide` → Rust 커맨드 `show_main / hide_main`
  - `store:get / store:set` → `tauri-plugin-store` 직접 호출 (또는 래퍼)
  - `store:sync` (브로드캐스트) → `app.emit_all('store:broadcast', payload)`
  - `tray:showContextMenu` → tray 메뉴 빌더 호출
- `src/shared/electron.d.ts`를 Tauri 등가물로 교체. 함수 시그니처는 그대로 유지해서 호출부 변경 최소화

### Phase 4 — Firebase Auth 재구성 (1~2일)
- `tauri-plugin-deep-link` 추가
- Google OAuth 데스크톱 클라이언트 발급 + 리디렉트 URI 등록
- `signInGoogle` 구현 변경: 시스템 브라우저로 인증 URL 열기 → deep link 수신 → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential`
- Anonymous 로그인은 변경 불필요
- 계정 연결(`linkWithPopup`)도 같은 패턴으로 재구현

### Phase 5 — Pet 윈도우 투명도 검증 (0.5일)
- 가장 중요한 검증 포인트. Tauri 기본 transparent 동작 확인
- 필요 시 `composition-color` 등 옵션 조정
- 드래그 영역(`data-tauri-drag-region` 또는 CSS `app-region: drag`) 적용

### Phase 6 — 빌드 + 패키징 (1~2일)
- `electron-builder` → `tauri-builder`
- NSIS 설치 마법사 옵션 매핑
- 코드 사이닝 (필요 시)
- 자동 업데이트: `tauri-plugin-updater` (현재의 electron-updater 대체)

### Phase 7 — QA + 폴리시 (1~2일)
- 멀티 모니터, DPI 스케일, 절전 모드, 자동 시작 등 회귀 테스트
- 알림음, 트레이 메뉴, 컨텍스트 메뉴, 단축키 모두 확인
- 첫 사용자 마이그레이션 경로 (electron-store → tauri-store 데이터 이전 스크립트)

## 마이그레이션을 시작하기 전 결정해야 할 것

1. **새 브랜치 vs 새 레포** — 기존 `main`은 Electron 유지, `tauri/main` 브랜치에서 작업하는 게 안전합니다. 사용자가 이미 설치한 Electron 버전과 충돌 없이 점진적으로 전환 가능
2. **데이터 이전** — `electron-store`의 JSON 파일과 Tauri store의 위치/포맷이 다름. 첫 실행 시 마이그레이션 코드 필요
3. **자동 업데이트 채널** — Electron 빌드 사용자가 Tauri 빌드로 어떻게 넘어갈지. 큰 결정.

## 예상 작업량 요약

| 단계 | 일수 |
|------|------|
| Phase 1 — 환경 | 1일 |
| Phase 2 — 윈도우 | 1~2일 |
| Phase 3 — IPC | 2일 |
| Phase 4 — Firebase Auth | 1~2일 |
| Phase 5 — 투명도 | 0.5일 |
| Phase 6 — 빌드 | 1~2일 |
| Phase 7 — QA | 1~2일 |
| **합계** | **8~12일** |

## 권장 진행 방식

1. **Phase 1~2를 PoC로 먼저 진행** — 별도 폴더에서 Tauri 빈 프로젝트 + 펫 윈도우 투명도만 확인. 이게 안되면 Tauri 마이그레이션 자체의 효익이 없음
2. PoC 통과 시 본 마이그레이션 착수
3. 본 작업은 **`tauri/main` 브랜치**에서, `main`은 안정 버전 유지

## 다음 단계

- [ ] 별도 세션에서 Phase 1 (PoC) 시작
- [ ] Phase 5 (투명도 검증) 결과에 따라 본 마이그레이션 GO/NO-GO 결정
