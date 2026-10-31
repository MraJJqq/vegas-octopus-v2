# Layer Core Rebuild — Architecture Contract

Branch: `refactor/layer-core-rebuild`

## Scope and invariants

Rebuild only Layer 3 (market cards + scroll) and Layer 5 (signal K-line + rotation), plus their bridge. Do not modify the background, latest-events presentation, bottom ticker presentation, card template, card dimensions, 27-symbol order, signal semantics, or established interactions.

Bitget is the only market-data source. Keep spot stock mapping separate from USDT-FUTURES contracts. Stock mini candles use the spot candle endpoint; futures mini candles use the Mix candle endpoint.

## Ownership model

### Layer 3

- `market-universe.js`: immutable 27-symbol universe, ordering, Bitget instrument metadata.
- `market-data.js`: ticker snapshots, stock reality-symbol map, mini-candle requests, cache, refresh lifecycle, visibility handling.
- `market-card-view.js`: create/update card DOM, paint prices and percentages, draw mini charts, formal-signal visual state, pointer tilt.
- `market-card-scroll.js`: sole owner of scroll position, auto-scroll, wheel smoothing, touch drag/inertia, loop recycling, focus scale/opacity, and its single RAF lifecycle.
- `market-cards.js`: composition root only; wires the preceding modules and exposes the cross-layer bridge.

### Layer 5

- `kline-data.js`: Bitget spot/mix context, latest candles, historical pagination, candle cache/request deduplication, EMA calculation.
- `kline-chart.js`: chart instances, chart resize, gesture input, viewport persistence, data application and chart teardown.
- `right-signal-scroll.js`: composition root and the only owner of visibility, active symbol, active chart layer, rotation state, cycle/refresh timers, manual selection, and signal queue reconciliation.

### Cross-layer contract

Only these public methods may cross the Layer 3/Layer 5 boundary:

- `VegasLayer5ShowSymbol(symbol)`: request manual symbol selection.
- `VegasLayer5SetAutoQueue(symbols)`: replace the ordered formal-signal queue.
- `VegasApplyFormalSignals()`: update card signal styling and forward the queue to Layer 5.

No module may read or mutate another module's private state. Calls must be safe before the receiving layer initializes; the composition root owns a single pending selection/queue handoff.

## Lifecycle rules

- Each subsystem has one initializer and one destroy path.
- Each animation loop has one RAF owner; each scheduled task has one timer owner.
- Hidden documents stop recurring animation and polling. Visibility restoration performs one controlled refresh and one resize.
- Every async chart load is guarded by a monotonically increasing request token and symbol/timeframe identity.
- Data refreshes merge by candle timestamp; older history responses cannot overwrite newer candle values.
- Chart resize occurs after the root becomes visible and after layout, not while hidden.
- No DOM-wide polling, duplicate listeners, stale compatibility implementations, or parallel legacy controllers remain.

## Behavioral acceptance criteria

- 27 cards retain their current order, HTML template, size, styling, price format, and click behavior.
- Automatic full-loop duration remains approximately 120 seconds.
- Wheel and touch scrolling remain responsive; touch inertia and seamless bidirectional recycling remain.
- Focus scale and opacity remain visually equivalent.
- Only formal-signal symbols enter Layer 5's automatic queue.
- Layer 5 keeps 1H / 4H / 1D controls, Vegas EMA 12/36/43/144/169/576/676, dual-layer transition, 5-second clear + 5-second transition, manual card selection, historical backfill, viewport memory, and free pan/zoom.
- Layer 5 is hidden when there is no formal queue and no manual selection.
- Bottom ticker and latest-events templates are unchanged.

## Validation gates

1. Static syntax checks for every JavaScript file.
2. Contract checks for all cross-layer public methods and script load order.
3. Data-path checks for spot vs Mix futures endpoints.
4. Lifecycle checks for RAF/timers/listeners and hidden/visible transitions.
5. GitHub Actions deployment check.
6. Device validation is reported separately; deployment success is not treated as proof of device behavior.
