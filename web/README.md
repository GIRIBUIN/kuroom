# kuroom 웹

건국대학교 빈 강의실 찾기. Vite와 vanilla TypeScript를 사용한다.

## 실행

`web/`에서 `npm run dev`로 실행한다.
요일·시간·몇 분 이상·건물 변경 시 검색 결과와 URL을 즉시 갱신한다.
기본값은 로딩 시점의 서울 요일·분 단위 시각, 최소 60분, 전체 건물이다.
자동 갱신은 하지 않으며, 시간 옆의 **지금** 버튼으로 요일과 시각만 현재 서울 시간으로 갱신한다.

요일은 월~금 선택이 기본이다. 현재/복원된 값이 토·일이면 해당 주말 선택값을 추가한다.
시간은 분 단위 입력, 최소 시간은 30·60·90·120분 선택을 지원한다.
공유 URL의 다른 유효한 최소 시간도 그대로 복원한다.
건물은 `details` 안의 체크박스로 복수 선택하며 빈 선택은 전체 건물이다.
건물 선택은 엔진 결과를 필터링할 뿐 순서를 바꾸지 않는다.

결과는 화면 크기와 관계없이 조밀한 한 열 목록이다.
왼쪽에 강의실, 오른쪽에 남은 공실 시간과 다음 수업을 표시한다.
강의실 버튼을 누르면 선택한 요일·시간 기준 상태와 주간 시간표를 native `dialog`로 연다.
닫기 버튼과 ESC를 지원하며, native modal의 focus 제한·원래 버튼으로의 focus 복원을 사용한다.
시간표는 월~금 열과 30분 시간선을 표시한다. 해당 강의실에 주말 수업이 있으면 그 열도 표시한다.
교시 범위를 실제 시작/종료 시각으로 변환하고, 연속된 같은 과목·교수의 수업은 표시용 block으로 합친다.
겹치는 다른 수업은 나란히 배치한다. 원본 시간표와 검색 인덱스는 바꾸지 않는다.
과목명·시간·교수를 표시하며, 짧은 block은 스크롤/키보드 focus로 내용을 확인할 수 있다.

최대 폭 760px의 dark UI다. 제목은 페이지와 함께 스크롤되고 검색·availability 필터만 sticky다.
desktop에서는 검색 한 줄과 필터 한 줄, 560px 이하에서는 compact 필터 행의 가로 스크롤을 사용한다.
token은 같은 검색 control 안에서 줄바꿈하되 일정 높이 이후 내부 스크롤로 제한한다.
dialog는 화면 안에 맞추고 시간표 영역만 가로로 스크롤할 수 있다.
기본 form control, 연결된 label, focus 표시, 결과 개수 live region을 유지한다.

availability 결과는 pagination 없이 모든 room row를 연속 표시한다. 건물 section header는 넣지 않는다.
오른쪽의 좁은 sticky building quick index는 현재 결과에 있는 건물을 첫 등장 순서로 표시한다.
클릭하면 해당 건물의 첫 결과 행으로 즉시 스크롤하며 필터·결과 집합·URL을 바꾸지 않는다.
sticky 조작 영역의 높이를 측정해 행의 scroll margin과 index 위치에 반영한다.
모바일에서도 좁은 rail을 유지하며 index 내부를 스크롤할 수 있다. scroll spy나 active 추적은 하지 않는다.

## 강의실 시간표 조회

검색 input은 항상 표시한다. Q는 기존 input으로 focus만 이동한다.
다른 입력 control·contenteditable·dialog·IME 조합 중에는 Q를 가로채지 않는다.
입력과 선택 token이 모두 비어 있으면 기존 빈 강의실 화면을 유지한다.
둘 중 하나라도 있으면 availability 필터와 결과를 숨기고 독립된 강의실 조회 목록을 표시한다.
모두 지우면 기존 필터와 URL을 유지한 채 빈 강의실 화면으로 돌아온다.
input 오른쪽 control은 비었을 때 focus용 검색 아이콘, query/token이 있으면 전체 초기화 X를 표시한다.
X는 query·token·autocomplete를 모두 지우며 검색 input 자체를 숨기지 않는다.

공백·영문 대소문자·전각 입력을 정규화하고 강의실 ID/번호와 건물의 부분 검색을 지원한다.
autocomplete는 정확한 일치를 먼저 표시하고 최대 8개로 제한한다. 건물 후보에는 강의실 수를 표시한다.
위/아래 화살표로 명시적으로 고른 후보 또는 유일한 normalized exact match만 Enter/comma로 확정한다.
모호하거나 없는 query는 유지하고 임의의 첫 후보를 고르지 않는다. comma는 input에 남기지 않는다.
comma로 구분된 여러 target 붙여넣기도 지원하며 IME 조합 중에는 확정하지 않는다.
후보 클릭 선택과 token 개별 삭제를 유지한다. query가 완전히 비었을 때 Backspace는 마지막 token만 삭제한다.
여러 token은 OR 합집합이며 중복 강의실은 제거한다. 입력 중인 query도 합집합 미리보기에 포함한다.
ESC는 autocomplete만 먼저 닫는다. 그 외에는 기존 native dialog 동작에 맡기며 query/token을 초기화하지 않는다.

조회 목록에는 공실 정보를 표시하지 않는다. 수업 중이거나 최소 공실 시간/건물 필터에서 제외된 강의실도 조회된다.
같은 상세 dialog를 재사용하되 직접 조회의 상태는 현재 서울 시각으로 계산한다.
수업 중이면 상단에 수업 중 상태와 종료 시각을 표시한다. 시간표의 빈 칸에는 placeholder를 넣지 않는다.

## URL

예: `?day=wed&time=13:30&min=60&building=공B,새`

- `day`: `mon`~`sun`. 주말의 실제 현재/공유 조건도 보존한다.
- `time`: `HH:mm`, `00:00`~`23:59`. 서울 캠퍼스 wall-clock 값이다.
- `min`: 0 이상의 안전한 정수, 분 단위.
- `building`: 건물 코드를 쉼표로 연결. 생략/빈 값은 전체 건물. 중복·없는 코드는 제거한다.

누락되거나 잘못된 요일·시각·최소 시간은 항목별 현재 기본값으로 대체한다.
첫 로딩과 유효한 변경 때 `history.replaceState`로 실제 적용 조건을 기록한다.
경로, 다른 query parameter와 hash는 유지한다.
불완전한 시간 입력은 결과 대신 안내를 표시하고 마지막 유효한 URL을 유지한다.
공유 URL은 같은 주간 시간표 조건을 재현하며 특정 달력 날짜를 저장하지 않는다.

## 검색 의미론

Python `availability.py`와 TypeScript `src/search.ts`는 같은 주간 검색 의미론을 사용한다.

- 1교시는 09:00부터 30분이다. 종료 교시를 포함하며 수업 구간은 `[시작, 종료)`다.
- 하루 모든 시각에 검색한다. 현재 진행 중인 수업이 있는 강의실만 공실 후보에서 제외한다.
- `occupied`: 현재 수업들의 가장 늦은 종료 시각. 미래 수업으로 이어 확장하지 않는다.
- `free_until`: 오늘 이후부터 다음 주 같은 요일까지 월~일 시간표를 순환해 첫 수업을 찾는다.
  `free_minutes`는 날짜 경계를 포함한 남은 분 수이며 최소 시간 조건을 적용한다.
  `next_class`는 실제 다음 수업, `next_class_day_offset`은 오늘부터 0~7일 뒤다.
  `free_until_minutes`/`free_until`은 다음 수업이 있는 날의 시계 시각이다.
- `free_all_week`: 주간 전체에 등록된 수업이 없다. 다음 수업과 모든 공실 시간 필드는 `null`이다.
  임의의 종료 시각을 만들지 않으며 모든 최소 시간 조건에 포함한다.
- 이전의 `free_rest_of_day`, `outside_regular_hours`는 반환하지 않는다.
- `getFreeIntervals()` 등 당일 상세 구간 API는 기존 정규 시간 범위를 유지한다.
  그 종료 시각은 검색 가능 시간을 제한하지 않는다.
- 건물·호수 정렬과 중첩 수업 처리, stable sorting은 기존 reference와 같다.

월요일 21:17 이후 화요일 09:00 수업이 있으면 703분(11시간 43분)이다.
금요일 21:17 이후 주말 수업 없이 월요일 09:00 수업이 있으면 3583분이다.
실제 주말 수업이 있으면 이를 건너뛰지 않는다.
주간 시간표를 반복하는 모델이므로 휴일·학기 종료·대관·건물 개방 여부는 반영하지 않는다.

## 시간대와 데이터

`src/data.ts`는 manifest를 먼저 로드하고 schema/timezone/time grid, 개수, ID·참조·필드·교시를 검증한다.
현재 release는 `data/releases/2026_B01012/`, 강의실 404개·시간표 3087개다.
Vite의 `publicDir`가 release를 제공하며 기본 로딩 경로는 `<BASE_URL>2026_B01012/`다.
데이터 JSON과 로더의 검증 규칙은 이번 검색 변경에서 수정하지 않았다.

엔진 생성자에는 manifest를 전달한다. `Asia/Seoul`만 지원하며 다른 시간대로 대체하지 않는다.

| API | 시간 입력 |
| --- | --- |
| `findAvailableRooms(instant?, building?, minMinutes?)` | 실제 instant, 생략하면 현재 시각 |
| `getCurrentStatus(roomId, instant?)` | 실제 instant, 생략하면 현재 시각 |
| `toCampusWallClock(instant)` | manifest 시간대의 요일·시·분으로 변환 |
| `findAvailableRoomsAtWallClock(time, building?, minMinutes?)` | 직접 고른 캠퍼스 요일·시·분 |
| `getStatusAtWallClock(roomId, time)` | 직접 고른 캠퍼스 요일·시·분 |

instant는 표준 `Intl.DateTimeFormat`과 명시적 `timeZone`, `hourCycle: 'h23'`으로 변환한다.
수동 선택은 Date로 만들거나 시간대 변환하지 않는다. 초·밀리초는 사용하지 않는다.
Python reference는 전달받은 datetime의 요일·시·분을 캠퍼스 wall-clock으로 사용한다.

## 코드 구조

- `src/main.ts`: 데이터 로딩, 필터 이벤트, 결과 row와 dialog 연결.
- `src/state.ts`: 기본값·지금 적용, 복수 건물 검색, duration/다음 수업 문구.
- `src/url.ts`: URL 필터 복원·저장.
- `src/detail.ts`: native dialog, 주간 시간표 표시용 block과 겹침 배치.
- `src/lookup.ts`, `src/lookup-ui.ts`: 강의실/건물 조회, token 합집합, combobox와 키보드 이벤트.
- `src/building-index.ts`: 현재 availability 결과의 첫 건물 행과 scroll navigation.
- `src/style.css`: compact dark UI와 반응형 스타일.
- `src/data.ts`, `src/search.ts`: 데이터 검증과 Python에 대응하는 검색 엔진.

저장소 루트의 수집·release 생성은 `ku_room_scan.py`, `build_room_master.py`, `build_release.py`가 담당한다.
`data_loader.py`/`periods.py`는 Python 로딩·교시 변환, `cli.py`는 검색·상세 조회 진입점이다.

## 검증

- `npm test`: TypeScript 타입 검사와 Vitest.
- `npm run test:timezones`: 서울·UTC·로스앤젤레스 별도 프로세스에서 검색/시간대 검증.
- `npm run build`: TypeScript 검사와 Vite 프로덕션 빌드.
- 저장소 루트에서 `python -m unittest discover -s tests -v`: Python 경계값 검증.

`tests/python-parity.test.ts`는 Python reference를 실제 실행한다.
따라서 `npm test`에는 PATH의 `python`이 필요하며, 다른 실행 경로는 `PYTHON` 환경 변수로 지정한다.
실제 release와 공실·주간 순환 fixture 각각에 18개 query를 적용해 모든 강의실 상태 객체와
정렬된 검색 결과 ID 순서를 비교한다. 상태·남은 분·다음 수업·날짜 차이까지 검증한다.
대표 8개 query의 개수와 ID digest는 새 의미론에서도 유지된다.
combined digest는 `402da0886860a848`이며, 야간 등 추가 조건의 상태 parity는 별도로 검증한다.

조회 UI는 개발 의존성 `happy-dom`에서 DOM 이벤트·모드 전환·dialog 연결을 단위 테스트한다.
실제 브라우저나 GUI는 실행하지 않으며 native modal 동작 경계는 테스트에서 stub 처리한다.

Python CLI와 benchmark의 기본 데이터 경로는 `dist/`이므로 현재 release에는
`--dist data/releases`를 지정한다.
