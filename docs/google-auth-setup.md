# Google 로그인 설정 가이드

Pet Timer는 Electron 환경에서 **Loopback OAuth 흐름(RFC 8252)** 으로 Google 로그인을 처리합니다. `signInWithPopup`이 Electron에서 자주 차단되는 문제를 우회하기 위함입니다.

흐름:
1. 앱이 `127.0.0.1:51234`에 임시 HTTP 서버를 열고
2. 시스템 기본 브라우저로 Google 로그인 페이지를 열고
3. 인증 후 브라우저가 `http://127.0.0.1:51234/callback`로 리디렉트
4. 앱이 코드를 받아 PKCE로 `id_token` 교환
5. `signInWithCredential`로 Firebase 로그인

이 흐름에는 **Desktop 타입 OAuth client**가 필요합니다 (Web 타입은 secret 노출 문제로 부적합).

---

## 1. Google Cloud Console에서 OAuth Client 발급

1. https://console.cloud.google.com/apis/credentials 접속
2. 프로젝트 선택: **mentalityapp**
3. 상단 **"+ CREATE CREDENTIALS"** → **OAuth client ID**
4. **Application type:** `Desktop application`
5. **Name:** `Pet Timer Desktop` (자유)
6. **CREATE** 클릭
7. 발급된 **Client ID**, **Client secret** 복사

> ℹ️ Desktop OAuth client에서 client secret은 공개되어도 안전하다고 Google이 명시합니다 (RFC 8252 §8.5). 앱 번들에 포함되어도 무방.

> ℹ️ 별도로 리디렉트 URI를 등록할 필요가 없습니다 — Desktop 타입은 `127.0.0.1`/`localhost`를 자동으로 허용합니다.

---

## 2. `.env.local`에 추가

프로젝트 루트의 `.env.local` 파일에 다음 두 줄 추가:

```
VITE_GOOGLE_DESKTOP_CLIENT_ID=<위에서 받은 Client ID>
VITE_GOOGLE_DESKTOP_CLIENT_SECRET=<위에서 받은 Client secret>
```

저장 후 dev 서버 재시작.

---

## 3. OAuth Consent Screen 확인

신규 프로젝트라면 OAuth 동의 화면 설정이 필요할 수 있습니다.

1. Console → **APIs & Services → OAuth consent screen**
2. User Type: **External** (테스트용)
3. App 정보 입력 (앱 이름, 지원 이메일)
4. **Scopes:** `email`, `profile`, `openid` 기본값 OK
5. **Test users:** 본인 Google 계정 추가 (Publishing status: Testing이면 등록된 테스트 유저만 로그인 가능)

운영 단계에서 Publishing을 "In production"으로 전환해야 모든 사용자가 로그인 가능합니다.

---

## 4. 사용

- 홈 페이지의 "Google로 시작" 또는 "Google 계정 연결" 클릭
- 시스템 브라우저가 열리며 Google 로그인 페이지 표시
- 로그인 후 자동으로 앱으로 돌아옴 ("로그인 완료" 페이지가 잠깐 보이고 닫힘)
- 메인 윈도우의 홈 화면에 displayName + photoURL이 표시됨

공부방에서도 친구의 Google 프로필 이미지와 이름이 보입니다.

---

## 문제 해결

| 증상 | 원인 | 조치 |
|------|------|------|
| `Google Desktop OAuth 설정이 누락되었습니다` | `.env.local`에 값 없음 | 위 2번 단계 확인, dev 재시작 |
| `포트 51234가 이미 사용 중` | 이전 인증 창이 안 닫힘 | 앱 재시작 또는 잠시 후 재시도 |
| `redirect_uri_mismatch` | Web 타입 OAuth client 사용 중 | Desktop 타입으로 다시 발급 |
| `Access blocked: This app's request is invalid` | Consent screen 미설정 | 위 3번 단계 확인 |
| `access_denied` | 사용자가 동의 거부 또는 test user 미등록 | OAuth consent screen에 본인 계정 추가 |
