"""Camera side of the table demo: which board cells have something on them.

No markers: the camera looks at the empty table once (the baseline), and a cell is
"occupied" while enough of its pixels differ from that baseline.

Two baselines are kept, one with every cell dark and one with every cell lit. The
display is lit by this very tracker's answer, so a camera that sees the display
(a monitor, or a projector without an IR filter) must compare an occupied cell
against the lit baseline and a free one against the dark baseline, or the board
would keep itself switched on. With an IR-only camera both baselines are equal.
"""
import json
import threading
import time

import cv2
import numpy as np

WORK_SCALE = 0.25  # display px -> working px; the image is analysed at this size
CALIBRATION_MARGIN = 0.08  # calibration targets sit this far in from the display edges


class CameraSource:
    """Reads a V4L2 camera on a thread and keeps only the newest frame."""

    def __init__(self, device, size=(1280, 720)):
        self.device = device
        self.size = size
        self.frame = None
        self.seq = 0
        self.error = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self._thread.start()
        return self

    def stop(self):
        self._stop.set()

    def latest(self):
        with self._lock:
            return self.seq, self.frame

    def _run(self):
        while not self._stop.is_set():
            cap = cv2.VideoCapture(self.device, cv2.CAP_V4L2)
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.size[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.size[1])
            if not cap.isOpened():
                self.error = f"cannot open {self.device}"
                time.sleep(2)
                continue
            self.error = None
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok:
                    self.error = "camera stopped delivering frames"
                    break
                with self._lock:
                    self.frame = frame
                    self.seq += 1
            cap.release()
            time.sleep(1)


class OccupancyTracker:
    def __init__(self, on_frac=0.18, off_frac=0.07, diff_thr=26, on_frames=4, off_frames=6, lockout=0.7):
        self.on_frac = on_frac
        self.off_frac = off_frac
        self.diff_thr = diff_thr
        self.on_frames = on_frames
        self.off_frames = off_frames
        self.lockout = lockout  # seconds a cell ignores the camera after it changed (display settles)
        self.lock = threading.RLock()
        self.display = (1920, 1080)
        self.cells = []
        self.homography = None
        self.calibration = None
        self.baselines = {}  # 'dark' / 'lit' -> float32 gray image at working size
        self._reset_cells()

    # ---- configuration -------------------------------------------------

    @property
    def work_size(self):
        return round(self.display[0] * WORK_SCALE), round(self.display[1] * WORK_SCALE)

    def _reset_cells(self):
        self._masks = []
        self._board = np.zeros(self.work_size[::-1], np.uint8)
        self._occupied = {}
        self._counter = {}
        self._changed_at = {}
        self._scores = {}

    def set_cells(self, width, height, cells):
        """cells: [{'id': str, 'vertices': [[x, y], ...]}] in display pixels."""
        with self.lock:
            if (width, height) != self.display:
                self.baselines = {}
                self.homography = None
            self.display = (int(width), int(height))
            self.cells = cells
            self._reset_cells()
            w, h = self.work_size
            kernel = np.ones((3, 3), np.uint8)
            for cell in cells:
                pts = (np.array(cell["vertices"], np.float32) * WORK_SCALE).round().astype(np.int32)
                mask = np.zeros((h, w), np.uint8)
                cv2.fillPoly(mask, [pts], 1)
                mask = cv2.erode(mask, kernel)  # keep clear of the grid lines between cells
                ys, xs = np.nonzero(mask)
                if not len(xs):
                    continue
                box = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
                self._masks.append((cell["id"], box, mask[box].astype(bool)))
                self._board |= mask
                self._occupied[cell["id"]] = False
                self._counter[cell["id"]] = 0
                self._changed_at[cell["id"]] = 0.0

    def calibration_targets(self):
        """Display-pixel positions of the four calibration targets: TL, TR, BR, BL."""
        w, h = self.display
        mx, my = w * CALIBRATION_MARGIN, h * CALIBRATION_MARGIN
        return [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]]

    def set_calibration(self, camera_points, display_points=None):
        """camera_points: four clicked points in camera pixels matching display_points."""
        display_points = display_points or self.calibration_targets()
        src = np.array(camera_points, np.float32)
        dst = np.array(display_points, np.float32) * WORK_SCALE
        homography, _ = cv2.findHomography(src, dst)
        if homography is None:
            raise ValueError("the four points do not define a perspective")
        with self.lock:
            self.homography = homography
            self.calibration = {"camera": src.tolist(), "display": np.array(display_points).tolist(), "size": list(self.display)}
            self.baselines = {}
            for state in self._occupied:
                self._occupied[state] = False

    def save_calibration(self, path):
        with self.lock:
            if self.calibration:
                with open(path, "w") as fh:
                    json.dump(self.calibration, fh)

    def load_calibration(self, path):
        try:
            with open(path) as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            return False
        if tuple(data.get("size", ())) != self.display:
            return False
        self.set_calibration(data["camera"], data["display"])
        return True

    # ---- image ---------------------------------------------------------

    def to_work(self, frame):
        """Camera frame -> blurred gray image in display space (working size)."""
        with self.lock:
            homography = self.homography
        if homography is None:
            warped = cv2.resize(frame, self.work_size, interpolation=cv2.INTER_AREA)
        else:
            warped = cv2.warpPerspective(frame, homography, self.work_size, flags=cv2.INTER_AREA)
        gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY) if warped.ndim == 3 else warped
        return cv2.GaussianBlur(gray, (5, 5), 0).astype(np.float32)

    def set_baseline(self, kind, grays):
        with self.lock:
            self.baselines[kind] = np.mean(grays, axis=0).astype(np.float32)
            for cell_id in self._occupied:
                self._occupied[cell_id] = False

    @property
    def has_baseline(self):
        return "dark" in self.baselines and "lit" in self.baselines

    # ---- tracking ------------------------------------------------------

    def _diff(self, gray, baseline):
        delta = gray - baseline
        board = self._board.astype(bool)
        if board.any():
            delta -= np.median(delta[board])  # auto exposure moves the whole picture
        return np.abs(delta) > self.diff_thr

    def update(self, frame, now=None):
        """Feeds one camera frame. Returns True when the occupied set changed."""
        now = time.monotonic() if now is None else now
        gray = self.to_work(frame)
        with self.lock:
            if not self.has_baseline or not self._masks:
                return False
            changed = {kind: self._diff(gray, self.baselines[kind]) for kind in ("dark", "lit")}
            moved = False
            for cell_id, box, mask in self._masks:
                lit = self._occupied[cell_id]
                frac = float(changed["lit" if lit else "dark"][box][mask].mean())
                self._scores[cell_id] = frac
                if now - self._changed_at[cell_id] < self.lockout:
                    self._counter[cell_id] = 0
                    continue
                wants = frac > self.on_frac if not lit else frac > self.off_frac
                if wants != lit:  # evidence for a flip of this cell
                    self._counter[cell_id] += 1
                    if self._counter[cell_id] >= (self.on_frames if not lit else self.off_frames):
                        self._occupied[cell_id] = not lit
                        self._changed_at[cell_id] = now
                        self._counter[cell_id] = 0
                        moved = True
                else:
                    self._counter[cell_id] = 0
            return moved

    def state(self):
        with self.lock:
            return {
                "occupied": sorted(i for i, on in self._occupied.items() if on),
                "scores": {i: round(s, 3) for i, s in self._scores.items()},
                "calibrated": self.homography is not None,
                "baseline": self.has_baseline,
            }

    def overlay(self, frame):
        """Draws the cells (green free, red occupied) and the calibration quad on a camera frame."""
        out = frame.copy()
        with self.lock:
            homography = self.homography
            if homography is None:
                return out
            inverse = np.linalg.inv(homography)
            occupied = {i for i, on in self._occupied.items() if on}
            for cell in self.cells:
                pts = np.array(cell["vertices"], np.float32).reshape(-1, 1, 2) * WORK_SCALE
                pts = cv2.perspectiveTransform(pts, inverse).astype(np.int32)
                color = (60, 60, 255) if cell["id"] in occupied else (80, 220, 80)
                cv2.polylines(out, [pts], True, color, 2 if cell["id"] in occupied else 1)
        return out
