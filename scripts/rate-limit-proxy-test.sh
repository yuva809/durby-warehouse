#!/usr/bin/env bash
# Live check that per-client rate limiting works through the real Caddy proxy
# and the real backend, using this stack's actual Docker networking:
#   - separate client containers (distinct IPs) must get separate limit buckets
#   - a forged X-Forwarded-For must not buy a fresh bucket or frame a victim
#   - a request that reaches the backend directly (not via Caddy) must have
#     its X-Forwarded-For ignored
# Sends only bogus logins (401s, never a successful auth) to the login route
# (limit: 5/min per client IP). Needs the stack up: `docker compose up -d`.
#
# Usage: ./scripts/rate-limit-proxy-test.sh
# Env:   API_HOST  Host header Caddy routes to the API (default: api.localhost)
set -uo pipefail

API_HOST="${API_HOST:-api.localhost}"
PROJECT="${COMPOSE_PROJECT_NAME:-durby-warehouse}"
PUBLIC_NET="${PROJECT}_public"
INTERNAL_NET="${PROJECT}_internal"
IMAGE="curlimages/curl"
PROBE=$(mktemp)
CONTAINERS=()
pass=0; fail=0

cleanup() { [ ${#CONTAINERS[@]} -gt 0 ] && docker rm -f "${CONTAINERS[@]}" >/dev/null 2>&1; rm -f "$PROBE"; }
trap cleanup EXIT

ok() { if [ "$1" = "1" ]; then pass=$((pass+1)); echo "✓ $2"; else fail=$((fail+1)); echo "✗ FAIL: $2"; fi; }

# Runs inside a client container: N bogus logins -> space-separated status codes.
#   $1 URL  $2 COUNT  $3 mode: none | rotate:<a.b.c> | fixed:<ip>  $4 Host header ("" for none)
cat > "$PROBE" <<'EOF'
#!/bin/sh
URL=$1; N=$2; MODE=$3; HOST=$4
i=1; out=""
while [ "$i" -le "$N" ]; do
  set -- -s -o /dev/null -w "%{http_code}" -X POST "$URL" -H "Content-Type: application/json" -d '{"email":"nobody@example.invalid","password":"wrong-password-probe"}'
  [ -n "$HOST" ] && set -- "$@" -H "Host: $HOST"
  case "$MODE" in
    rotate:*) set -- "$@" -H "X-Forwarded-For: ${MODE#rotate:}.$i" ;;
    fixed:*)  set -- "$@" -H "X-Forwarded-For: ${MODE#fixed:}" ;;
  esac
  out="$out $(curl "$@")"
  i=$((i+1))
done
echo "$out"
EOF

start_client() { # name network
  docker run -d --rm --network "$2" --name "$1" -v "$PROBE:/probe.sh:ro" --entrypoint sleep "$IMAGE" 600 >/dev/null || { echo "could not start $1"; exit 2; }
  CONTAINERS+=("$1")
}
ip_of() { docker inspect -f "{{(index .NetworkSettings.Networks \"$2\").IPAddress}}" "$1"; }
run() { docker exec "$1" sh /probe.sh "${@:2}" | xargs; }   # xargs trims whitespace
first5_then_429() { [ "$1" = "401 401 401 401 401 429" ]; }
tag=$$

docker compose ps --status running --services 2>/dev/null | grep -qx reverse-proxy || { echo "Stack not running (docker compose up -d)"; exit 2; }

for c in A B C VICTIM ATTACKER; do start_client "rl-$tag-$c" "$PUBLIC_NET"; done
start_client "rl-$tag-DIRECT" "$INTERNAL_NET"
CADDY="http://reverse-proxy/api/auth/login"
BACKEND="http://backend:3000/api/auth/login"
echo "Client IPs: A=$(ip_of rl-$tag-A "$PUBLIC_NET") B=$(ip_of rl-$tag-B "$PUBLIC_NET") C=$(ip_of rl-$tag-C "$PUBLIC_NET") VICTIM=$(ip_of rl-$tag-VICTIM "$PUBLIC_NET") ATTACKER=$(ip_of rl-$tag-ATTACKER "$PUBLIC_NET") DIRECT=$(ip_of rl-$tag-DIRECT "$INTERNAL_NET")"

echo; echo "== 1. Different clients through Caddy get separate buckets =="
r=$(run rl-$tag-A "$CADDY" 6 none "$API_HOST"); echo "client A x6: $r"
first5_then_429 "$r" && ok 1 "A is limited after 5 attempts (401 x5, then 429)" || ok 0 "A is limited after 5 attempts (got: $r)"
r=$(run rl-$tag-B "$CADDY" 1 none "$API_HOST"); echo "client B x1: $r"
[ "$r" = "401" ] && ok 1 "B (another client) is NOT blocked by A's attempts" || ok 0 "B is not blocked by A (got: $r)"

echo; echo "== 2. A forged X-Forwarded-For through Caddy does not buy a fresh bucket =="
r=$(run rl-$tag-C "$CADDY" 6 "rotate:198.51.100" "$API_HOST"); echo "client C x6, a new forged XFF each time: $r"
first5_then_429 "$r" && ok 1 "rotating forged X-Forwarded-For still limited at attempt 6" || ok 0 "rotating forged XFF still limited (got: $r)"

echo; echo "== 3. A forged X-Forwarded-For cannot frame another client =="
VIP=$(ip_of rl-$tag-VICTIM "$PUBLIC_NET")
r=$(run rl-$tag-ATTACKER "$CADDY" 6 "fixed:$VIP" "$API_HOST"); echo "attacker x6 claiming to be the victim ($VIP): $r"
first5_then_429 "$r" && ok 1 "attacker is limited under its own address" || ok 0 "attacker limited under own address (got: $r)"
r=$(run rl-$tag-VICTIM "$CADDY" 1 none "$API_HOST"); echo "victim x1: $r"
[ "$r" = "401" ] && ok 1 "victim is unaffected by the attacker's forged header" || ok 0 "victim unaffected (got: $r)"

echo; echo "== 4. Direct (not via Caddy) requests: X-Forwarded-For is ignored =="
r=$(run rl-$tag-DIRECT "$BACKEND" 6 "rotate:192.0.2" ""); echo "direct to backend:3000 x6, forged XFF each time: $r"
first5_then_429 "$r" && ok 1 "untrusted direct peer: forged X-Forwarded-For ignored, limited at attempt 6" || ok 0 "untrusted direct peer limited (got: $r)"
# Host-side: arrives via Docker's loopback publish (peer = Docker gateway, not the trusted proxy).
hostcodes=""; for i in 1 2 3 4 5 6; do hostcodes="$hostcodes $(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3001/api/auth/login -H 'Content-Type: application/json' -H "X-Forwarded-For: 203.0.113.$i" -d '{"email":"nobody@example.invalid","password":"wrong-password-probe"}')"; done
hostcodes=$(echo $hostcodes); echo "host -> 127.0.0.1:3001 x6, forged XFF each time: $hostcodes"
first5_then_429 "$hostcodes" && ok 1 "host loopback port: forged X-Forwarded-For ignored" || ok 0 "host loopback port limited (got: $hostcodes)"

echo; echo "$([ $fail -eq 0 ] && echo '✅ All checks passed.' || echo "❌ $fail check(s) failed.") ($pass passed, $fail failed)"
[ $fail -eq 0 ]
