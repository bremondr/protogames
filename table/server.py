#!/usr/bin/env python3
"""Local server for the table demo: serves the repo, reads the camera, streams occupancy.

    python3 table/server.py            # then open http://localhost:8000/table/

Only the standard library plus OpenCV/numpy (python3-opencv); nothing is installed.
Listens on 127.0.0.1 unless --host says otherwise.
"""
import argparse
import glob
import json
import os
import queue
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import cv2

from tracker import CameraSource, OccupancyTracker

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, "data")
CALIBRATION_FILE = os.path.join(DATA, "calibration.json")
IR_CAMERA_GLOB = "/dev/v4l/by-id/*USB_2.0_Camera*-index0"  # the up-looking camera under the glass


class Hub:
    """Fan-out of server-sent events to every open page."""

    def __init__(self):
        self.clients = set()
        self.lock = threading.Lock()

    def subscribe(self):
        q = queue.Queue(maxsize=50)
        with self.lock:
            self.clients.add(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            self.clients.discard(q)

    def publish(self, message):
        data = json.dumps(message)
        with self.lock:
            for q in list(self.clients):
                try:
                    q.put_nowait(data)
                except queue.Full:
                    pass


class App:
    def __init__(self, camera):
        self.camera = camera
        self.tracker = OccupancyTracker()
        self.hub = Hub()
        self.busy = threading.Lock()  # one baseline capture at a time
        self.status = "waiting for the page"

    def snapshot(self, overlay=False):
        _, frame = self.camera.latest() if self.camera else (0, None)
        if frame is None:
            return None
        if overlay:
            frame = self.tracker.overlay(frame)
        ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return jpg.tobytes() if ok else None

    def publish_state(self):
        state = self.tracker.state()
        state["type"] = "state"
        state["status"] = self.status
        state["camera_error"] = self.camera.error if self.camera else "no camera"
        self.hub.publish(state)

    def track_loop(self):
        seen = -1
        last_beat = 0.0
        while True:
            seq, frame = self.camera.latest() if self.camera else (0, None)
            if frame is None or seq == seen or self.busy.locked():
                time.sleep(0.01)
            else:
                seen = seq
                moved = self.tracker.update(frame)
                if moved or time.monotonic() - last_beat > 1.0:
                    last_beat = time.monotonic()
                    self.publish_state()

    def capture_baseline(self, frames=12):
        """Looks at the empty table with the board dark, then fully lit."""
        if self.camera is None or not self.busy.acquire(blocking=False):
            return False
        try:
            for kind in ("dark", "lit"):
                self.hub.publish({"type": "display", "mode": kind})
                time.sleep(2.0)  # let the display and the camera's exposure settle
                grays, seen = [], -1
                while len(grays) < frames:
                    seq, frame = self.camera.latest()
                    if frame is not None and seq != seen:
                        seen = seq
                        grays.append(self.tracker.to_work(frame))
                    time.sleep(0.02)
                self.tracker.set_baseline(kind, grays)
            self.status = "tracking"
        finally:
            self.hub.publish({"type": "display", "mode": None})
            self.busy.release()
            self.publish_state()
        return True


def make_handler(app):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=ROOT, **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, fmt, *args):
            if "/api/" not in str(args[0] if args else ""):
                super().log_message(fmt, *args)

        def reply(self, payload, code=200, ctype="application/json"):
            body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def body(self):
            return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")

        def do_GET(self):
            path, _, query = self.path.partition("?")
            if path == "/api/events":
                return self.events()
            if path == "/api/snapshot.jpg":
                jpg = app.snapshot(overlay="overlay" in query)
                return self.reply(jpg, ctype="image/jpeg") if jpg else self.reply({"error": "no frame"}, 503)
            if path == "/api/status":
                state = app.tracker.state()
                state["status"] = app.status
                state["targets"] = app.tracker.calibration_targets()
                return self.reply(state)
            return super().do_GET()

        def do_POST(self):
            try:
                data = self.body()
                if self.path == "/api/cells":
                    app.tracker.set_cells(data["width"], data["height"], data["cells"])
                    if app.tracker.homography is None and app.tracker.load_calibration(CALIBRATION_FILE):
                        app.status = "calibration loaded, capture the empty table (B)"
                    elif app.tracker.homography is None:
                        app.status = "not calibrated (C)"
                    app.publish_state()
                    return self.reply({"targets": app.tracker.calibration_targets()})
                if self.path == "/api/calibration":
                    app.tracker.set_calibration(data["camera"])
                    os.makedirs(DATA, exist_ok=True)
                    app.tracker.save_calibration(CALIBRATION_FILE)
                    app.status = "calibrated, capture the empty table (B)"
                    app.publish_state()
                    return self.reply({"ok": True})
                if self.path == "/api/baseline":
                    threading.Thread(target=app.capture_baseline, daemon=True).start()
                    return self.reply({"ok": True})
                if self.path == "/api/settings":
                    for key in ("on_frac", "off_frac", "diff_thr"):
                        if key in data:
                            setattr(app.tracker, key, float(data[key]))
                    return self.reply({"ok": True})
            except (KeyError, ValueError, TypeError) as err:
                return self.reply({"error": str(err)}, 400)
            return self.reply({"error": "not found"}, 404)

        def events(self):
            q = app.hub.subscribe()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            try:
                app.publish_state()
                while True:
                    try:
                        self.wfile.write(b"data: " + q.get(timeout=15).encode() + b"\n\n")
                    except queue.Empty:
                        self.wfile.write(b": keep-alive\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                app.hub.unsubscribe(q)

    return Handler


def find_camera(explicit):
    if explicit:
        return explicit
    found = sorted(glob.glob(IR_CAMERA_GLOB))
    return found[0] if found else None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--camera", help="video device of the tracking camera (default: the USB 2.0 camera)")
    parser.add_argument("--no-camera", action="store_true", help="serve the page only (simulator mode)")
    args = parser.parse_args()

    camera = None
    if not args.no_camera:
        device = find_camera(args.camera)
        if device is None:
            raise SystemExit("tracking camera not found; pass --camera /dev/videoN or --no-camera")
        print(f"tracking camera: {device}")
        camera = CameraSource(device).start()
    app = App(camera)
    threading.Thread(target=app.track_loop, daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(app))
    server.daemon_threads = True
    print(f"table demo: http://{'localhost' if args.host == '127.0.0.1' else args.host}:{args.port}/table/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
