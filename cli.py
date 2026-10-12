#!/usr/bin/env python3

import argparse
from datetime import datetime
from pathlib import Path

from availability import (
    AvailabilityEngine,
    AvailabilityState,
    datetime_day_name,
)
from data_loader import (
    load_release_rooms,
    load_release_schedules,
    rooms_by_building,
)


DEFAULT_YEAR = "2026"
DEFAULT_TERM = "B01012"


def parse_datetime(
    value: str | None,
) -> datetime:
    if value is None:
        return datetime.now().astimezone()

    return datetime.strptime(
        value,
        "%Y-%m-%d %H:%M",
    )


def create_engine(
    year: str,
    term: str,
    dist: Path,
):
    room_master = load_release_rooms(
        year=year,
        term=term,
        dist=dist,
    )

    schedules = load_release_schedules(
        year=year,
        term=term,
        dist=dist,
    )

    return AvailabilityEngine(
        room_master=room_master,
        schedules=schedules,
    )


def availability_description(
    status: dict,
) -> str:
    state = status["state"]

    if (
        state
        == AvailabilityState.FREE_ALL_WEEK
    ):
        return "다음 수업 없음"

    if (
        state
        == AvailabilityState.FREE_UNTIL
    ):
        offset = status["next_class_day_offset"]
        day = "" if offset == 0 else (
            ("다음 주 " if offset == 7 else "")
            + status["next_class"]["day"] + " "
        )
        return (
            f"{status['free_minutes']}분"
            f" · 다음 수업 {day}{status['free_until']}"
        )

    raise ValueError(
        "available 상태가 아닙니다: "
        f"{state}"
    )


def status_text(
    status: dict,
) -> str:
    state = status["state"]

    if state == AvailabilityState.OCCUPIED:
        return (
            "수업 중"
            f" · {status['occupied_until']}"
            " 종료"
        )

    if state in (AvailabilityState.FREE_ALL_WEEK, AvailabilityState.FREE_UNTIL):
        return f"비어 있음 · {availability_description(status)}"

    raise ValueError(
        f"알 수 없는 상태: {state}"
    )


def command_buildings(
    engine: AvailabilityEngine,
    now: datetime,
):
    grouped = rooms_by_building(
        engine.room_master
    )

    available = (
        engine.find_available_rooms(
            now=now,
        )
    )

    available_counts = {}

    for status in available:
        building = (
            status["room"]["building"]
        )

        available_counts[
            building
        ] = (
            available_counts.get(
                building,
                0,
            )
            + 1
        )

    print(
        f"기준 시각: "
        f"{now:%Y-%m-%d %H:%M}"
    )

    print()

    for building, rooms in grouped.items():
        available_count = (
            available_counts.get(
                building,
                0,
            )
        )

        print(
            f"{building:<10} "
            f"{available_count:>3}"
            f"/{len(rooms):<3} 비어 있음"
        )


def command_rooms(
    engine: AvailabilityEngine,
    building: str,
    now: datetime,
):
    rooms = [
        room
        for room
        in engine.room_master
        if room["building"]
        == building
    ]

    if not rooms:
        raise SystemExit(
            f"건물을 찾을 수 없습니다: "
            f"{building}"
        )

    print(
        f"{building} / "
        f"{now:%Y-%m-%d %H:%M}"
    )

    print()

    for room in rooms:
        status = (
            engine.get_current_status(
                room["id"],
                now,
            )
        )

        print(
            f"{room['id']:<15}"
            f"{status_text(status)}"
        )


def command_room(
    engine: AvailabilityEngine,
    room_id: str,
    now: datetime,
    day: str | None,
):
    room = engine.get_room(
        room_id
    )

    if room is None:
        raise SystemExit(
            f"강의실을 찾을 수 없습니다: "
            f"{room_id}"
        )

    if day is None:
        day = datetime_day_name(now)

    detail = (
        engine.get_room_day_detail(
            room_id,
            day,
        )
    )

    print(
        f"{room_id} / {day}요일"
    )

    print()

    if day == datetime_day_name(now):
        status = (
            engine.get_current_status(
                room_id,
                now,
            )
        )

        print(
            "현재 상태:",
            status_text(status),
        )

        print()

    print("=== 수업 시간 ===")

    if not detail["classes"]:
        print(
            "정규수업 없음"
        )

    for item in detail["classes"]:
        subject = (
            item.get(
                "subject_name"
            )
            or "-"
        )

        professor = (
            item.get(
                "professor"
            )
            or ""
        )

        print(
            f"{item['start']}"
            f" ~ "
            f"{item['end']}"
            f"  {subject}"
            f"  {professor}"
        )

    print()
    print("=== 빈 시간 ===")

    for item in detail["free"]:
        print(
            f"{item['start']}"
            f" ~ "
            f"{item['end']}"
            f"  ({item['minutes']}분)"
        )


def command_available(
    engine: AvailabilityEngine,
    now: datetime,
    building: str | None,
    min_minutes: int,
):
    rooms = (
        engine.find_available_rooms(
            now=now,
            building=building,
            min_minutes=min_minutes,
        )
    )

    print(
        f"기준 시각: "
        f"{now:%Y-%m-%d %H:%M}"
    )

    print(
        f"최소 이용 가능 시간: "
        f"{min_minutes}분"
    )

    if building:
        print(
            f"건물: {building}"
        )

    print()

    print(
        f"총 {len(rooms)}개"
    )

    print()

    for status in rooms:
        room = status["room"]

        print(
            f"{room['id']:<15}"
            f"{availability_description(status)}"
        )


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--year",
        default=DEFAULT_YEAR,
    )

    parser.add_argument(
        "--term",
        default=DEFAULT_TERM,
    )

    parser.add_argument(
        "--dist",
        default="dist",
    )

    sub = parser.add_subparsers(
        dest="command",
        required=True,
    )

    p_buildings = sub.add_parser(
        "buildings"
    )

    p_buildings.add_argument(
        "--at",
    )

    p_rooms = sub.add_parser(
        "rooms"
    )

    p_rooms.add_argument(
        "building",
    )

    p_rooms.add_argument(
        "--at",
    )

    p_room = sub.add_parser(
        "room"
    )

    p_room.add_argument(
        "room_id",
    )

    p_room.add_argument(
        "--day",
        choices=[
            "월",
            "화",
            "수",
            "목",
            "금",
            "토",
            "일",
        ],
    )

    p_room.add_argument(
        "--at",
    )

    p_available = sub.add_parser(
        "available"
    )

    p_available.add_argument(
        "--building",
    )

    p_available.add_argument(
        "--min",
        dest="min_minutes",
        type=int,
        default=0,
    )

    p_available.add_argument(
        "--at",
    )

    args = parser.parse_args()

    dist = Path(
        args.dist
    )

    engine = create_engine(
        year=args.year,
        term=args.term,
        dist=dist,
    )

    if args.command == "buildings":
        command_buildings(
            engine,
            parse_datetime(
                args.at
            ),
        )

    elif args.command == "rooms":
        command_rooms(
            engine,
            args.building,
            parse_datetime(
                args.at
            ),
        )

    elif args.command == "room":
        command_room(
            engine,
            args.room_id,
            parse_datetime(
                args.at
            ),
            args.day,
        )

    elif args.command == "available":
        command_available(
            engine,
            parse_datetime(
                args.at
            ),
            args.building,
            args.min_minutes,
        )


if __name__ == "__main__":
    main()
