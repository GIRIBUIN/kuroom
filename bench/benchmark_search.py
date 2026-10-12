#!/usr/bin/env python3

import argparse
import gc
import hashlib
import json
import statistics
import sys
import time
import tracemalloc
from datetime import datetime
from pathlib import Path


# --------------------------------------------------
# Project import path
#
# 아래 두 방식 모두 지원:
#
# python3 bench/benchmark_search.py
# python3 -m bench.benchmark_search
# --------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(
        0,
        str(PROJECT_ROOT),
    )


from availability import AvailabilityEngine
from data_loader import (
    load_release_rooms,
    load_release_schedules,
)


DEFAULT_YEAR = "2026"
DEFAULT_TERM = "B01012"

DEFAULT_DIST = (
    PROJECT_ROOT
    / "dist"
)

DEFAULT_RESULT_DIR = (
    PROJECT_ROOT
    / "bench"
    / "results"
)


# --------------------------------------------------
# Benchmark workload
# --------------------------------------------------

QUERIES = [
    {
        "name": "mon_all_0900",
        "at": datetime(
            2026,
            10,
            12,
            9,
            0,
        ),
        "building": None,
        "min_minutes": 0,
    },
    {
        "name": "mon_gongb_1520_60",
        "at": datetime(
            2026,
            10,
            12,
            15,
            20,
        ),
        "building": "공B",
        "min_minutes": 60,
    },
    {
        "name": "mon_sae_1520_60",
        "at": datetime(
            2026,
            10,
            12,
            15,
            20,
        ),
        "building": "새",
        "min_minutes": 60,
    },
    {
        "name": "tue_all_1200_60",
        "at": datetime(
            2026,
            10,
            13,
            12,
            0,
        ),
        "building": None,
        "min_minutes": 60,
    },
    {
        "name": "wed_all_1330_60",
        "at": datetime(
            2026,
            10,
            14,
            13,
            30,
        ),
        "building": None,
        "min_minutes": 60,
    },
    {
        "name": "wed_gongb_1330_120",
        "at": datetime(
            2026,
            10,
            14,
            13,
            30,
        ),
        "building": "공B",
        "min_minutes": 120,
    },
    {
        "name": "thu_all_1600_90",
        "at": datetime(
            2026,
            10,
            15,
            16,
            0,
        ),
        "building": None,
        "min_minutes": 90,
    },
    {
        "name": "fri_all_1800_60",
        "at": datetime(
            2026,
            10,
            16,
            18,
            0,
        ),
        "building": None,
        "min_minutes": 60,
    },
]


# --------------------------------------------------
# Utility
# --------------------------------------------------

def human_bytes(
    value: int | None,
) -> str:
    if value is None:
        return "N/A"

    units = [
        "B",
        "KiB",
        "MiB",
        "GiB",
    ]

    size = float(value)

    for unit in units:
        if size < 1024:
            return (
                f"{size:.2f} {unit}"
            )

        size /= 1024

    return f"{size:.2f} TiB"


def percentile(
    values: list[float],
    ratio: float,
) -> float:
    ordered = sorted(values)

    index = round(
        (len(ordered) - 1)
        * ratio
    )

    return ordered[index]


def latency_stats(
    values_us: list[float],
) -> dict:
    return {
        "count": len(values_us),
        "mean_us": statistics.mean(
            values_us
        ),
        "p50_us": statistics.median(
            values_us
        ),
        "p95_us": percentile(
            values_us,
            0.95,
        ),
        "p99_us": percentile(
            values_us,
            0.99,
        ),
        "min_us": min(
            values_us
        ),
        "max_us": max(
            values_us
        ),
    }


def result_digest(
    room_ids: list[str],
) -> str:
    payload = "\n".join(
        sorted(room_ids)
    )

    return (
        hashlib.sha256(
            payload.encode("utf-8")
        )
        .hexdigest()
        [:16]
    )


def combined_result_digest(
    query_results: dict,
) -> str:
    digest = hashlib.sha256()

    for query in QUERIES:
        name = query["name"]

        item = query_results[
            name
        ]

        digest.update(
            name.encode("utf-8")
        )

        digest.update(
            b"\0"
        )

        for room_id in item["room_ids"]:
            digest.update(
                room_id.encode(
                    "utf-8"
                )
            )

            digest.update(
                b"\n"
            )

    return digest.hexdigest()[:16]


def current_rss_bytes() -> int | None:
    """
    Linux에서 현재 RSS를 읽는다.

    외부 psutil 의존성을 추가하지 않기 위해
    /proc/self/status를 사용한다.

    다른 OS에서는 None.
    """

    if not sys.platform.startswith(
        "linux"
    ):
        return None

    path = Path(
        "/proc/self/status"
    )

    try:
        for line in path.read_text().splitlines():
            if line.startswith(
                "VmRSS:"
            ):
                parts = line.split()

                kib = int(
                    parts[1]
                )

                return kib * 1024

    except (
        OSError,
        ValueError,
        IndexError,
    ):
        return None

    return None


def directory_file_sizes(
    root: Path,
) -> dict:
    files = {}

    if not root.exists():
        return {
            "files": {},
            "total_bytes": 0,
        }

    total = 0

    for path in sorted(
        root.rglob("*")
    ):
        if not path.is_file():
            continue

        size = path.stat().st_size

        relative = str(
            path.relative_to(root)
        )

        files[relative] = size

        total += size

    return {
        "files": files,
        "total_bytes": total,
    }


def measure_us(fn):
    start = time.perf_counter_ns()

    result = fn()

    end = time.perf_counter_ns()

    elapsed_us = (
        end - start
    ) / 1000

    return result, elapsed_us


# --------------------------------------------------
# Main
# --------------------------------------------------

def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--label",
        default="v0",
    )

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
        default=str(
            DEFAULT_DIST
        ),
    )

    parser.add_argument(
        "--iterations",
        type=int,
        default=1000,
    )

    parser.add_argument(
        "--warmup",
        type=int,
        default=100,
    )

    parser.add_argument(
        "--load-iterations",
        type=int,
        default=20,
    )

    parser.add_argument(
        "--build-iterations",
        type=int,
        default=50,
    )

    parser.add_argument(
        "--out",
    )

    args = parser.parse_args()

    dist = Path(
        args.dist
    )

    release_dir = (
        dist
        / f"{args.year}_{args.term}"
    )

    if args.out:
        output_path = Path(
            args.out
        )
    else:
        output_path = (
            DEFAULT_RESULT_DIR
            / f"{args.label}.json"
        )

    print(
        f"=== {args.label.upper()} BENCHMARK ==="
    )
    print()

    # --------------------------------------------------
    # Release file sizes
    # --------------------------------------------------

    size_info = (
        directory_file_sizes(
            release_dir
        )
    )

    print("release files")

    for name, size in (
        size_info["files"].items()
    ):
        print(
            f"  {name:<24}"
            f"{human_bytes(size):>12}"
        )

    print(
        f"  {'TOTAL':<24}"
        f"{human_bytes(size_info['total_bytes']):>12}"
    )

    print()

    # --------------------------------------------------
    # Canonical load + memory measurement
    # --------------------------------------------------

    def load_data():
        rooms = (
            load_release_rooms(
                year=args.year,
                term=args.term,
                dist=dist,
            )
        )

        schedules = (
            load_release_schedules(
                year=args.year,
                term=args.term,
                dist=dist,
            )
        )

        return (
            rooms,
            schedules,
        )

    gc.collect()

    rss_before = (
        current_rss_bytes()
    )

    tracemalloc.start()

    (
        room_master,
        schedules,
    ), first_load_us = measure_us(
        load_data
    )

    (
        traced_after_load,
        load_peak,
    ) = tracemalloc.get_traced_memory()

    rss_after_load = (
        current_rss_bytes()
    )

    tracemalloc.reset_peak()

    engine, first_build_us = (
        measure_us(
            lambda:
                AvailabilityEngine(
                    room_master,
                    schedules,
                )
        )
    )

    (
        traced_after_build,
        build_peak,
    ) = tracemalloc.get_traced_memory()

    rss_after_build = (
        current_rss_bytes()
    )

    tracemalloc.stop()

    engine_incremental_bytes = max(
        0,
        traced_after_build
        - traced_after_load,
    )

    print("dataset")
    print(
        f"  rooms       : "
        f"{len(room_master)}"
    )
    print(
        f"  schedules   : "
        f"{len(schedules)}"
    )
    print()

    print("memory")
    print(
        "  Python traced after load : "
        f"{human_bytes(traced_after_load)}"
    )
    print(
        "  Python load peak         : "
        f"{human_bytes(load_peak)}"
    )
    print(
        "  Engine incremental       : "
        f"{human_bytes(engine_incremental_bytes)}"
    )
    print(
        "  Python after engine      : "
        f"{human_bytes(traced_after_build)}"
    )
    print(
        "  Python engine-build peak : "
        f"{human_bytes(build_peak)}"
    )

    if rss_before is not None:
        print(
            "  RSS before load          : "
            f"{human_bytes(rss_before)}"
        )

        print(
            "  RSS after load           : "
            f"{human_bytes(rss_after_load)}"
        )

        print(
            "  RSS after engine         : "
            f"{human_bytes(rss_after_build)}"
        )

    print()

    # --------------------------------------------------
    # Repeated load timing
    # --------------------------------------------------

    load_samples_us = []

    for _ in range(
        args.load_iterations
    ):
        gc.collect()

        loaded, elapsed_us = (
            measure_us(
                load_data
            )
        )

        load_samples_us.append(
            elapsed_us
        )

        del loaded

    load_stats = latency_stats(
        load_samples_us
    )

    print("load")
    print(
        f"  first       : "
        f"{first_load_us / 1000:.3f} ms"
    )
    print(
        f"  iterations  : "
        f"{args.load_iterations}"
    )
    print(
        f"  mean        : "
        f"{load_stats['mean_us'] / 1000:.3f} ms"
    )
    print(
        f"  p50         : "
        f"{load_stats['p50_us'] / 1000:.3f} ms"
    )
    print(
        f"  p95         : "
        f"{load_stats['p95_us'] / 1000:.3f} ms"
    )
    print(
        f"  p99         : "
        f"{load_stats['p99_us'] / 1000:.3f} ms"
    )
    print()

    # --------------------------------------------------
    # Repeated engine/index build timing
    # --------------------------------------------------

    build_samples_us = []

    for _ in range(
        args.build_iterations
    ):
        temp_engine, elapsed_us = (
            measure_us(
                lambda:
                    AvailabilityEngine(
                        room_master,
                        schedules,
                    )
            )
        )

        build_samples_us.append(
            elapsed_us
        )

        del temp_engine

    build_stats = latency_stats(
        build_samples_us
    )

    print("engine build")
    print(
        f"  first       : "
        f"{first_build_us / 1000:.3f} ms"
    )
    print(
        f"  iterations  : "
        f"{args.build_iterations}"
    )
    print(
        f"  mean        : "
        f"{build_stats['mean_us'] / 1000:.3f} ms"
    )
    print(
        f"  p50         : "
        f"{build_stats['p50_us'] / 1000:.3f} ms"
    )
    print(
        f"  p95         : "
        f"{build_stats['p95_us'] / 1000:.3f} ms"
    )
    print(
        f"  p99         : "
        f"{build_stats['p99_us'] / 1000:.3f} ms"
    )
    print()

    # --------------------------------------------------
    # Correctness baseline
    # --------------------------------------------------

    query_results = {}

    print("query results")

    for query in QUERIES:
        result = (
            engine.find_available_rooms(
                now=query["at"],
                building=query[
                    "building"
                ],
                min_minutes=query[
                    "min_minutes"
                ],
            )
        )

        room_ids = sorted(
            item["room_id"]
            for item in result
        )

        digest = result_digest(
            room_ids
        )

        query_results[
            query["name"]
        ] = {
            "room_ids": room_ids,
            "count": len(
                room_ids
            ),
            "digest": digest,
        }

        print(
            f"  {query['name']:<24}"
            f"{len(room_ids):>4} rooms"
            f"  {digest}"
        )

    correctness_digest = (
        combined_result_digest(
            query_results
        )
    )

    print()
    print(
        "  combined digest : "
        f"{correctness_digest}"
    )
    print()

    # --------------------------------------------------
    # Warm-up
    # --------------------------------------------------

    for _ in range(
        args.warmup
    ):
        for query in QUERIES:
            engine.find_available_rooms(
                now=query["at"],
                building=query[
                    "building"
                ],
                min_minutes=query[
                    "min_minutes"
                ],
            )

    # --------------------------------------------------
    # Search latency
    # --------------------------------------------------

    samples_by_query = {
        query["name"]: []
        for query in QUERIES
    }

    overall_samples_us = []

    checksum = 0

    search_start = (
        time.perf_counter_ns()
    )

    for _ in range(
        args.iterations
    ):
        for query in QUERIES:
            start = (
                time.perf_counter_ns()
            )

            result = (
                engine.find_available_rooms(
                    now=query["at"],
                    building=query[
                        "building"
                    ],
                    min_minutes=query[
                        "min_minutes"
                    ],
                )
            )

            end = (
                time.perf_counter_ns()
            )

            elapsed_us = (
                end - start
            ) / 1000

            samples_by_query[
                query["name"]
            ].append(
                elapsed_us
            )

            overall_samples_us.append(
                elapsed_us
            )

            checksum += len(
                result
            )

    search_end = (
        time.perf_counter_ns()
    )

    search_wall_ms = (
        search_end
        - search_start
    ) / 1_000_000

    overall_stats = latency_stats(
        overall_samples_us
    )

    print("search by query")
    print(
        "  query"
        "                     "
        "mean(us)"
        "   p50"
        "   p95"
        "   p99"
    )

    query_benchmark = {}

    for query in QUERIES:
        name = query["name"]

        stats = latency_stats(
            samples_by_query[
                name
            ]
        )

        query_benchmark[
            name
        ] = stats

        print(
            f"  {name:<24}"
            f"{stats['mean_us']:>9.1f}"
            f"{stats['p50_us']:>8.1f}"
            f"{stats['p95_us']:>8.1f}"
            f"{stats['p99_us']:>8.1f}"
        )

    print()

    print("search overall")
    print(
        f"  iterations  : "
        f"{args.iterations}"
    )
    print(
        f"  query types : "
        f"{len(QUERIES)}"
    )
    print(
        f"  total calls : "
        f"{len(overall_samples_us)}"
    )
    print(
        f"  wall        : "
        f"{search_wall_ms:.3f} ms"
    )
    print(
        f"  mean        : "
        f"{overall_stats['mean_us']:.3f} us"
    )
    print(
        f"  p50         : "
        f"{overall_stats['p50_us']:.3f} us"
    )
    print(
        f"  p95         : "
        f"{overall_stats['p95_us']:.3f} us"
    )
    print(
        f"  p99         : "
        f"{overall_stats['p99_us']:.3f} us"
    )
    print(
        f"  min         : "
        f"{overall_stats['min_us']:.3f} us"
    )
    print(
        f"  max         : "
        f"{overall_stats['max_us']:.3f} us"
    )
    print(
        f"  checksum    : "
        f"{checksum}"
    )

    print()

    # --------------------------------------------------
    # Save machine-readable result
    # --------------------------------------------------

    benchmark_result = {
        "label": args.label,

        "dataset": {
            "year": args.year,
            "term": args.term,
            "rooms": len(
                room_master
            ),
            "schedules": len(
                schedules
            ),
        },

        "release": {
            "directory": str(
                release_dir
            ),
            **size_info,
        },

        "memory": {
            "python_after_load_bytes":
                traced_after_load,

            "python_load_peak_bytes":
                load_peak,

            "engine_incremental_bytes":
                engine_incremental_bytes,

            "python_after_engine_bytes":
                traced_after_build,

            "python_engine_build_peak_bytes":
                build_peak,

            "rss_before_bytes":
                rss_before,

            "rss_after_load_bytes":
                rss_after_load,

            "rss_after_engine_bytes":
                rss_after_build,
        },

        "load": {
            "first_us":
                first_load_us,

            "stats":
                load_stats,
        },

        "engine_build": {
            "first_us":
                first_build_us,

            "stats":
                build_stats,
        },

        "correctness": {
            "combined_digest":
                correctness_digest,

            "queries":
                query_results,
        },

        "search": {
            "iterations":
                args.iterations,

            "warmup":
                args.warmup,

            "total_calls":
                len(
                    overall_samples_us
                ),

            "wall_ms":
                search_wall_ms,

            "overall":
                overall_stats,

            "queries":
                query_benchmark,

            "checksum":
                checksum,
        },
    }

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path.write_text(
        json.dumps(
            benchmark_result,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        "result saved:"
    )
    print(
        f"  {output_path}"
    )


if __name__ == "__main__":
    main()
