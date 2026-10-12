# TypeScript V0 reference

Python 구현과 배포 JSON을 유지하면서 웹용 데이터 로딩·검색 모듈을 추가했다.
UI 연결과 검색 최적화는 포함하지 않는다.

## 저장소 구조

- `ku_room_scan.py`: 수강 데이터 수집·캐시·중복 제거·시간표 파싱.
- `build_room_master.py`: 관측 강의실에서 건물·호수 메타데이터 생성.
- `build_release.py`: 학기별 강의실과 검색용 시간표를 release JSON으로 내보냄.
- `data_loader.py`, `periods.py`, `availability.py`: Python 데이터 로딩·교시 변환·검색 reference.
- `cli.py`: Python 검색과 강의실 상세 조회 진입점.
- `tests/test_availability.py`, `bench/benchmark_search.py`: 의미론 테스트와 대표 query·digest 정의.
- `data/releases/2026_B01012/`: 현재 서비스 데이터(404개 강의실, 3,087개 시간표).
- `web/`: Vite vanilla TypeScript 프로젝트. `vite.config.ts`의 `publicDir`가 release 디렉터리를 제공한다.

## 모듈

`src/data.ts`의 `loadReleaseData()`는 기본적으로
`<BASE_URL>2026_B01012/manifest.json`을 먼저 가져온 뒤 두 데이터 파일을 로드한다.
다른 배포 경로는 인자로 전달한다. `parseReleaseData()`는 이미 읽은 JSON을 같은 규칙으로 검증한다.
schema version, 필드 타입, 배열, 개수, 중복 강의실 ID, 시간표의 강의실 참조·요일·교시 범위를 확인하며,
오류에는 파일·필드 경로를 포함한다. Python의 고정 교시 규칙과 충돌하는 manifest 시간 격자·시간대도 거부한다.

`src/search.ts`의 `AvailabilityEngine`은 Python과 같은 강의실/요일 인덱스와 교시 정렬을 만들고,
검색마다 강의실을 순회해 상태를 계산한다. 메서드는 TypeScript 관례에 따라 camelCase를 사용하고,
상태 객체 필드는 Python의 snake_case와 `None`에 대응하는 `null`을 유지한다.
시간 구간 병합·반전, 강의실별 상세 조회도 reference 의미론을 유지한다.

```ts
import { loadReleaseData } from './src/data'
import { AvailabilityEngine } from './src/search'

const { manifest, rooms, schedules } = await loadReleaseData()
const engine = new AvailabilityEngine(rooms, schedules, manifest)

// 실제 현재 instant를 manifest.timezone 기준으로 검색한다.
const current = engine.findAvailableRooms(new Date(), '공B', 60)

// 사용자가 고른 수요일 13:30은 캠퍼스 wall-clock 값으로 직접 검색한다.
const selected = engine.findAvailableRoomsAtWallClock(
  { day: '수', hour: 13, minute: 30 }, '공B', 60,
)
```

- 1교시는 09:00부터 30분이다. 종료 교시를 포함하며 수업 시간 구간은 `[시작, 종료)`다.
- 정규 시간 종료는 `max(19, 모든 시간표의 종료 교시)`로 계산한다. 현재 release는 23교시, 20:30이다.
- `occupied`: 현재 수업들의 가장 늦은 종료 시각을 반환한다. 이후 이어지는 수업까지 확장하지 않는다.
- `free_until`: 다음 수업 시작까지의 분 수에만 최소 시간 조건을 적용한다.
- `free_rest_of_day`: 이후 수업이 없다. 종료 시각과 `free_minutes`는 `null`이며 최소 시간으로 제외하지 않는다.
- `outside_regular_hours`: 정규 시간 밖이며 검색 결과에 포함하지 않는다.
- `getFreeIntervals()`의 상세 시간 구간은 정규 시간 종료까지 계산한다. 현재 상태의 `free_minutes`와 별개다.

## 시간 입력과 Python과의 경계

시간표와 검색 기준의 source of truth는 로드한 `manifest.timezone`이다.
엔진 생성자의 세 번째 인자로 manifest를 반드시 전달한다. V0는 `Asia/Seoul`만 지원하며,
누락되거나 지원하지 않는 시간대를 시스템 시간대로 대체하지 않는다.

| API | 입력 의미 |
| --- | --- |
| `findAvailableRooms(instant?, building?, minMinutes?)` | 실제 instant. 생략하면 `new Date()`로 현재 시각 검색 |
| `getCurrentStatus(roomId, instant?)` | 실제 instant의 강의실 상태. 생략하면 현재 시각 |
| `toCampusWallClock(instant)` | instant를 manifest 시간대의 `{ day, hour, minute }`으로 변환 |
| `findAvailableRoomsAtWallClock(time, building?, minMinutes?)` | 직접 고른 캠퍼스 요일·시각 |
| `getStatusAtWallClock(roomId, time)` | 직접 고른 캠퍼스 요일·시각의 강의실 상태 |

instant 변환은 표준 `Intl.DateTimeFormat`에 `timeZone: manifest.timezone`과
`hourCycle: 'h23'`을 명시한다. 시스템 시간대와 관계없이 서울 요일·시·분을 추출하며,
서울 자정은 00시로 처리한다. 외부 시간대 라이브러리는 사용하지 않는다.
예를 들어 `2026-10-14T04:30:00Z`는 서울의 수요일 13:30이다.

직접 선택한 `{ day: '수', hour: 13, minute: 30 }`은 날짜·instant로 바꾸지 않는다.
두 API 경로는 같은 wall-clock 검색 구현으로 이어지며, Python에 같은 서울 요일·시·분을
전달했을 때의 V0 결과를 유지한다. 초와 밀리초는 검색에 사용하지 않는다.

기존 로컬 필드 추출 경로(`getDay()`·`getHours()`·`getMinutes()`)는 제거했다.
이전 호출부에서 수동 선택에 사용하던 `new Date(year, month, day, hour, minute)`는
브라우저 시간대에서 instant를 만들기 때문에 wall-clock API로 옮겨야 한다.
특정 instant를 전달할 때는 `new Date()`·epoch 또는 `Z`/명시적 UTC offset이 있는 문자열을 사용한다.

로더는 Python의 단순 배열 로딩보다 엄격하다. 문자열 교시·잘못된 참조 등은 보정하거나 건너뛰지 않고 거부한다.
정상적인 현재 release에서는 이 차이가 검색 결과에 영향을 주지 않는다.
건물·호수의 문자열 순서는 Python처럼 유니코드 코드 포인트로 비교한다.
호수의 숫자 접두사는 유니코드 십진 숫자와 큰 정수까지 비교한다.

## 검증

`web/`에서 `npm test`로 타입 검사와 Vitest를 실행하고, `npm run build`로 기존 Vite 빌드를 확인한다.
테스트는 실제 release를 읽으며 Python 실행이나 별도 서버를 요구하지 않는다.
대표 query 8개의 개수, query별 SHA-256 앞 16자리 digest와 combined digest
`402da0886860a848`를 고정 검증한다. digest의 query 순서, UTF-8 인코딩, 구분자는 Python benchmark와 같다.
시간 경계·상태·최소 시간·정렬·중첩 수업과 데이터/HTTP 오류를 별도로 확인한다.

`npm run test:timezones`는 `Asia/Seoul`, `UTC`, `America/Los_Angeles`를 각각 시스템 시간대로
설정한 별도 Node 프로세스에서 검색·시간대 테스트를 실행한다.
각 프로세스의 실제 기본 시간대도 확인하며, 8개 query의 instant/wall-clock 결과와
combined digest를 모두 검증한다. 서울 자정의 요일 전환, 여러 UTC offset으로 표현한 같은 instant,
현재 시각 검색과 잘못된 시간 입력도 확인한다.

기존 Python 검증은 저장소 루트에서 `python -m unittest discover -s tests -v`로 실행한다.
Python CLI와 benchmark의 기본 경로는 아직 `dist/`이므로 현재 데이터에는 `--dist data/releases`를 지정해야 한다.
