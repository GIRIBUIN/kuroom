import unittest
from datetime import datetime

from availability import (
    AvailabilityEngine,
    AvailabilityState,
)
from periods import (
    period_end_minutes,
    period_start_minutes,
)


class AvailabilityTest(
    unittest.TestCase
):
    def setUp(self):
        room_master = [
            {
                "id": "공B352",
                "building": "공B",
                "number": "352",
            },
            {
                "id": "공B170",
                "building": "공B",
                "number": "170",
            },
            {
                "id": "새101",
                "building": "새",
                "number": "101",
            },
        ]

        schedules = [
            {
                "room": "공B352",
                "day": "월",
                "start_period": 4,
                "end_period": 6,
                "subject_name": "수업A",
            },
            {
                "room": "공B352",
                "day": "월",
                "start_period": 11,
                "end_period": 13,
                "subject_name": "수업B",
            },
        ]

        self.engine = (
            AvailabilityEngine(
                room_master,
                schedules,
            )
        )

    def test_period_conversion(self):
        self.assertEqual(
            period_start_minutes(4),
            10 * 60 + 30,
        )

        self.assertEqual(
            period_end_minutes(6),
            12 * 60,
        )

    def test_occupied_state(self):
        now = datetime(
            2026,
            10,
            12,
            11,
            0,
        )

        status = (
            self.engine
            .get_current_status(
                "공B352",
                now,
            )
        )

        self.assertEqual(
            status["state"],
            AvailabilityState.OCCUPIED,
        )

        self.assertEqual(
            status[
                "occupied_until"
            ],
            "12:00",
        )

        self.assertIsNone(
            status["free_minutes"]
        )

    def test_free_until_state(self):
        now = datetime(
            2026,
            10,
            12,
            12,
            30,
        )

        status = (
            self.engine
            .get_current_status(
                "공B352",
                now,
            )
        )

        self.assertEqual(
            status["state"],
            AvailabilityState.FREE_UNTIL,
        )

        self.assertEqual(
            status["free_minutes"],
            90,
        )

        self.assertEqual(
            status["free_until"],
            "14:00",
        )

    def test_exact_class_end_is_free(self):
        now = datetime(
            2026,
            10,
            12,
            12,
            0,
        )

        status = (
            self.engine
            .get_current_status(
                "공B352",
                now,
            )
        )

        self.assertEqual(
            status["state"],
            AvailabilityState.FREE_UNTIL,
        )

        self.assertEqual(
            status["free_minutes"],
            120,
        )

    def test_exact_60_minutes_included(self):
        now = datetime(
            2026,
            10,
            12,
            13,
            0,
        )

        result = (
            self.engine
            .find_available_rooms(
                now,
                building="공B",
                min_minutes=60,
            )
        )

        ids = {
            item["room_id"]
            for item in result
        }

        self.assertIn(
            "공B352",
            ids,
        )

    def test_59_minutes_excluded(self):
        now = datetime(
            2026,
            10,
            12,
            13,
            1,
        )

        result = (
            self.engine
            .find_available_rooms(
                now,
                building="공B",
                min_minutes=60,
            )
        )

        ids = {
            item["room_id"]
            for item in result
        }

        self.assertNotIn(
            "공B352",
            ids,
        )

    def test_same_weekday_next_week_and_minimum(self):
        now = datetime(2026, 10, 12, 16)
        status = self.engine.get_current_status("공B352", now)
        self.assertEqual(status["state"], AvailabilityState.FREE_UNTIL)
        self.assertEqual(status["next_class_day_offset"], 7)
        self.assertEqual(status["free_minutes"], 9750)
        self.assertEqual(status["free_until"], "10:30")
        for minimum, included in [(9750, True), (9751, False)]:
            with self.subTest(minimum=minimum):
                ids = [item["room_id"] for item in self.engine.find_available_rooms(now, "공B", minimum)]
                self.assertEqual("공B352" in ids, included)
                self.assertIn("공B170", ids)

    def test_empty_week_has_no_invented_duration(self):
        now = datetime(2026, 10, 12, 21, 17)
        status = self.engine.get_current_status("공B170", now)
        self.assertEqual(status["state"], AvailabilityState.FREE_ALL_WEEK)
        self.assertFalse(status["has_classes_today"])
        for key in ["next_class", "next_class_day_offset", "free_minutes", "free_until", "free_until_minutes"]:
            self.assertIsNone(status[key])
        ids = [item["room_id"] for item in self.engine.find_available_rooms(now, min_minutes=100000)]
        self.assertEqual(ids, ["공B170", "새101"])

    def test_monday_night_tuesday_and_friday_night_monday(self):
        base = self.engine.schedules[0]
        engine = AvailabilityEngine(self.engine.room_master, [
            {**base, "start_period": 1, "end_period": 1},
            {**base, "day": "화", "start_period": 1, "end_period": 1},
        ])
        for day, next_day, offset, duration in [(12, "화", 1, 703), (16, "월", 3, 3583)]:
            with self.subTest(day=day):
                now = datetime(2026, 10, day, 21, 17)
                status = engine.get_current_status("공B352", now)
                self.assertEqual(status["next_class"]["day"], next_day)
                self.assertEqual(status["next_class_day_offset"], offset)
                self.assertEqual(status["free_minutes"], duration)
                for minimum, included in [(duration, True), (duration + 1, False)]:
                    ids = [item["room_id"] for item in engine.find_available_rooms(now, "공B", minimum)]
                    self.assertEqual("공B352" in ids, included)

    def test_empty_day_uses_later_weekday(self):
        status = self.engine.get_current_status("공B352", datetime(2026, 10, 14, 12))
        self.assertFalse(status["has_classes_today"])
        self.assertEqual(status["next_class"]["day"], "월")
        self.assertEqual(status["next_class_day_offset"], 5)
        self.assertEqual(status["free_minutes"], 7110)

    def test_building_filter(self):
        now = datetime(
            2026,
            10,
            12,
            12,
            30,
        )

        result = (
            self.engine
            .find_available_rooms(
                now,
                building="공B",
            )
        )

        ids = {
            item["room_id"]
            for item in result
        }

        self.assertNotIn(
            "새101",
            ids,
        )

    def test_before_start_and_after_regular_hours(self):
        for hour, minute, duration, offset in [(8, 0, 150, 0), (9, 0, 90, 0), (20, 30, 9480, 7), (21, 17, 9433, 7)]:
            with self.subTest(hour=hour, minute=minute):
                now = datetime(2026, 10, 12, hour, minute)
                status = self.engine.get_current_status("공B352", now)
                self.assertEqual(status["state"], AvailabilityState.FREE_UNTIL)
                self.assertEqual(status["free_minutes"], duration)
                self.assertEqual(status["next_class_day_offset"], offset)
                self.assertEqual(len(self.engine.find_available_rooms(now)), 3)

    def test_exact_start_and_final_end(self):
        self.assertEqual(self.engine.get_current_status(
            "공B352", datetime(2026, 10, 12, 10, 30))["state"], AvailabilityState.OCCUPIED)
        self.assertEqual(self.engine.get_current_status(
            "공B352", datetime(2026, 10, 12, 15, 30))["next_class_day_offset"], 7)

    def test_weekend_and_late_classes_are_not_skipped(self):
        base = self.engine.schedules[0]
        engine = AvailabilityEngine(self.engine.room_master, [
            {**base, "day": "토", "start_period": 1, "end_period": 1},
            {**base, "start_period": 24, "end_period": 24},
        ])
        self.assertEqual(engine.get_current_status(
            "공B352", datetime(2026, 10, 16, 21, 17))["next_class"]["day"], "토")
        self.assertEqual(engine.get_current_status(
            "공B352", datetime(2026, 10, 12, 20, 30))["state"], AvailabilityState.OCCUPIED)

    def test_free_intervals(self):
        free = (
            self.engine
            .get_free_intervals(
                "공B352",
                "월",
            )
        )

        self.assertIn(
            (
                9 * 60,
                10 * 60 + 30,
            ),
            free,
        )


if __name__ == "__main__":
    unittest.main()
