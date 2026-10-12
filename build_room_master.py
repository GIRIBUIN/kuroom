#!/usr/bin/env python3

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


DEFAULT_ROOT = Path("ku_room_output")

BUILDING_ROOM_RE = re.compile(
    r"^(.+?)(\d[\dA-Za-z_-]*)$"
)


def load_json(path: Path):
    return json.loads(
        path.read_text(encoding="utf-8")
    )


def split_building_room(
    room_code: str,
) -> tuple[str, str]:
    room_code = room_code.strip()

    match = BUILDING_ROOM_RE.match(
        room_code
    )

    if not match:
        return room_code, ""

    return (
        match.group(1),
        match.group(2),
    )


def room_sort_key(room: dict):
    number = room["number"]

    match = re.match(
        r"^(\d+)(.*)$",
        number,
    )

    if not match:
        number_key = (1, number)
    else:
        number_key = (
            0,
            int(match.group(1)),
            match.group(2),
        )

    return (
        room["building"],
        number_key,
    )


def source_label(path: Path) -> str:
    parent = path.parent.name

    if re.match(
        r"^\d{4}_B\d+$",
        parent,
    ):
        return parent

    return str(path)


def find_room_sources(
    root: Path,
) -> list[Path]:
    sources = []

    # 현재/과거 각 학기의 실제 관측 강의실
    sources.extend(
        root.rglob(
            "current_physical_rooms.json"
        )
    )

    # 예전 broad dump 결과가 있다면 포함
    legacy = root / "physical_rooms.json"

    if legacy.exists():
        sources.append(legacy)

    # 중복 path 제거
    return sorted(set(sources))


def build_room_master(
    root: Path,
) -> list[dict]:
    sources = find_room_sources(root)

    if not sources:
        raise RuntimeError(
            "강의실 source 파일을 찾지 못했습니다.\n"
            "먼저 ku_room_scan.py를 실행하세요."
        )

    rooms = defaultdict(
        lambda: {
            "sources": set(),
        }
    )

    print("=== Room sources ===")

    for path in sources:
        values = load_json(path)

        if not isinstance(values, list):
            print(
                f"SKIP {path}: list가 아님"
            )
            continue

        label = source_label(path)

        print(
            f"{path}: {len(values)} rooms"
        )

        for room_code in values:
            if not isinstance(
                room_code,
                str,
            ):
                continue

            room_code = room_code.strip()

            if not room_code:
                continue

            rooms[
                room_code
            ]["sources"].add(label)

    result = []

    for room_code, metadata in rooms.items():
        building, number = (
            split_building_room(
                room_code
            )
        )

        result.append({
            "id": room_code,
            "building": building,
            "number": number,
            "seen_count": len(
                metadata["sources"]
            ),
            "sources": sorted(
                metadata["sources"]
            ),
        })

    result.sort(
        key=room_sort_key
    )

    return result


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--root",
        default="ku_room_output",
    )

    args = parser.parse_args()

    root = Path(args.root)

    master = build_room_master(root)

    output = root / "room_master.json"

    output.write_text(
        json.dumps(
            master,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    buildings = {
        room["building"]
        for room in master
    }

    print()
    print("=== RESULT ===")
    print(
        "rooms     :",
        len(master),
    )
    print(
        "buildings :",
        len(buildings),
    )
    print(
        "output    :",
        output,
    )


if __name__ == "__main__":
    main()
