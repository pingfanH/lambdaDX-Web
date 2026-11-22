"""Serve the static Padview SDK, including its precompressed WebAssembly and tar files."""
import argparse
import gzip
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.suffix != ".br" or not path.is_file():
            return super().send_head()

        accepted = {}
        for item in self.headers.get("Accept-Encoding", "").lower().split(","):
            name, _, params = item.strip().partition(";")
            try:
                accepted[name.strip()] = float(params.strip().removeprefix("q=")) if params else 1
            except ValueError:
                continue

        for encoding, file in (("br", path), ("gzip", path.with_suffix(".gz"))):
            if accepted.get(encoding, accepted.get("*", 0)) > 0 and file.is_file():
                stream = file.open("rb")
                break
        else:
            if accepted.get("identity", 0 if accepted.get("*") == 0 else 1) <= 0:
                self.send_error(406, "No acceptable content encoding")
                return None
            encoding = None
            stream = gzip.open(path.with_suffix(".gz"), "rb")
        self.send_response(200)
        self.send_header("Content-Type", "application/wasm" if path.name.endswith(".wasm.br") else "application/x-tar")
        self.send_header("Vary", "Accept-Encoding")
        if encoding:
            self.send_header("Content-Encoding", encoding)
            self.send_header("Content-Length", str(file.stat().st_size))
        self.end_headers()
        return stream


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    handler = partial(Handler, directory=str(Path(__file__).resolve().parent))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Padview SDK: http://{args.bind}:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
