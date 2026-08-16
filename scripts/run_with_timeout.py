#!/usr/bin/env python3

import argparse
import os
import signal
import subprocess
import sys
import time


def stop_process_group(process: subprocess.Popen, grace_seconds: int = 10) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=grace_seconds)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    process.wait()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a command with heartbeat output and a hard process-group timeout.")
    parser.add_argument("--timeout", type=int, required=True, help="Hard timeout in seconds")
    parser.add_argument("--heartbeat", type=int, default=30, help="Heartbeat interval in seconds")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("a command is required after --")

    process = subprocess.Popen(command, start_new_session=True)
    started = time.monotonic()
    last_heartbeat = started

    def forward_signal(signum, _frame):
        print(f"RUNNER_SIGNAL signal={signum} pid={process.pid}", flush=True)
        stop_process_group(process)
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGINT, forward_signal)

    while True:
        return_code = process.poll()
        if return_code is not None:
            elapsed = int(time.monotonic() - started)
            print(f"RUNNER_DONE pid={process.pid} elapsed={elapsed}s exit={return_code}", flush=True)
            return return_code

        now = time.monotonic()
        elapsed = int(now - started)
        if elapsed >= args.timeout:
            print(f"RUNNER_TIMEOUT pid={process.pid} elapsed={elapsed}s limit={args.timeout}s", flush=True)
            stop_process_group(process)
            return 124
        if now - last_heartbeat >= args.heartbeat:
            print(f"RUNNER_HEARTBEAT pid={process.pid} elapsed={elapsed}s", flush=True)
            last_heartbeat = now
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
