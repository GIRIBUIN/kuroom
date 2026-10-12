from datetime import time


DAY_START_MINUTES = 9 * 60
PERIOD_MINUTES = 30

# 현재 확인된 시간표 기준.
# 실제 데이터에 더 큰 교시가 있으면 availability.py에서 자동 확장한다.
DEFAULT_LAST_PERIOD = 19


def period_start_minutes(period: int) -> int:
    """
    1교시 = 09:00 시작
    4교시 = 10:30 시작
    """
    if period < 1:
        raise ValueError("period must be >= 1")

    return DAY_START_MINUTES + (period - 1) * PERIOD_MINUTES


def period_end_minutes(period: int) -> int:
    """
    해당 교시가 끝나는 시각.

    예:
        6교시 종료 = 12:00
    """
    if period < 1:
        raise ValueError("period must be >= 1")

    return DAY_START_MINUTES + period * PERIOD_MINUTES


def period_range_minutes(
    start_period: int,
    end_period: int,
) -> tuple[int, int]:
    if start_period > end_period:
        raise ValueError(
            "start_period must be <= end_period"
        )

    return (
        period_start_minutes(start_period),
        period_end_minutes(end_period),
    )


def clock_to_minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def minutes_to_time(value: int) -> time:
    if value < 0:
        raise ValueError("minutes must be >= 0")

    hour = value // 60
    minute = value % 60

    if hour >= 24:
        raise ValueError(
            "minutes must be within one day"
        )

    return time(hour=hour, minute=minute)


def format_minutes(value: int | None) -> str:
    if value is None:
        return "-"

    hour = value // 60
    minute = value % 60

    return f"{hour:02d}:{minute:02d}"
