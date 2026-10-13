#!/usr/bin/env python3
# THROWAWAY (#138). Renders RESULTS.md's tables from results/*.jsonl.
# Not part of the bench itself; a one-off helper, run by hand.
import json
import statistics as st
from collections import defaultdict

DECKS = ['carouseldeck', 'one-instance', 'embla', 'keen', 'swiper', 'splide', 'flicking']
LABELS = {
    'carouseldeck': 'carouseldeck (shipped)',
    'one-instance': 'carouseldeck (one-instance)',
    'embla': 'Embla 8.6.0',
    'keen': 'Keen 6.8.6',
    'swiper': 'Swiper 14.3.0',
    'splide': 'Splide 4.1.4',
    'flicking': 'Flicking 4.17.1',
}
SCENARIOS = ['next-seam', 'drag-throw', 'wheel', 'touch-flick']
LOADS = [0, 100, 200]

def load(path):
    try:
        with open(path) as f:
            return [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return []

def med(values):
    values = [v for v in values if v is not None]
    return round(st.median(values), 1) if values else None

def cell(rows, deck, scenario, key_path):
    vals = []
    for load_ in LOADS:
        matching = [r for r in rows if r['deck'] == deck and r['scenario'] == scenario and r['load'] == load_]
        v = []
        for r in matching:
            cur = r
            ok = True
            for k in key_path:
                if cur is None or k not in cur:
                    ok = False
                    break
                cur = cur[k]
            if ok and cur is not None:
                v.append(cur)
        vals.append(med(v))
    return '/'.join('-' if v is None else str(v) for v in vals)

def trace_table(rows, key_path, title, unit):
    lines = [f'### {title} ({unit}, load=0/100/200, median)', '']
    lines.append('| Deck | Next x6 | Drag+throw | Wheel | Touch flick |')
    lines.append('| --- | --- | --- | --- | --- |')
    for deck in DECKS:
        cells = [cell(rows, deck, s, key_path) for s in SCENARIOS]
        lines.append(f'| {LABELS[deck]} | ' + ' | '.join(cells) + ' |')
    lines.append('')
    return '\n'.join(lines)

def raf_table(rows, browser, key_path, title, unit):
    lines = [f'### {title}, {browser} (main-thread only; {unit}, load=0/100/200, median)', '']
    lines.append('| Deck | Next x6 | Drag+throw | Wheel |')
    lines.append('| --- | --- | --- | --- |')
    for deck in DECKS:
        cells = [cell(rows, deck, s, key_path) for s in ['next-seam', 'drag-throw', 'wheel']]
        lines.append(f'| {LABELS[deck]} | ' + ' | '.join(cells) + ' |')
    lines.append('')
    return '\n'.join(lines)

if __name__ == '__main__':
    chromium = load('bench/results/chromium.jsonl')
    firefox = load('bench/results/firefox.jsonl')
    webkit = load('bench/results/webkit.jsonl')
    cost = load('bench/results/cost.jsonl')

    out = []
    out.append('## Chromium (traced)\n')
    out.append(trace_table(chromium, ['trace', 'longestStallMs'], 'Longest visual stall', 'ms'))
    out.append(trace_table(chromium, ['trace', 'hitchRatioMsPerS'], 'Hitch time ratio', 'ms/s'))
    out.append(trace_table(chromium, ['trace', 'droppedPct'], 'Dropped frames', '%'))
    out.append(trace_table(chromium, ['trace', 'inputToFirstMovedMs'], 'Input to first moved frame', 'ms'))
    out.append(trace_table(chromium, ['settleMs'], 'Settle time (wall clock)', 'ms'))
    out.append(trace_table(chromium, ['raf', 'blankFrames'], 'Blank/seam frames (elementFromPoint; noisy, see method notes)', 'count'))
    out.append(trace_table(chromium, ['raf', 'reversals'], 'Reversals (re-snap/overshoot)', 'count'))
    out.append(trace_table(chromium, ['loaf', 'totalBlocking'], 'LoAF blocking time during the scenario (dominated by the injected load)', 'ms'))

    out.append('## Firefox (rAF/position only, main-thread view)\n')
    out.append(raf_table(firefox, 'Firefox', ['settleMs'], 'Settle time (wall clock)', 'ms'))
    out.append(raf_table(firefox, 'Firefox', ['raf', 'maxStep'], 'Max per-frame step', 'slide units'))
    out.append(raf_table(firefox, 'Firefox', ['raf', 'blankFrames'], 'Blank/seam frames (noisy)', 'count'))

    out.append('## WebKit (Playwright WPE on Linux, rAF/position only)\n')
    out.append(raf_table(webkit, 'WebKit', ['settleMs'], 'Settle time (wall clock)', 'ms'))
    out.append(raf_table(webkit, 'WebKit', ['raf', 'maxStep'], 'Max per-frame step', 'slide units'))
    out.append(raf_table(webkit, 'WebKit', ['raf', 'blankFrames'], 'Blank/seam frames (noisy)', 'count'))

    # Cost
    out.append('## Cost\n')
    bundle_sizes = {
        'carouseldeck': 8852, 'embla': 9858, 'keen': 8604,
        'swiper': 23656, 'splide': 16340, 'flicking': 36149,
    }
    out.append('### Min+gzip per deck (bench entry: library + the few lines of glue every deck has)\n')
    out.append('| Deck | Min+gzip |')
    out.append('| --- | --- |')
    for deck, bytes_ in bundle_sizes.items():
        out.append(f'| {LABELS[deck]} | {bytes_/1024:.2f} KB |')
    out.append('(one-instance uses this app\'s own prototype code, not a packaged library -- no standalone bundle size measured for it.)\n')

    out.append('### Init time (ms, median not needed: single run per cell) and heap (CDP JSHeapUsedSize, KB)\n')
    out.append('| Deck | init @6 | init @10 | init @50 | heap @6 KB | heap @10 KB | heap @50 KB |')
    out.append('| --- | --- | --- | --- | --- | --- | --- |')
    by_deck = defaultdict(dict)
    for r in cost:
        if 'slides' in r:
            by_deck[r['deck']][r['slides']] = r
    for deck in DECKS:
        d = by_deck.get(deck, {})
        def f(s, key):
            v = d.get(s, {}).get(key)
            return '-' if v is None else (f'{v:.1f}' if key == 'initDurationMs' else f'{v/1024:.0f}')
        out.append(f"| {LABELS[deck]} | {f(6,'initDurationMs')} | {f(10,'initDurationMs')} | {f(50,'initDurationMs')} | {f(6,'heapBytes')} | {f(10,'heapBytes')} | {f(50,'heapBytes')} |")
    out.append('')

    out.append('### Script time per frame, idle vs a 1s Next-click loop (LoAF; no injected load)\n')
    out.append('| Deck | idle count/blocking ms | moving count/blocking ms |')
    out.append('| --- | --- | --- |')
    for r in cost:
        if r.get('kind') == 'script-time':
            i, m = r['idle'], r['moving']
            out.append(f"| {LABELS[r['deck']]} | {i['count']}/{i['totalBlocking']:.0f} | {m['count']}/{m['totalBlocking']:.0f} |")
    out.append('')

    print('\n'.join(out))
