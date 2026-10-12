import json
import re
from collections import defaultdict
from pathlib import Path


DEFAULT_OUTPUT_ROOT = Path("ku_room_output")


def load_json(path: Path):
    if not path.exists():
        raise FileNotFoundError(
            f"파일을 찾을 수 없습니다: {path}"
        )

    return json.loads(
        path.read_text(encoding="utf-8")
    )


def semester_dir(
    year: str,
    term: str,
    root: Path = DEFAULT_OUTPUT_ROOT,
) -> Path:
    return root / f"{year}_{term}"


def load_current_schedules(
    year: str,
    term: str,
    root: Path = DEFAULT_OUTPUT_ROOT,
) -> list[dict]:
    path = (
        semester_dir(year, term, root)
        / "current_schedules.json"
    )

    data = load_json(path)

    if not isinstance(data, list):
        raise ValueError(
            "current_schedules.json must contain a list"
        )

    return data


def load_current_rooms(
    year: str,
    term: str,
    root: Path = DEFAULT_OUTPUT_ROOT,
) -> list[str]:
    path = (
        semester_dir(year, term, root)
        / "current_physical_rooms.json"
    )

    data = load_json(path)

    if not isinstance(data, list):
        raise ValueError(
            "current_physical_rooms.json must contain a list"
        )

    return data


def load_room_master(
    root: Path = DEFAULT_OUTPUT_ROOT,
) -> list[dict]:
    path = root / "room_master.json"

    data = load_json(path)

    if not isinstance(data, list):
        raise ValueError(
            "room_master.json must contain a list"
        )

    return data


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


def rooms_by_building(
    room_master: list[dict],
) -> dict[str, list[dict]]:
    grouped = defaultdict(list)

    for room in room_master:
        grouped[
            room["building"]
        ].append(room)

    result = {}

    for building in sorted(grouped):
        result[building] = sorted(
            grouped[building],
            key=lambda room: room_sort_key(
                room["number"]
            ),
        )

    return result

def load_release_rooms(
    year: str,
    term: str,
    dist: Path = Path("dist"),
) -> list[dict]:
    path = (
        dist
        / f"{year}_{term}"
        / "rooms.json"
    )

    data = load_json(path)

    if not isinstance(data, list):
        raise ValueError(
            "rooms.json must contain a list"
        )

    return data


def load_release_schedules(
    year: str,
    term: str,
    dist: Path = Path("dist"),
) -> list[dict]:
    path = (
        dist
        / f"{year}_{term}"
        / "schedules.json"
    )

    data = load_json(path)

    if not isinstance(data, list):
        raise ValueError(
            "schedules.json must contain a list"
        )

    return data
