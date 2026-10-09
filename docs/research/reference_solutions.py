"""Учебные решения TASK-016…019. Python 3.10+, только стандартная библиотека.

Запуск проверок: python reference_solutions.py
Это функциональные модели, не код управления реальным оборудованием и не
реализация жёсткого real-time. Lock и планировщик Python не гарантируют deadline.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from itertools import product
import math
import random
from threading import Lock
import unittest


def _finite_nonnegative(value: object) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(value) and value >= 0
    except (ValueError, OverflowError):
        return False


@dataclass(frozen=True)
class Sample:
    seq: int
    timestamp: float
    value: float  # В этом примере полезная нагрузка — одно конечное число.


class LatestSample:
    """Один непрочитанный снимок; все связанные поля защищены одной блокировкой.

    publish возвращает False при нарушении контракта образца.
    take потребляет образец даже при отклонении по возрасту/будущему времени.
    Счётчики доступны согласованной копией через stats().
    """

    def __init__(self) -> None:
        self._lock = Lock()
        self._pending: Sample | None = None
        self._last_seq = -1
        self._last_timestamp = -1.0
        self._counters = {
            "accepted": 0, "rejected": 0, "overwritten": 0,
            "taken": 0, "stale": 0, "future": 0,
        }

    def publish(self, sample: Sample) -> bool:
        if not isinstance(sample, Sample):
            raise TypeError("Ожидается Sample")
        valid_value = (
            not isinstance(sample.value, bool)
            and isinstance(sample.value, (int, float))
        )
        if valid_value:
            try:
                valid_value = math.isfinite(sample.value)
            except (ValueError, OverflowError):
                valid_value = False
        valid = (
            isinstance(sample.seq, int) and not isinstance(sample.seq, bool)
            and sample.seq >= 0
            and _finite_nonnegative(sample.timestamp)
            and valid_value
        )
        with self._lock:
            if (
                not valid or sample.seq <= self._last_seq
                or sample.timestamp < self._last_timestamp
            ):
                self._counters["rejected"] += 1
                return False
            if self._pending is not None:
                self._counters["overwritten"] += 1
            self._pending = sample
            self._last_seq = sample.seq
            self._last_timestamp = sample.timestamp
            self._counters["accepted"] += 1
            return True

    def take(self, now: float, max_age: float) -> Sample | None:
        # Ошибка аргумента не должна потреблять pending.
        if not _finite_nonnegative(now) or not _finite_nonnegative(max_age):
            raise ValueError("now и max_age должны быть конечными числами >= 0")
        with self._lock:
            sample = self._pending
            if sample is None:
                return None
            self._pending = None
            age = now - sample.timestamp
            if age < 0:
                self._counters["future"] += 1
                return None
            if age > max_age:
                self._counters["stale"] += 1
                return None
            self._counters["taken"] += 1
            return sample

    def stats(self) -> dict[str, int]:
        with self._lock:
            return dict(self._counters)


class FrameParser:
    """TASK-018: AA LEN PAYLOAD CHECK. CHECK — сумма, НЕ CRC.

    После feed сохраняется не более 18 байтов неполного кандидата.
    Максимум во время добавления последнего байта кадра — 19 байтов.
    Возвращаемый список может содержать много кадров, если вход большой.
    Временной политики нет: потерянный остаток кадра требует reset по контракту
    внешнего слоя. Этот формат не защищает от намеренной подделки.
    """
    SOF = 0xAA
    MAX_PAYLOAD = 16

    def __init__(self) -> None:
        self._buffer = bytearray()
        self.frames = 0
        self.invalid_length = 0
        self.invalid_checksum = 0

    @property
    def pending_size(self) -> int:
        return len(self._buffer)

    def reset(self) -> None:
        self._buffer.clear()

    def feed(self, data: bytes | bytearray) -> list[bytes]:
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError("feed ожидает bytes или bytearray")
        results: list[bytes] = []
        for byte in data:
            self._buffer.append(byte)
            while self._buffer:
                start = self._buffer.find(self.SOF)
                if start < 0:
                    self._buffer.clear()
                    break
                if start:
                    del self._buffer[:start]
                if len(self._buffer) < 2:
                    break
                length = self._buffer[1]
                if length > self.MAX_PAYLOAD:
                    self.invalid_length += 1
                    del self._buffer[0]
                    continue
                total = length + 3
                if len(self._buffer) < total:
                    break
                payload = bytes(self._buffer[2:2 + length])
                check = (length + sum(payload)) & 0xFF
                if self._buffer[total - 1] == check:
                    results.append(payload)
                    self.frames += 1
                    del self._buffer[:total]
                else:
                    self.invalid_checksum += 1
                    del self._buffer[0]
        assert len(self._buffer) <= 18
        return results


def make_frame(payload: bytes) -> bytes:
    if not isinstance(payload, bytes):
        raise TypeError("payload должен иметь тип bytes")
    if len(payload) > 16:
        raise ValueError("Слишком длинная нагрузка")
    return bytes((0xAA, len(payload))) + payload + bytes(((len(payload) + sum(payload)) & 0xFF,))


class State(Enum):
    IDLE = "IDLE"
    READY = "READY"
    RUNNING = "RUNNING"
    FAULT = "FAULT"


def next_state(
    state: State, *, configured: bool, reference_valid: bool,
    start_edge: bool, fault: bool, reset_edge: bool, safety_permit: bool,
) -> State:
    """Строго функциональная учебная модель TASK-016, не защитная цепь."""
    if not isinstance(state, State):
        raise TypeError("Неизвестное состояние")
    flags = (configured, reference_valid, start_edge, fault, reset_edge, safety_permit)
    if any(type(v) is not bool for v in flags):
        raise TypeError("Входы должны иметь тип bool")
    if fault or not safety_permit:
        return State.FAULT
    if state is State.FAULT:
        return State.IDLE if reset_edge else State.FAULT
    ready = configured and reference_valid
    if state is State.RUNNING:
        return State.RUNNING if ready else State.FAULT
    if state is State.READY:
        if not ready:
            return State.IDLE
        return State.RUNNING if start_edge else State.READY
    return State.READY if ready else State.IDLE


def valid_schedule(schedule: list[tuple[str, str]], edges: set[frozenset[str]]) -> bool:
    """Проверяет только заданные графовые ограничения TASK-019."""
    if not schedule:
        return False
    vertices = set().union(*edges) if edges else set()
    for a, b in schedule:
        if a == b or a not in vertices or b not in vertices:
            return False
    for (a0, b0), (a1, b1) in zip(schedule, schedule[1:]):
        if a0 != a1 and frozenset((a0, a1)) not in edges:
            return False
        if b0 != b1 and frozenset((b0, b1)) not in edges:
            return False
        if a0 == b1 and b0 == a1:
            return False
    return True


class LatestSampleTests(unittest.TestCase):
    def test_empty(self):
        self.assertIsNone(LatestSample().take(0, 1))

    def test_overwrite_and_consume(self):
        q = LatestSample()
        q.publish(Sample(1, 1, 10))
        q.publish(Sample(2, 2, 20))
        self.assertEqual(q.take(2, 0), Sample(2, 2, 20))
        self.assertIsNone(q.take(2, 0))
        self.assertEqual(q.stats()["overwritten"], 1)

    def test_exact_age_boundary(self):
        q = LatestSample()
        q.publish(Sample(0, 1, 0))
        self.assertIsNotNone(q.take(1.5, 0.5))

    def test_stale_is_consumed(self):
        q = LatestSample()
        q.publish(Sample(1, 1, 0))
        self.assertIsNone(q.take(2, 0.5))
        self.assertIsNone(q.take(2, 3))
        self.assertEqual(q.stats()["stale"], 1)

    def test_future_is_consumed(self):
        q = LatestSample()
        q.publish(Sample(1, 2, 0))
        self.assertIsNone(q.take(1, 4))
        self.assertEqual(q.stats()["future"], 1)
        self.assertIsNone(q.take(3, 4))

    def test_seq_not_forgotten_after_take(self):
        q = LatestSample()
        q.publish(Sample(3, 1, 0))
        q.take(1, 0)
        self.assertFalse(q.publish(Sample(3, 1, 0)))
        self.assertFalse(q.publish(Sample(2, 1, 0)))

    def test_time_cannot_regress(self):
        q = LatestSample()
        self.assertTrue(q.publish(Sample(0, 5, 1)))
        self.assertFalse(q.publish(Sample(1, 4, 1)))
        self.assertTrue(q.publish(Sample(1, 5, 1)))

    def test_invalid_samples(self):
        q = LatestSample()
        for s in (Sample(-1, 1, 0), Sample(True, 1, 0), Sample(1, -1, 0),
                  Sample(1, math.nan, 0), Sample(1, math.inf, 0), Sample(1, 1, math.nan)):
            self.assertFalse(q.publish(s))
        self.assertEqual(q.stats()["rejected"], 6)

    def test_bad_take_does_not_consume(self):
        q = LatestSample()
        q.publish(Sample(1, 1, 0))
        for now, age in ((math.nan, 1), (1, math.inf), (-1, 1), (1, -1)):
            with self.assertRaises(ValueError):
                q.take(now, age)
        self.assertIsNotNone(q.take(1, 0))

    def test_stats_returns_copy(self):
        q = LatestSample()
        external = q.stats()
        external["accepted"] = 999
        self.assertEqual(q.stats()["accepted"], 0)


class FrameParserTests(unittest.TestCase):
    def test_empty_payload(self):
        self.assertEqual(FrameParser().feed(bytes.fromhex("AA 00 00")), [b""])

    def test_known_payload(self):
        self.assertEqual(FrameParser().feed(bytes.fromhex("AA 02 01 02 05")), [b"\x01\x02"])

    def test_one_byte_chunks(self):
        p = FrameParser()
        out = []
        for byte in make_frame(b"abc"):
            out.extend(p.feed(bytes([byte])))
        self.assertEqual(out, [b"abc"])

    def test_concatenation_and_noise(self):
        p = FrameParser()
        self.assertEqual(p.feed(b"noise" + make_frame(b"a") + make_frame(b"b")), [b"a", b"b"])

    def test_invalid_length(self):
        p = FrameParser()
        self.assertEqual(p.feed(bytes.fromhex("AA 11") + make_frame(b"ok")), [b"ok"])
        self.assertEqual(p.invalid_length, 1)

    def test_invalid_checksum(self):
        p = FrameParser()
        self.assertEqual(p.feed(bytes.fromhex("AA 02 01 02 04") + make_frame(b"ok")), [b"ok"])
        self.assertEqual(p.invalid_checksum, 1)

    def test_sof_inside_valid_payload(self):
        self.assertEqual(FrameParser().feed(make_frame(b"\xAA")), [b"\xAA"])

    def test_fragmentation_invariance(self):
        payloads = [b"", b"abc", bytes(range(16)), b"\xAA\xAA"]
        stream = b"".join(make_frame(v) for v in payloads)
        for split in range(len(stream) + 1):
            p = FrameParser()
            self.assertEqual(p.feed(stream[:split]) + p.feed(stream[split:]), payloads)

    def test_truncation_and_reset(self):
        p = FrameParser()
        self.assertEqual(p.feed(b"\xAA\x10" + b"a" * 16), [])
        self.assertEqual(p.pending_size, 18)
        p.reset()
        self.assertEqual(p.feed(make_frame(b"new")), [b"new"])

    def test_buffer_bound_under_random_input(self):
        p = FrameParser()
        rng = random.Random(7)
        for _ in range(5000):
            p.feed(bytes([rng.randrange(256)]))
            self.assertLessEqual(p.pending_size, 18)


class StateTests(unittest.TestCase):
    def test_start_and_fault(self):
        self.assertEqual(next_state(State.READY, configured=True, reference_valid=True,
            start_edge=True, fault=True, reset_edge=False, safety_permit=True), State.FAULT)

    def test_reset_does_not_start(self):
        self.assertEqual(next_state(State.FAULT, configured=True, reference_valid=True,
            start_edge=True, fault=False, reset_edge=True, safety_permit=True), State.IDLE)

    def test_reference_loss(self):
        self.assertEqual(next_state(State.RUNNING, configured=True, reference_valid=False,
            start_edge=False, fault=False, reset_edge=False, safety_permit=True), State.FAULT)

    def test_fault_priority_exhaustive(self):
        # 4 состояния × 64 набора входов. Проверяются инварианты, не физическая система.
        for state in State:
            for cfg, ref, start, fault, reset, permit in product((False, True), repeat=6):
                target = next_state(state, configured=cfg, reference_valid=ref,
                    start_edge=start, fault=fault, reset_edge=reset, safety_permit=permit)
                if fault or not permit:
                    self.assertIs(target, State.FAULT)
                if state is State.FAULT:
                    self.assertNotEqual(target, State.RUNNING)
                if target is State.RUNNING:
                    self.assertTrue(cfg and ref and permit and not fault)


class ScheduleTests(unittest.TestCase):
    def test_given_schedule(self):
        edges = {frozenset(e) for e in ("AB", "BC", "BD")}
        self.assertTrue(valid_schedule([("A", "C"), ("B", "C"), ("D", "B"), ("B", "A"), ("C", "A")], edges))

    def test_edge_swap_rejected(self):
        self.assertFalse(valid_schedule([("A", "B"), ("B", "A")], {frozenset("AB")}))

    def test_vertex_conflict_rejected(self):
        edges = {frozenset("AB"), frozenset("BC")}
        self.assertFalse(valid_schedule([("A", "C"), ("B", "B")], edges))


if __name__ == "__main__":
    unittest.main(verbosity=2)
