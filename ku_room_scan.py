#!/usr/bin/env python3

import argparse
import json
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright


# ======================================================================
# Config
# ======================================================================

BASE_URL = "https://sugang.konkuk.ac.kr"

MAIN_PAGE_URL = (
    f"{BASE_URL}/sugang/jsp/search/searchMainOuter.jsp"
)

SEARCH_URL = f"{BASE_URL}/sugang/search"

OUTPUT_ROOT = Path("ku_room_output")

USER_AGENT = (
    "Mozilla/5.0 "
    "(X11; Linux x86_64; rv:157.0) "
    "Gecko/20100101 Firefox/157.0"
)


# ======================================================================
# Utility
# ======================================================================

def save_json(path: Path, data):
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    path.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def load_json(path: Path):
    return json.loads(
        path.read_text(encoding="utf-8")
    )


def safe_filename(value: str):
    return re.sub(
        r"[^0-9A-Za-z가-힣._-]+",
        "_",
        value,
    )


# ======================================================================
# Browser discovery
# ======================================================================

def get_select_options(page, selector: str):
    return page.eval_on_selector_all(
        f"{selector} option",
        """
        els => els.map(x => ({
            value: x.value,
            text: x.textContent.trim()
        }))
        """,
    )


def discover_filters():
    """
    실제 브라우저를 한 번 실행해 JS가 채워 넣는
    대학 / 개설학과 목록을 읽는다.

    초기 HTML에서는 pUniv / pSustMjCd option이 비어 있으므로
    requests만으로는 목록을 얻을 수 없다.
    """

    print("=" * 70)
    print("DISCOVER FILTERS")
    print("=" * 70)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
        )

        context = browser.new_context(
            user_agent=USER_AGENT,
            locale="ko-KR",
        )

        page = context.new_page()

        print("Loading timetable page...")

        page.goto(
            MAIN_PAGE_URL,
            wait_until="domcontentloaded",
            timeout=60_000,
        )

        # JS 내부 synchronous XHR 등이 실행되어
        # option이 채워질 때까지 기다린다.
        page.wait_for_function(
            """
            () =>
                document.querySelectorAll(
                    '#pUniv option'
                ).length > 0
                &&
                document.querySelectorAll(
                    '#pSustMjCd option'
                ).length > 0
            """,
            timeout=30_000,
        )

        pobt_options = get_select_options(
            page,
            "#pPobt",
        )

        univ_options = get_select_options(
            page,
            "#pUniv",
        )

        sust_options = get_select_options(
            page,
            "#pSustMjCd",
        )

        browser.close()

    # 빈 값 제거
    pobt_options = [
        x
        for x in pobt_options
        if x["value"]
    ]

    univ_options = [
        x
        for x in univ_options
        if x["value"]
    ]

    sust_options = [
        x
        for x in sust_options
        if x["value"]
    ]

    whole_univ = next(
        (
            x
            for x in univ_options
            if x["text"] == "전체대학"
        ),
        None,
    )

    if whole_univ is None:
        raise RuntimeError(
            "'전체대학' 코드를 찾지 못했습니다."
        )

    print(
        f"pPobt       : {len(pobt_options)}"
    )

    print(
        f"pUniv       : {len(univ_options)}"
    )

    print(
        f"pSustMjCd   : {len(sust_options)}"
    )

    print(
        "전체대학 code:",
        whole_univ["value"],
    )

    print()

    print("=== 이수구분 ===")

    for x in pobt_options:
        print(
            f"{x['value']:8} {x['text']}"
        )

    print()

    print("=== 개설단위 일부 ===")

    for x in sust_options[:20]:
        print(
            f"{x['value']:8} {x['text']}"
        )

    if len(sust_options) > 20:
        print(
            f"... +{len(sust_options) - 20}"
        )

    print()

    return {
        "whole_univ": whole_univ,
        "pobt": pobt_options,
        "univ": univ_options,
        "sust": sust_options,
    }


# ======================================================================
# HTTP
# ======================================================================

def create_session():
    session = requests.Session()

    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": (
            "ko-KR,ko;q=0.9,"
            "en-US;q=0.5,en;q=0.3"
        ),
    })

    print("=" * 70)
    print("CREATE SESSION")
    print("=" * 70)

    r = session.get(
        MAIN_PAGE_URL,
        timeout=30,
    )

    r.raise_for_status()

    print("status  :", r.status_code)
    print(
        "cookies :",
        session.cookies.get_dict(),
    )
    print()

    return session


def parse_server_json(response):
    """
    건국대 서버는 JSON body를 보내면서
    Content-Type을 text/html로 내려주므로
    response.json()을 그대로 신뢰하지 않는다.
    """

    response.raise_for_status()

    text = response.text

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1:
        raise RuntimeError(
            "응답 body에서 JSON 객체를 찾지 못했습니다.\n"
            + text[:1000]
        )

    json_text = text[start:end + 1]

    try:
        return json.loads(json_text)

    except json.JSONDecodeError as e:
        print("JSON decode error:", e)
        print()
        print(json_text[:3000])
        raise


def fetch_query(
    session: requests.Session,
    year: str,
    term: str,
    whole_univ_code: str,
    sust_code: str,
    pobt_code: str,
):
    payload = {
        "pYear": year,
        "pTerm": term,
        "pPobt": pobt_code,

        "pSearchGb": "1",

        # 확인 결과 전체대학 코드로 고정해도
        # pSustMjCd가 지정되면 정상 조회된다.
        "pUniv": whole_univ_code,

        "pSustMjCd": sust_code,

        "pLang": "",
        "pKind": "",

        "pSearchKind": "1",
        "pSearchNm": "",
    }

    params = {
        "attribute": "lectListOuter",
        "fake": str(
            int(time.time() * 1000)
        ),
    }

    headers = {
        "Accept": (
            "application/json, "
            "text/javascript, */*; q=0.01"
        ),
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE_URL,
        "Referer": MAIN_PAGE_URL,
    }

    response = session.post(
        SEARCH_URL,
        params=params,
        data=payload,
        headers=headers,
        timeout=60,
    )

    data = parse_server_json(response)

    rows = data.get("rows")

    if not isinstance(rows, list):
        raise RuntimeError(
            "응답의 rows가 list가 아닙니다."
        )

    return rows


# ======================================================================
# Full current-semester collector
# ======================================================================

def query_cache_path(
    cache_dir: Path,
    sust_code: str,
    pobt_code: str,
):
    return (
        cache_dir
        / f"{safe_filename(sust_code)}"
        / f"{safe_filename(pobt_code)}.json"
    )


def collect_current_rows(
    session,
    year,
    term,
    discovered,
    output_dir,
    delay,
    use_cache=True,
):
    whole_univ_code = (
        discovered["whole_univ"]["value"]
    )

    sust_options = discovered["sust"]
    pobt_options = discovered["pobt"]

    cache_dir = (
        output_dir
        / "query_cache"
    )

    total_queries = (
        len(sust_options)
        * len(pobt_options)
    )

    current = 0

    all_rows = []

    query_stats = []

    failed_queries = []

    year_anomalies = []

    print("=" * 70)
    print("COLLECT CURRENT SEMESTER")
    print("=" * 70)

    print(
        "year             :",
        year,
    )

    print(
        "term             :",
        term,
    )

    print(
        "units            :",
        len(sust_options),
    )

    print(
        "completion types :",
        len(pobt_options),
    )

    print(
        "maximum requests :",
        total_queries,
    )

    print(
        "delay            :",
        delay,
    )

    print()

    for sust in sust_options:
        sust_code = sust["value"]
        sust_name = sust["text"]

        for pobt in pobt_options:
            current += 1

            pobt_code = pobt["value"]
            pobt_name = pobt["text"]

            cache_path = query_cache_path(
                cache_dir,
                sust_code,
                pobt_code,
            )

            source = "HTTP"

            try:
                if (
                    use_cache
                    and cache_path.exists()
                ):
                    rows = load_json(
                        cache_path
                    )

                    source = "CACHE"

                else:
                    rows = fetch_query(
                        session=session,
                        year=year,
                        term=term,
                        whole_univ_code=(
                            whole_univ_code
                        ),
                        sust_code=sust_code,
                        pobt_code=pobt_code,
                    )

                    save_json(
                        cache_path,
                        rows,
                    )

                    # 서버에 동시에 많은 요청을
                    # 보내지 않도록 순차적으로 쉰다.
                    if delay > 0:
                        time.sleep(delay)

                valid_rows = []

                for row in rows:
                    open_yy = str(
                        row.get("open_yy", "")
                    )

                    # 정상적인 학과+이수구분 조회는
                    # 요청 연도와 동일한 open_yy만
                    # 반환하는 것을 확인했다.
                    if (
                        open_yy
                        and open_yy != year
                    ):
                        year_anomalies.append({
                            "requested_year": year,
                            "requested_term": term,
                            "sust_code": sust_code,
                            "sust_name": sust_name,
                            "pobt_code": pobt_code,
                            "pobt_name": pobt_name,
                            "row": row,
                        })

                        continue

                    valid_rows.append(row)

                all_rows.extend(
                    valid_rows
                )

                query_stats.append({
                    "sust_code": sust_code,
                    "sust_name": sust_name,
                    "pobt_code": pobt_code,
                    "pobt_name": pobt_name,
                    "rows": len(rows),
                    "valid_rows": (
                        len(valid_rows)
                    ),
                    "source": source,
                })

                print(
                    f"[{current:4}/{total_queries}] "
                    f"{sust_name:<22} "
                    f"/ {pobt_name:<4} "
                    f"-> {len(valid_rows):3} "
                    f"[{source}]"
                )

            except Exception as e:
                failed_queries.append({
                    "sust_code": sust_code,
                    "sust_name": sust_name,
                    "pobt_code": pobt_code,
                    "pobt_name": pobt_name,
                    "error": repr(e),
                })

                print(
                    f"[{current:4}/{total_queries}] "
                    f"{sust_name:<22} "
                    f"/ {pobt_name:<4} "
                    f"-> ERROR: {e}"
                )

                # 일시 오류 가능성이 있으므로
                # 실패 후 조금 더 기다린다.
                time.sleep(
                    max(delay, 1.0)
                )

    return {
        "rows": all_rows,
        "query_stats": query_stats,
        "failed_queries": failed_queries,
        "year_anomalies": year_anomalies,
    }


# ======================================================================
# Row deduplication
# ======================================================================

def row_unique_key(row):
    """
    동일 강좌가 복수 검색 조합에서 조회될 경우를 대비.

    sbjt_id가 개설 강좌 식별에 가장 유용하지만
    혹시 모를 충돌을 막기 위해 몇 필드를 함께 사용한다.
    """

    return (
        str(row.get("open_yy", "")),
        str(row.get("sbjt_id", "")),
        str(row.get("haksu_id", "")),
        str(row.get("clss_no", "")),
        str(row.get("pobt_div", "")),
    )


def deduplicate_rows(rows):
    unique = {}

    duplicate_count = 0

    for row in rows:
        key = row_unique_key(row)

        if key in unique:
            duplicate_count += 1
            continue

        unique[key] = row

    return (
        list(unique.values()),
        duplicate_count,
    )


# ======================================================================
# room_nm parser
# ======================================================================

DAY_TIME_RE = re.compile(
    r"^(월|화|수|목|금|토|일)"
    r"(\d{1,2})-(\d{1,2})"
)


def split_top_level(
    text: str,
    separator: str = ",",
):
    """
    괄호 내부 comma는 무시하고
    최상위 comma만 분리한다.

    예:
        화17-19(온라인(녹화)),
        금15-18(새403)
    """

    result = []
    current = []

    depth = 0

    for ch in text:
        if ch == "(":
            depth += 1

        elif ch == ")":
            depth = max(
                0,
                depth - 1,
            )

        if (
            ch == separator
            and depth == 0
        ):
            part = "".join(
                current
            ).strip()

            if part:
                result.append(part)

            current = []
            continue

        current.append(ch)

    part = "".join(
        current
    ).strip()

    if part:
        result.append(part)

    return result


def first_parenthesized(text: str):
    """
    첫 번째 balanced parentheses.

    '(공C487)(e-러닝)'
        -> '공C487'

    '(온라인(녹화))'
        -> '온라인(녹화)'
    """

    start = text.find("(")

    if start == -1:
        return None

    depth = 0

    for i in range(
        start,
        len(text),
    ):
        ch = text[i]

        if ch == "(":
            depth += 1

        elif ch == ")":
            depth -= 1

            if depth == 0:
                return (
                    text[
                        start + 1:i
                    ].strip()
                )

    return None


def parse_schedule_entry(chunk: str):
    chunk = chunk.strip()

    match = DAY_TIME_RE.match(
        chunk
    )

    if not match:
        return None

    day = match.group(1)

    start_period = int(
        match.group(2)
    )

    end_period = int(
        match.group(3)
    )

    room = first_parenthesized(
        chunk[match.end():]
    )

    return {
        "day": day,
        "start_period": start_period,
        "end_period": end_period,
        "room": room,
        "raw": chunk,
    }


def parse_room_nm(room_nm: str):
    if not room_nm:
        return []

    results = []

    for chunk in split_top_level(
        room_nm
    ):
        parsed = (
            parse_schedule_entry(
                chunk
            )
        )

        if parsed:
            results.append(
                parsed
            )

    return results


def is_physical_room(room: str):
    if not room:
        return False

    room = room.strip()

    if room == "미배정":
        return False

    if room.startswith(
        "온라인"
    ):
        return False

    return True


# ======================================================================
# Building / room parsing
# ======================================================================

BUILDING_ROOM_RE = re.compile(
    r"^(.+?)(\d[\dA-Za-z_-]*)$"
)


def split_building_room(
    room_code: str,
):
    room_code = (
        room_code.strip()
    )

    match = (
        BUILDING_ROOM_RE.match(
            room_code
        )
    )

    if not match:
        return (
            room_code,
            "",
        )

    return (
        match.group(1),
        match.group(2),
    )


def room_sort_key(value: str):
    match = re.match(
        r"^(\d+)(.*)$",
        value,
    )

    if not match:
        return (
            1,
            value,
        )

    return (
        0,
        int(match.group(1)),
        match.group(2),
    )


# ======================================================================
# Current schedule analysis
# ======================================================================

def analyze_current_schedule(rows):
    physical_rooms = set()

    rooms_by_building = (
        defaultdict(set)
    )

    schedules = []

    ignored_values = set()

    for row in rows:
        raw_room_nm = (
            row.get("room_nm")
            or ""
        ).strip()

        if not raw_room_nm:
            continue

        entries = parse_room_nm(
            raw_room_nm
        )

        if not entries:
            ignored_values.add(
                raw_room_nm
            )
            continue

        for entry in entries:
            room_code = (
                entry["room"]
                or ""
            ).strip()

            if not is_physical_room(
                room_code
            ):
                if room_code:
                    ignored_values.add(
                        room_code
                    )

                continue

            building, room_number = (
                split_building_room(
                    room_code
                )
            )

            physical_rooms.add(
                room_code
            )

            rooms_by_building[
                building
            ].add(
                room_number
                or room_code
            )

            schedules.append({
                "room": room_code,

                "building": building,

                "room_number": (
                    room_number
                ),

                "day": (
                    entry["day"]
                ),

                "start_period": (
                    entry[
                        "start_period"
                    ]
                ),

                "end_period": (
                    entry[
                        "end_period"
                    ]
                ),

                "open_yy": (
                    row.get(
                        "open_yy"
                    )
                ),

                "open_sust_nm": (
                    row.get(
                        "open_sust_nm"
                    )
                ),

                "pobt_div": (
                    row.get(
                        "pobt_div"
                    )
                ),

                "pobt_div_nm": (
                    row.get(
                        "pobt_div_nm"
                    )
                ),

                "sbjt_id": (
                    row.get(
                        "sbjt_id"
                    )
                ),

                "haksu_id": (
                    row.get(
                        "haksu_id"
                    )
                ),

                "clss_no": (
                    row.get(
                        "clss_no"
                    )
                ),

                "subject_name": (
                    row.get(
                        "typl_nm"
                    )
                ),

                "professor": (
                    row.get(
                        "kor_nm"
                    )
                    or ""
                ).strip(),

                "lt_knd": (
                    row.get(
                        "lt_knd"
                    )
                ),

                "lt_knd_nm": (
                    row.get(
                        "lt_knd_nm"
                    )
                ),

                "raw_room_nm": (
                    raw_room_nm
                ),

                "raw_schedule": (
                    entry["raw"]
                ),
            })

    normalized_rooms = {}

    for building in sorted(
        rooms_by_building
    ):
        normalized_rooms[
            building
        ] = sorted(
            rooms_by_building[
                building
            ],
            key=room_sort_key,
        )

    return {
        "physical_rooms": sorted(
            physical_rooms
        ),

        "rooms_by_building": (
            normalized_rooms
        ),

        "schedules": schedules,

        "ignored_room_values": sorted(
            ignored_values
        ),
    }


# ======================================================================
# Schedule indexes
# ======================================================================

def build_room_schedule_index(
    schedules,
):
    """
    {
      "공A602": {
        "월": [...],
        "수": [...]
      }
    }
    """

    result = defaultdict(
        lambda: defaultdict(list)
    )

    for item in schedules:
        result[
            item["room"]
        ][
            item["day"]
        ].append(
            item
        )

    final = {}

    for room in sorted(result):
        final[room] = {}

        for day in result[room]:
            final[room][day] = sorted(
                result[room][day],
                key=lambda x: (
                    x["start_period"],
                    x["end_period"],
                ),
            )

    return final


# ======================================================================
# Summary
# ======================================================================

def print_summary(
    collected,
    rows,
    duplicate_count,
    analysis,
):
    print()
    print("=" * 70)
    print("RESULT")
    print("=" * 70)

    print(
        "raw collected rows    :",
        len(collected["rows"]),
    )

    print(
        "duplicate rows        :",
        duplicate_count,
    )

    print(
        "unique current rows   :",
        len(rows),
    )

    print(
        "physical classrooms   :",
        len(
            analysis[
                "physical_rooms"
            ]
        ),
    )

    print(
        "building prefixes     :",
        len(
            analysis[
                "rooms_by_building"
            ]
        ),
    )

    print(
        "schedule assignments  :",
        len(
            analysis[
                "schedules"
            ]
        ),
    )

    print(
        "failed queries        :",
        len(
            collected[
                "failed_queries"
            ]
        ),
    )

    print(
        "year anomalies        :",
        len(
            collected[
                "year_anomalies"
            ]
        ),
    )

    years = Counter(
        str(
            row.get(
                "open_yy",
                "",
            )
        )
        for row in rows
    )

    print(
        "open_yy               :",
        dict(years),
    )

    units = {
        row.get(
            "open_sust_nm"
        )
        for row in rows
        if row.get(
            "open_sust_nm"
        )
    }

    print(
        "opening units         :",
        len(units),
    )

    pobt = sorted({
        row.get(
            "pobt_div_nm"
        )
        for row in rows
        if row.get(
            "pobt_div_nm"
        )
    })

    print(
        "completion types      :",
        ", ".join(pobt),
    )

    print()
    print(
        "=== rooms by building ==="
    )

    for (
        building,
        rooms,
    ) in analysis[
        "rooms_by_building"
    ].items():
        print(
            f"{building} "
            f"({len(rooms)}): "
            + ", ".join(rooms)
        )


# ======================================================================
# Main
# ======================================================================

def main():
    parser = argparse.ArgumentParser(
        description=(
            "건국대학교 종합강의시간표 "
            "전체 수집 및 강의실 분석"
        )
    )

    parser.add_argument(
        "--year",
        default="2026",
    )

    parser.add_argument(
        "--term",
        default="B01012",
    )

    parser.add_argument(
        "--delay",
        type=float,
        default=0.25,
        help=(
            "HTTP 요청 사이 대기시간. "
            "default=0.25"
        ),
    )

    parser.add_argument(
        "--no-cache",
        action="store_true",
        help=(
            "기존 query cache를 "
            "사용하지 않고 다시 요청"
        ),
    )

    args = parser.parse_args()

    year = args.year
    term = args.term

    output_dir = (
        OUTPUT_ROOT
        / f"{year}_{term}"
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    print(
        "year :",
        year,
    )

    print(
        "term :",
        term,
    )

    print(
        "output:",
        output_dir,
    )

    print()

    # --------------------------------------------------
    # 1. 실제 브라우저 DOM에서 검색조건 발견
    # --------------------------------------------------

    discovered = discover_filters()

    save_json(
        output_dir
        / "discovered_filters.json",
        discovered,
    )

    # --------------------------------------------------
    # 2. HTTP 세션
    # --------------------------------------------------

    session = create_session()

    # --------------------------------------------------
    # 3. 전 개설단위 × 전 이수구분 조회
    # --------------------------------------------------

    collected = collect_current_rows(
        session=session,
        year=year,
        term=term,
        discovered=discovered,
        output_dir=output_dir,
        delay=args.delay,
        use_cache=(
            not args.no_cache
        ),
    )

    save_json(
        output_dir
        / "query_stats.json",
        collected[
            "query_stats"
        ],
    )

    save_json(
        output_dir
        / "failed_queries.json",
        collected[
            "failed_queries"
        ],
    )

    save_json(
        output_dir
        / "year_anomalies.json",
        collected[
            "year_anomalies"
        ],
    )

    # --------------------------------------------------
    # 4. 중복 제거
    # --------------------------------------------------

    (
        unique_rows,
        duplicate_count,
    ) = deduplicate_rows(
        collected["rows"]
    )

    save_json(
        output_dir
        / "current_rows.json",
        unique_rows,
    )

    # --------------------------------------------------
    # 5. 강의실 / 시간표 분석
    # --------------------------------------------------

    analysis = (
        analyze_current_schedule(
            unique_rows
        )
    )

    save_json(
        output_dir
        / "current_physical_rooms.json",
        analysis[
            "physical_rooms"
        ],
    )

    save_json(
        output_dir
        / "current_rooms_by_building.json",
        analysis[
            "rooms_by_building"
        ],
    )

    save_json(
        output_dir
        / "current_schedules.json",
        analysis[
            "schedules"
        ],
    )

    save_json(
        output_dir
        / "ignored_room_values.json",
        analysis[
            "ignored_room_values"
        ],
    )

    # --------------------------------------------------
    # 6. 강의실 중심 index
    # --------------------------------------------------

    room_schedule_index = (
        build_room_schedule_index(
            analysis[
                "schedules"
            ]
        )
    )

    save_json(
        output_dir
        / "room_schedule_index.json",
        room_schedule_index,
    )

    # --------------------------------------------------
    # 7. Summary
    # --------------------------------------------------

    print_summary(
        collected=collected,
        rows=unique_rows,
        duplicate_count=(
            duplicate_count
        ),
        analysis=analysis,
    )

    print()
    print("=" * 70)
    print("OUTPUT FILES")
    print("=" * 70)

    for path in sorted(
        output_dir.iterdir()
    ):
        if path.is_file():
            print(path)

    print()
    print(
        "Done."
    )


if __name__ == "__main__":
    main()
