#!/usr/bin/env bash
# Chaos test: kill payment-service mid-booking and prove the saga's
# timeout-based compensation (HoldExpirySweep) frees the seat correctly.
# See docs/chaos-test.md for the full narrative and docs/adr/0004 for why
# there is deliberately no other compensating mechanism here.
#
# Usage: ./scripts/chaos-test.sh
# Requires: docker compose, curl, jq.
#
# NOT YET RUN AGAINST REAL INFRASTRUCTURE in this environment (Docker
# Desktop's backend was unavailable throughout this project's development
# -- see the README). Written to match the actual API surface exactly, but
# treat this as reviewed-but-unverified until it's been run once for real.

set -euo pipefail
cd "$(dirname "$0")/.."

API=http://localhost:3000
HOLD_TTL_SECONDS=10
SWEEP_INTERVAL_MS=3000

echo "==> Starting Postgres, Redis, Kafka, and core-api (short hold TTL for this run), WITHOUT payment-service..."
HOLD_TTL_SECONDS=$HOLD_TTL_SECONDS HOLD_SWEEP_INTERVAL_MS=$SWEEP_INTERVAL_MS \
  docker compose up -d --build postgres redis kafka core-api notification-service

echo "==> Waiting for core-api to accept connections..."
for i in $(seq 1 30); do
  curl -sf "$API/shows" >/dev/null 2>&1 && break
  sleep 2
done

echo "==> Provisioning a venue, seat, event, and show..."
VENUE_ID=$(curl -sf -X POST "$API/admin/venues" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Chaos Cinema","city":"Delhi","address":"Test Road"}' | jq -r .id)

curl -sf -X POST "$API/admin/venues/$VENUE_ID/seats" \
  -H 'Content-Type: application/json' \
  -d '{"seats":[{"section":"A","row":"A","seatNumber":1,"tier":"GOLD"}]}' >/dev/null

EVENT_ID=$(curl -sf -X POST "$API/admin/events" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Chaos Test Movie","genre":"DRAMA","durationMinutes":100}' | jq -r .id)

START_TIME=$(node -e "console.log(new Date(Date.now()+72*3600000).toISOString())")
END_TIME=$(node -e "console.log(new Date(Date.now()+75*3600000).toISOString())")
SHOW_ID=$(curl -sf -X POST "$API/admin/shows" \
  -H 'Content-Type: application/json' \
  -d "{\"eventId\":\"$EVENT_ID\",\"venueId\":\"$VENUE_ID\",\"startTime\":\"$START_TIME\",\"endTime\":\"$END_TIME\",\"basePriceByTier\":{\"GOLD\":50000}}" \
  | jq -r .id)

curl -sf -X POST "$API/admin/shows/$SHOW_ID/inventory" \
  -H 'Content-Type: application/json' \
  -d "{\"venueId\":\"$VENUE_ID\"}" >/dev/null

echo "==> Confirming payment-service is NOT running..."
docker compose stop payment-service 2>/dev/null || true

echo "==> Initiating a booking (this publishes SEATS_HELD -> the saga sends payment.requested,"
echo "    which nothing will ever answer)..."
BOOKING=$(curl -sf -X POST "$API/bookings" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"chaos-user\",\"showId\":\"$SHOW_ID\",\"seatIds\":[\"$(curl -sf "$API/shows/$SHOW_ID/seat-map" | jq -r '.[0].seatId')\"]}")
BOOKING_ID=$(echo "$BOOKING" | jq -r .booking.id)
echo "    booking $BOOKING_ID state: $(echo "$BOOKING" | jq -r .booking.state)"

echo "==> Confirming the seat is HELD..."
curl -sf "$API/shows/$SHOW_ID/seat-map" | jq .

WAIT_SECONDS=$((HOLD_TTL_SECONDS + SWEEP_INTERVAL_MS / 1000 + 5))
echo "==> Waiting ${WAIT_SECONDS}s for the hold TTL to elapse and the sweep to compensate..."
sleep "$WAIT_SECONDS"

echo "==> Checking the booking's final state..."
FINAL_STATE=$(curl -sf "$API/bookings/$BOOKING_ID" | jq -r .state)
echo "    booking $BOOKING_ID state: $FINAL_STATE"

echo "==> Checking the seat is AVAILABLE again..."
curl -sf "$API/shows/$SHOW_ID/seat-map" | jq .

if [ "$FINAL_STATE" = "EXPIRED" ]; then
  echo "==> PASS: booking expired and the seat freed up with payment-service down the whole time."
else
  echo "==> FAIL: expected booking state EXPIRED, got $FINAL_STATE"
  exit 1
fi
