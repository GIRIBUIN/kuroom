from collections import defaultdict
from datetime import datetime
from enum import Enum

from periods import (
    DAY_START_MINUTES,
    DEFAULT_LAST_PERIOD,
    format_minutes,
    period_end_minutes,
    period_range_minutes,
)


class AvailabilityState(str, Enum):
    OCCUPIED = "occupied"
    FREE_UNTIL = "free_until"
    FREE_ALL_WEEK = "free_all_week"


WEEKDAY_TO_KR = {
    0: "월",
    1: "화",
    2: "수",
    3: "목",
    4: "금",
    5: "토",
    6: "일",
}


def datetime_day_name(
    value: datetime,
) -> str:
    return WEEKDAY_TO_KR[value.weekday()]


def merge_intervals(
    intervals: list[tuple[int, int]],
) -> list[tuple[int, int]]:
    if not intervals:
        return []

    intervals = sorted(intervals)

    merged = [list(intervals[0])]

    for start, end in intervals[1:]:
        previous = merged[-1]

        if start <= previous[1]:
            previous[1] = max(
                previous[1],
                end,
            )
        else:
            merged.append(
                [start, end]
            )

    return [
        (start, end)
        for start, end in merged
    ]


def invert_intervals(
    busy: list[tuple[int, int]],
    start: int,
    end: int,
) -> list[tuple[int, int]]:
    busy = merge_intervals(busy)

    result = []
    cursor = start

    for busy_start, busy_end in busy:
        busy_start = max(
            busy_start,
            start,
        )

        busy_end = min(
            busy_end,
            end,
        )

        if busy_end <= start:
            continue

        if busy_start >= end:
            break

        if cursor < busy_start:
            result.append(
                (
                    cursor,
                    busy_start,
                )
            )

        cursor = max(
            cursor,
            busy_end,
        )

    if cursor < end:
        result.append(
            (
                cursor,
                end,
            )
        )

    return result


class AvailabilityEngine:
    def __init__(
        self,
        room_master: list[dict],
        schedules: list[dict],
    ):
        self.room_master = room_master
        self.schedules = schedules

        self.rooms = {
            room["id"]: room
            for room in room_master
        }

        self.schedule_index = defaultdict(
            lambda: defaultdict(list)
        )

        max_end_period = DEFAULT_LAST_PERIOD

        for schedule in schedules:
            room = schedule.get("room")
            day = schedule.get("day")

            if not room or not day:
                continue

            self.schedule_index[
                room
            ][
                day
            ].append(schedule)

            end_period = int(
                schedule["end_period"]
            )

            max_end_period = max(
                max_end_period,
                end_period,
            )

        self.last_period = max_end_period

        self.day_start_minutes = (
            DAY_START_MINUTES
        )

        self.day_end_minutes = (
            period_end_minutes(
                self.last_period
            )
        )

        for room in self.schedule_index:
            for day in self.schedule_index[room]:
                self.schedule_index[
                    room
                ][
                    day
                ].sort(
                    key=lambda x: (
                        int(
                            x["start_period"]
                        ),
                        int(
                            x["end_period"]
                        ),
                    )
                )

    def get_room(
        self,
        room_id: str,
    ) -> dict | None:
        return self.rooms.get(
            room_id
        )

    def get_day_schedules(
        self,
        room_id: str,
        day: str,
    ) -> list[dict]:
        return list(
            self.schedule_index[
                room_id
            ][
                day
            ]
        )

    def schedule_interval(
        self,
        schedule: dict,
    ) -> tuple[int, int]:
        return period_range_minutes(
            int(
                schedule[
                    "start_period"
                ]
            ),
            int(
                schedule[
                    "end_period"
                ]
            ),
        )

    def get_busy_intervals(
        self,
        room_id: str,
        day: str,
    ) -> list[tuple[int, int]]:
        intervals = [
            self.schedule_interval(
                schedule
            )
            for schedule
            in self.get_day_schedules(
                room_id,
                day,
            )
        ]

        return merge_intervals(
            intervals
        )

    def get_free_intervals(
        self,
        room_id: str,
        day: str,
    ) -> list[tuple[int, int]]:
        return invert_intervals(
            self.get_busy_intervals(
                room_id,
                day,
            ),
            self.day_start_minutes,
            self.day_end_minutes,
        )

    def get_room_day_detail(
        self,
        room_id: str,
        day: str,
    ) -> dict:
        classes = []

        for schedule in self.get_day_schedules(
            room_id,
            day,
        ):
            start, end = (
                self.schedule_interval(
                    schedule
                )
            )

            classes.append({
                **schedule,
                "start_minutes": start,
                "end_minutes": end,
                "start": format_minutes(
                    start
                ),
                "end": format_minutes(
                    end
                ),
            })

        free = [
            {
                "start_minutes": start,
                "end_minutes": end,
                "start": format_minutes(
                    start
                ),
                "end": format_minutes(
                    end
                ),
                "minutes": end - start,
            }
            for start, end
            in self.get_free_intervals(
                room_id,
                day,
            )
        ]

        return {
            "room": self.get_room(
                room_id
            ),
            "day": day,
            "classes": classes,
            "free": free,
        }

    def get_current_status(
        self,
        room_id: str,
        now: datetime,
    ) -> dict:
        day = datetime_day_name(now)

        now_minutes = (
            now.hour * 60
            + now.minute
        )

        room = self.get_room(
            room_id
        )

        schedules = (
            self.get_day_schedules(
                room_id,
                day,
            )
        )

        has_classes_today = bool(
            schedules
        )

        intervals = [
            (
                schedule,
                *self.schedule_interval(
                    schedule
                ),
            )
            for schedule
            in schedules
        ]

        current_classes = [
            (
                schedule,
                start,
                end,
            )
            for schedule, start, end
            in intervals
            if start
            <= now_minutes
            < end
        ]

        if current_classes:
            occupied_until = max(
                end
                for _, _, end
                in current_classes
            )

            return {
                "state":
                    AvailabilityState.OCCUPIED,

                "room": room,
                "room_id": room_id,
                "day": day,

                "has_classes_today":
                    has_classes_today,

                "current_classes": [
                    schedule
                    for schedule, _, _
                    in current_classes
                ],

                "next_class": None,
                "next_class_day_offset": None,

                "occupied_until_minutes":
                    occupied_until,

                "occupied_until":
                    format_minutes(
                        occupied_until
                    ),

                "free_until_minutes":
                    None,

                "free_until":
                    None,

                "free_minutes":
                    None,
            }

        base = {
            "room": room,
            "room_id": room_id,
            "day": day,
            "has_classes_today": has_classes_today,
            "current_classes": [],
            "next_class": None,
            "next_class_day_offset": None,
            "occupied_until_minutes": None,
            "occupied_until": None,
            "free_until_minutes": None,
            "free_until": None,
            "free_minutes": None,
        }

        # Day 7 includes today's earlier classes recurring next week.
        # Keep actual weekend classes in the cycle as well.
        for offset in range(8):
            next_day = WEEKDAY_TO_KR[(now.weekday() + offset) % 7]
            future = [
                (schedule, self.schedule_interval(schedule)[0])
                for schedule in self.get_day_schedules(room_id, next_day)
                if offset * 1440 + self.schedule_interval(schedule)[0] > now_minutes
            ]
            if future:
                next_schedule, next_start = min(future, key=lambda item: item[1])
                return {
                    **base,
                    "state": AvailabilityState.FREE_UNTIL,
                    "next_class": next_schedule,
                    "next_class_day_offset": offset,
                    "free_until_minutes": next_start,
                    "free_until": format_minutes(next_start),
                    "free_minutes": offset * 1440 + next_start - now_minutes,
                }

        # No arbitrary closing time when the entire weekly timetable is empty.
        return {**base, "state": AvailabilityState.FREE_ALL_WEEK}

    def find_available_rooms(
        self,
        now: datetime,
        building: str | None = None,
        min_minutes: int = 0,
    ) -> list[dict]:
        result = []

        for room in self.room_master:
            if (
                building is not None
                and room["building"]
                != building
            ):
                continue

            status = (
                self.get_current_status(
                    room["id"],
                    now,
                )
            )

            state = status["state"]

            if state == AvailabilityState.OCCUPIED:
                continue

            if (
                state
                == AvailabilityState.FREE_UNTIL
            ):
                if (
                    status["free_minutes"]
                    < min_minutes
                ):
                    continue

            # FREE_ALL_WEEK has no finite duration; include it at any minimum.

            result.append(
                status
            )

        result.sort(
            key=lambda x: (
                x["room"]["building"],
                _room_number_sort_key(
                    x["room"]["number"]
                ),
            )
        )

        return result


def _room_number_sort_key(
    value: str,
):
    import re

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
