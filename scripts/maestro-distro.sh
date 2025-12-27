#!/bin/bash
# MAESTRO DISTRO SWARM CONTROLLER
# Usage: maestro-distro.sh start|stop|status|run

set -e
cd "$(dirname "$0")/.."

PIDFILE="/tmp/primordia-distro.pid"
LOGFILE="dist/proofs/distro-daemon.log"

case "$1" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Distro daemon already running (PID $(cat "$PIDFILE"))"
      exit 1
    fi
    echo "Starting distro daemon..."
    nohup bash scripts/distro-daemon.sh >> "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    echo "Started (PID $!)"
    ;;

  stop)
    if [ -f "$PIDFILE" ]; then
      PID=$(cat "$PIDFILE")
      if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        rm -f "$PIDFILE"
        echo "Stopped (PID $PID)"
      else
        rm -f "$PIDFILE"
        echo "PID file stale, removed"
      fi
    else
      echo "Not running"
    fi
    ;;

  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Running (PID $(cat "$PIDFILE"))"
      tail -5 "$LOGFILE" 2>/dev/null || true
    else
      echo "Not running"
    fi
    ;;

  run)
    echo "Running single distro wave..."
    bash scripts/distro-run-once.sh
    ;;

  *)
    echo "Usage: $0 {start|stop|status|run}"
    exit 1
    ;;
esac
