#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Portfolio Server Watchdog (port 4040) — health-check auto-restart  [v1.0]
#
# WHY THIS EXISTS (2026-08-12): the p menu's AA (Start All) looks at each server
# exactly once, at the instant it is pressed. If a port is bound and answering,
# AA prints "already running" and never revisits it. A server that dies ten
# minutes later is invisible to every part of PAI — nothing notices, nothing
# restarts it, and the first symptom is a page that will not load. That is what
# happened to Portfolio on 2026-08-12: AA at 07:36 skipped it as already-running,
# the instance died before 08:05, and it stayed dead until started by hand.
#
# This runs from cron every 2 minutes and is INDEPENDENT of the menu, the
# Utilities dashboard, and the PAI Watcher — none of which restart servers.
#
# Design notes:
#   • Start command is NOT duplicated here. It is read from .pai-server, the
#     same single source of truth AA uses, so it changes in exactly one place.
#   • Retries forever. A server that fails its first N attempts still ends up
#     running once the underlying cause clears — that is the whole point.
#   • Alert dedup — Pushover fires only on first failure, escalation, and
#     recovery. A crash loop must not become a 2-minute alert storm.
#   • Log APPENDS. AA truncates each server's log on every launch, which is
#     precisely why the crash that killed Portfolio could not be diagnosed.
#
# GOTCHA (this bites, and only under cron): Portfolio's start command calls a
# bare `node`, and node lives in ~/.local/bin, which is NOT on cron's PATH.
# Run from an interactive shell it works; run from cron it dies with
# "node: command not found". PATH is set explicitly below. Test with `env -i`,
# never only from your own shell.
#
# Deliberate stop: `touch .watchdog-paused` and this script does nothing until
# the file is removed. Without it, the menu's ZZ (Stop All) would be undone
# within two minutes.
#
# Install: crontab @reboot + */2 health check. Remove both to uninstall.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# Cron gets a minimal PATH. Prepend the interpreters this box actually uses.
export PATH="/home/dmcneill/.local/bin:/home/dmcneill/.bun/bin:$PATH"

DIR="/home/dmcneill/Projects/Portfolio"
SRV="$DIR/.pai-server"
LOG="$DIR/watchdog.log"
ERR="$DIR/logs/errors.jsonl"
STATE="$DIR/logs/.watchdog-state"       # fails=<n> escalated=<0|1>
PAUSE="$DIR/.watchdog-paused"
ESCALATE_AT=5                           # consecutive fails (~10 min) before "manual" alert

ts() { date '+%Y-%m-%d %H:%M:%S %Z'; }
mkdir -p "$DIR/logs"

# ── deliberate stop wins over the watchdog ───────────────────────────────────
[ -f "$PAUSE" ] && exit 0

# ── read the start command from .pai-server (single source of truth) ─────────
srv_field() { grep "^${1}=" "$SRV" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '\r'; }
if [ ! -f "$SRV" ]; then
  echo "[$(ts)] FATAL — $SRV not found; cannot know how to start Portfolio" >> "$LOG"
  exit 1
fi
PORT="$(srv_field PORT)"
CMD="$(srv_field BG_CMD)"
SRVLOG="$(srv_field LOG)"; SRVLOG="${SRVLOG:-/tmp/portfolio-server.log}"
if [ -z "$PORT" ] || [ -z "$CMD" ]; then
  echo "[$(ts)] FATAL — .pai-server missing PORT or BG_CMD" >> "$LOG"
  exit 1
fi
URL="http://127.0.0.1:${PORT}/"

# ── state helpers ────────────────────────────────────────────────────────────
fails=0; escalated=0
if [ -f "$STATE" ]; then
  # shellcheck disable=SC1090
  . "$STATE" 2>/dev/null || true
fi
save_state() { printf 'fails=%s\nescalated=%s\n' "$1" "$2" > "$STATE"; }

# ── Pushover (optional; silent no-op when no creds) ──────────────────────────
env_field() { grep -E "^${1}=" "$2" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'; }
USER_KEY="$(env_field PUSHOVER_USER_KEY  "$DIR/.env")"
API_TOKEN="$(env_field PUSHOVER_API_TOKEN "$DIR/.env")"
# Fall back to the Utilities .env, which already holds working keys.
[ -z "$USER_KEY"  ] && USER_KEY="$(env_field PUSHOVER_USER_KEY  /home/dmcneill/Projects/Utilities/.env)"
[ -z "$API_TOKEN" ] && API_TOKEN="$(env_field PUSHOVER_API_TOKEN /home/dmcneill/Projects/Utilities/.env)"

notify() {
  local title="$1" msg="$2" prio="${3:-1}" resp
  if [ -z "$USER_KEY" ] || [ -z "$API_TOKEN" ]; then
    printf '{"ts":"%s","source":"portfolio-watchdog","event":"pushover_skipped","reason":"no_creds"}\n' "$(ts)" >> "$ERR"
    return 0
  fi
  resp=$(curl -s --max-time 10 \
    --form-string "token=$API_TOKEN" --form-string "user=$USER_KEY" \
    --form-string "title=$title" --form-string "message=$msg" \
    --form-string "priority=$prio" \
    https://api.pushover.net/1/messages.json 2>/dev/null)
  if printf '%s' "$resp" | grep -q '"status":1'; then
    echo "[$(ts)] pushover sent: $title" >> "$LOG"
  else
    echo "[$(ts)] PUSHOVER FAILED: $title — resp=${resp:-<none>}" >> "$LOG"
    printf '{"ts":"%s","source":"portfolio-watchdog","event":"pushover_failed","title":"%s"}\n' "$(ts)" "$title" >> "$ERR"
  fi
}

# ── health probe ─────────────────────────────────────────────────────────────
HCODE=""
is_healthy() {
  local rc
  rc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$URL" 2>/dev/null)
  if [ "$rc" != "200" ]; then HCODE="root HTTP ${rc:-000}"; return 1; fi
  return 0
}

# ── main ─────────────────────────────────────────────────────────────────────
if is_healthy; then
  if [ "${fails:-0}" -gt 0 ]; then
    echo "[$(ts)] RECOVERED after ${fails} failed check(s)" >> "$LOG"
    notify "✓ Portfolio recovered" \
      "Portfolio on :${PORT} is answering again after ${fails} failed check(s)." 0
  fi
  save_state 0 0
  exit 0
fi

fails=$(( ${fails:-0} + 1 ))
echo "[$(ts)] DOWN ($HCODE) — attempt #$fails — restarting" >> "$LOG"
printf '{"ts":"%s","source":"portfolio-watchdog","event":"server_down","reason":"%s","attempt":%s,"action":"restart"}\n' \
  "$(ts)" "$HCODE" "$fails" >> "$ERR"

# Clear anything stale holding the port, then start from .pai-server's command.
pkill -9 -f "Portfolio/server.js" 2>/dev/null
lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null
sleep 2
echo "── watchdog restart $(ts) ──" >> "$SRVLOG"
nohup bash -c "$CMD" >> "$SRVLOG" 2>&1 &
disown

# Poll rather than sleep on a guess — Portfolio binds in ~1s warm, longer cold.
t=0
while [ "$t" -lt 30 ]; do
  ss -tlnp 2>/dev/null | grep -q ":${PORT} " && break
  sleep 1; t=$((t+1))
done
re=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$URL" 2>/dev/null)
echo "[$(ts)] restart complete — root now HTTP ${re:-000}" >> "$LOG"

# Alert dedup: first failure, escalation, recovery only.
if [ "$fails" -eq 1 ]; then
  notify "⚠️ Portfolio auto-restarted" \
    "Portfolio on :${PORT} was down ($HCODE). Watchdog restarted it — root now HTTP ${re:-000}." 1
elif [ "$fails" -ge "$ESCALATE_AT" ] && [ "${escalated:-0}" -ne 1 ]; then
  notify "🚨 Portfolio STILL failing" \
    "Portfolio on :${PORT} has failed $fails consecutive checks (~$((fails*2)) min) despite auto-restarts ($HCODE). Manual fix needed." 1
  escalated=1
fi

save_state "$fails" "$escalated"
