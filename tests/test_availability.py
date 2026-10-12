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

    def test_free_rest_of_day(self):
        now = datetime(
            2026,
            10,
            12,
            16,
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
            AvailabilityState.FREE_REST_OF_DAY,
        )

        self.assertTrue(
            status[
                "has_classes_today"
            ]
        )

        self.assertIsNone(
            status["free_until"]
        )

        self.assertIsNone(
            status["free_minutes"]
        )

    def test_room_without_classes(self):
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
                "공B170",
                now,
            )
        )

        self.assertEqual(
            status["state"],
            AvailabilityState.FREE_REST_OF_DAY,
        )

        self.assertFalse(
            status[
                "has_classes_today"
            ]
        )

        self.assertIsNone(
            status["free_minutes"]
        )

    def test_free_rest_of_day_not_limited_by_duration(
        self,
    ):
        now = datetime(
            2026,
            10,
            12,
            16,
            0,
        )

        result = (
            self.engine
            .find_available_rooms(
                now,
                building="공B",
                min_minutes=1000,
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

        self.assertIn(
            "공B170",
            ids,
        )

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

    def test_outside_regular_hours(self):
        now = datetime(
            2026,
            10,
            12,
            20,
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
            AvailabilityState.OUTSIDE_REGULAR_HOURS,
        )

    def test_outside_regular_hours_not_searchable(
        self,
    ):
        now = datetime(
            2026,
            10,
            12,
            20,
            0,
        )

        result = (
            self.engine
            .find_available_rooms(
                now,
                building="공B",
            )
        )

        self.assertEqual(
            result,
            [],
        )

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
