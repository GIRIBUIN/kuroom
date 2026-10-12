#!/usr/bin/env python3

import argparse
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from data_loader import (
    load_current_rooms,
    load_current_schedules,
    load_room_master,
)


DEFAULT_ROOT = Path("ku_room_output")
DEFAULT_DIST = Path("data/releases")

TIMEZONE = "Asia/Seoul"

DAY_START = "09:00"
PERIOD_MINUTES = 30
DEFAULT_LAST_PERIOD = 19


def write_json(
    path: Path,
    data,
):
    path.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def build_release(
    year: str,
    term: str,
    root: Path,
    dist: Path,
):
    # --------------------------------------------------
    # Source data
    # --------------------------------------------------

    room_master = load_room_master(
        root
    )

    current_room_ids = load_current_rooms(
        year=year,
        term=term,
        root=root,
    )

    source_schedules = load_current_schedules(
        year=year,
        term=term,
        root=root,
    )

    # --------------------------------------------------
    # Current-semester rooms only
    # --------------------------------------------------

    master_by_id = {
        room["id"]: room
        for room in room_master
    }

    current_room_set = set(
        current_room_ids
    )

    missing_room_metadata = sorted(
        room_id
        for room_id in current_room_set
        if room_id not in master_by_id
    )

    if missing_room_metadata:
        raise RuntimeError(
            "room_master에 없는 강의실이 있습니다:\n"
            + "\n".join(
                missing_room_metadata
            )
        )

    # master 순서를 유지한다.
    # release에는 서비스에 필요한 필드만 남긴다.
    rooms = [
        {
            "id": room["id"],
            "building": room["building"],
            "number": room["number"],
        }
        for room in room_master
        if room["id"] in current_room_set
    ]

    # --------------------------------------------------
    # Validate schedules
    # --------------------------------------------------

    schedule_room_ids = {
        item["room"]
        for item in source_schedules
    }

    unknown_schedule_rooms = sorted(
        schedule_room_ids
        - current_room_set
    )

    if unknown_schedule_rooms:
        raise RuntimeError(
            "현재 학기 강의실 목록에 없는 "
            "schedule room이 있습니다:\n"
            + "\n".join(
                unknown_schedule_rooms
            )
        )

    # --------------------------------------------------
    # Slim schedules for runtime/web
    #
    # 검색에 필요한 4개:
    # room, day, start_period, end_period
    #
    # 상세 UI에 필요한 2개:
    # subject_name, professor
    # --------------------------------------------------

    schedules = [
        {
            "room": item["room"],
            "day": item["day"],
            "start_period": item[
                "start_period"
            ],
            "end_period": item[
                "end_period"
            ],
            "subject_name": item.get(
                "subject_name",
                "",
            ),
            "professor": item.get(
                "professor",
                "",
            ),
        }
        for item in source_schedules
    ]

    # --------------------------------------------------
    # Manifest
    # --------------------------------------------------

    manifest = {
        "schema_version": 1,
        "university": "konkuk",
        "year": year,
        "term": term,
        "timezone": TIMEZONE,
        "generated_at": (
            datetime.now(
                ZoneInfo(TIMEZONE)
            ).isoformat(
                timespec="seconds"
            )
        ),
        "time_grid": {
            "day_start": DAY_START,
            "period_minutes":
                PERIOD_MINUTES,
            "default_last_period":
                DEFAULT_LAST_PERIOD,
        },
        "room_count": len(rooms),
        "schedule_count": len(
            schedules
        ),
    }

    # --------------------------------------------------
    # Output
    # --------------------------------------------------

    release_dir = (
        dist
        / f"{year}_{term}"
    )

    release_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    write_json(
        release_dir / "rooms.json",
        rooms,
    )

    write_json(
        release_dir / "schedules.json",
        schedules,
    )

    write_json(
        release_dir / "manifest.json",
        manifest,
    )

    print("release built:")
    print(release_dir)
    print()
    print(
        "rooms     :",
        len(rooms),
    )
    print(
        "schedules :",
        len(schedules),
    )


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--year",
        required=True,
    )

    parser.add_argument(
        "--term",
        required=True,
    )

    parser.add_argument(
        "--root",
        default=str(
            DEFAULT_ROOT
        ),
    )

    parser.add_argument(
        "--dist",
        default=str(
            DEFAULT_DIST
        ),
    )

    args = parser.parse_args()

    build_release(
        year=args.year,
        term=args.term,
        root=Path(args.root),
        dist=Path(args.dist),
    )


if __name__ == "__main__":
    main()
