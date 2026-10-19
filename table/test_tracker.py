"""Run: python3 -m unittest discover -s table"""
import unittest

import cv2
import numpy as np

from tracker import OccupancyTracker

W, H = 640, 360


def board():
    """A 3 x 2 grid of square cells filling the display."""
    cells = []
    for row in range(2):
        for col in range(3):
            x0, y0, x1, y1 = col * W / 3, row * H / 2, (col + 1) * W / 3, (row + 1) * H / 2
            cells.append({"id": f"c{col}{row}", "vertices": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]})
    return cells


def frame(blob=None, level=90):
    img = np.full((H, W, 3), level, np.uint8)
    if blob:
        cv(img, *blob)
    return img


def cv(img, cx, cy):
    cv2.circle(img, (cx, cy), 60, (250, 250, 250), -1)


def tracker():
    t = OccupancyTracker(on_frames=2, off_frames=2, lockout=0)
    t.set_cells(W, H, board())
    grays = [t.to_work(frame())]
    t.set_baseline("dark", grays)
    t.set_baseline("lit", grays)
    return t


def feed(t, img, n=3, start=0.0):
    for i in range(n):
        t.update(img, start + i)
    return t.state()["occupied"]


class OccupancyTest(unittest.TestCase):
    def test_empty_table_has_nothing_on_it(self):
        self.assertEqual(feed(tracker(), frame()), [])

    def test_object_lights_only_its_cell_and_leaves(self):
        t = tracker()
        self.assertEqual(feed(t, frame((100, 90))), ["c00"])
        self.assertEqual(feed(t, frame(), start=10), [])

    def test_two_objects(self):
        t = tracker()
        img = frame((100, 90))
        cv(img, 540, 270)
        self.assertEqual(feed(t, img), ["c00", "c21"])

    def test_one_noisy_frame_is_ignored(self):
        t = tracker()
        t.update(frame((100, 90)), 0)
        t.update(frame(), 1)
        self.assertEqual(t.state()["occupied"], [])

    def test_exposure_change_is_not_an_object(self):
        self.assertEqual(feed(tracker(), frame(level=130)), [])

    def test_lit_cell_is_compared_with_the_lit_baseline(self):
        t = tracker()
        lit = frame(level=90)
        lit[0 : H // 2, 0 : W // 3] = 200  # the display lights up cell c00 once it is occupied
        t.set_baseline("lit", [t.to_work(lit)])
        feed(t, frame((100, 90)))
        self.assertEqual(t.state()["occupied"], ["c00"])
        still = lit.copy()
        cv(still, 100, 90)
        self.assertEqual(feed(t, still, start=10), ["c00"])  # lit and occupied stays occupied
        self.assertEqual(feed(t, lit, start=20), [])  # object gone, display still lit

    def test_calibration_maps_camera_to_display(self):
        t = OccupancyTracker(on_frames=2, off_frames=2, lockout=0)
        t.set_cells(W, H, board())
        m = t.calibration_targets()
        t.set_calibration([[p[0] / 2 + 50, p[1] / 2 + 20] for p in m])  # camera sees the display at half size
        img = np.full((H, W, 3), 90, np.uint8)
        t.set_baseline("dark", [t.to_work(img)])
        t.set_baseline("lit", [t.to_work(img)])
        cv2.circle(img, (50 + 100 // 2, 20 + 90 // 2), 30, (250, 250, 250), -1)
        self.assertEqual(feed(t, img), ["c00"])


if __name__ == "__main__":
    unittest.main()
