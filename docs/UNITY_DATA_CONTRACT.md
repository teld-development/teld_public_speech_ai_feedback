# Unity ↔ Web 데이터 계약 (`simulations/{code}`)

Unity(발표 시뮬레이터)와 웹이 Firestore `simulations/{code}` 문서로 주고받는 필드 정의.
모두 기존 `result`/`status` 와 **별개의 top-level 필드**이며, Unity 는 각 필드만 updateMask
PATCH 로 갱신하므로 웹/Gemini 가 `result` 를 덮어써도 보존된다.

---

## 1. `qaResults` — 질의응답 (#1)  · Unity 가 씀 → 웹이 표시
발표 후 Q&A(청중 질문 + 발표자 답변)를 구조화해 기록.

| 필드 | 타입 | 설명 |
|---|---|---|
| `qaResults` | `Array<QAItem>` | 질문-답변 쌍 목록 |
| `qaCount` | `number` | 항목 수 |

**QAItem**
| 필드 | 타입 | 설명 |
|---|---|---|
| `index` | number | 질문 순서(0-based) |
| `question` | string | 청중 질문 |
| `answer` | string | 발표자 답변(STT 텍스트, 무응답이면 `""`) |
| `questionType` | string | `"fact"` / `"inference"` / `"critical"` / `""` |
| `studentIndex` | number | 질문한 청중 인덱스 |
| `characterId` | string | 청중 ID (예 `"b2"`, `"g6"`) |

---

## 2. `prosody` — 음성 높낮이/성량 (#3)  · Unity 가 씀 → 웹이 표시
발표 음성을 실시간 분석(자기상관 F0 + RMS)한 요약. 분석 데이터가 없으면 필드 자체가 없을 수 있음.

| 필드 | 타입 | 설명 |
|---|---|---|
| `intonationScore` | number(0~100) | 억양 다양성 — 낮을수록 단조로움 |
| `pitchMeanHz` | number | 평균 음높이 |
| `pitchMinHz` / `pitchMaxHz` | number | 음높이 최저/최고 |
| `pitchRangeSemitone` | number | 음역대(반음) |
| `voicedPct` | number | 유성(말소리) 비율 % |
| `quietPct` | number | 너무 작게 말한 비율 % |
| `volumeStability` | number(0~100) | 성량 일정함 |

---

## 3. `previousFeedback` — 지난 발표 보완점 (#4)  · 웹이 씀 → Unity 가 읽음
| 필드 | 타입 | 설명 |
|---|---|---|
| `previousFeedback` | `string[]` | 직전 완료 발표의 개선/보완점 상위 3개. 첫 발표 등 없으면 `[]` |

- **쓰는 곳**: `app/simulation/setup/page.js` — 코드 생성 시 `getRecentImprovementPoints(user, 3)`(`app/lib/presentations.js`) 로 계산해 `simulations/{code}` payload 에 포함.
- **출처**: 사용자의 가장 최근 업데이트된 발표의 완료 attempt → `analysisResult.summary.suggestions`.
- **읽는 곳(예정)**: Unity 가 핀코드 claim 시 `simulations/{code}.previousFeedback` 를 읽어 PDF 로딩 화면에 표시.

---

## 웹 표시 To-do (담당자)
- [ ] 결과 페이지에 `qaResults` → **질의응답** 섹션 (질문/내 답변 쌍)
- [ ] 결과 페이지에 `prosody` → **음성(높낮이·성량)** 섹션
- [x] `previousFeedback` 기록(본 브랜치) — *Unity 읽기 연동만 남음*

> 참고: `qaResults` / `prosody` 는 Unity 빌드가 발표를 1회 끝내면 `simulations/{code}` 에 기록됨.
> Unity 콘솔에 `[Firestore] qaResults N개 기록 완료` / `prosody 기록 완료` 로그로 전송 확인 가능.
