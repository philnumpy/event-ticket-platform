# Load test results

**Not yet populated.** This is a template, not a report — see
[README.md](README.md) for why (Docker unavailable in the development
environment) and the exact procedure to fill it in for real.

Every number below must come from an actual `k6 run` output or the
seat-map integrity check. Do not estimate, round up, or invent a number
to fill a gap — leave it blank and say so instead.

## Run configuration

| | Without cache | With cache |
|---|---|---|
| Date run | _(pending)_ | _(pending)_ |
| `SEAT_COUNT` | | |
| `MAX_VUS` | | |
| Run duration | | |
| core-api replicas | | |

## Read-path latency (the stated NFR: p99 < 200ms)

| Metric | Without cache | With cache |
|---|---|---|
| `browse_duration` p50 | | |
| `browse_duration` p95 | | |
| `browse_duration` p99 | | |
| `seatmap_duration` p50 | | |
| `seatmap_duration` p95 | | |
| `seatmap_duration` p99 | | |

## Throughput and booking outcomes

| Metric | Without cache | With cache |
|---|---|---|
| Total HTTP requests (`http_reqs`) | | |
| Requests/sec | | |
| `booking_success` | | |
| `booking_conflict_409` | | |
| `booking_other_error` (should be 0) | | |
| `payment_success` | | |
| `http_req_failed` rate | | |

## Zero-double-booking check

```
# paste the actual jq output from k6/README.md step 4 here
```

- [ ] `BOOKED` seat count == `CONFIRMED` booking count for the show
- [ ] No seat ID appears in more than one `CONFIRMED` booking

## Notes

_(Fill in anything that affected the numbers: whether the VU count was
actually sustained without the error rate exceeding threshold, whether
MAX_VUS had to be lowered from 10,000, what host resources were the
bottleneck, whether caching's effect was visible at this VU count or only
showed up at higher contention, etc. This section is where the honest
interpretation goes — the raw numbers above don't speak for themselves.)*
