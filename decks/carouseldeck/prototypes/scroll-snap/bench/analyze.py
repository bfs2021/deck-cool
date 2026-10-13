#!/usr/bin/env python3
# THROWAWAY (#138). Turns results/*.jsonl into the medians RESULTS.md
# tables are built from. Not part of the bench itself; a helper script.
import json
import statistics as st
import sys
from collections import defaultdict

def load(path):
    try:
        with open(path) as f:
            return [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return []

def pct(values, p):
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * p
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)

def med(values):
    values = [v for v in values if v is not None]
    return st.median(values) if values else None

def summarize_chromium(rows):
    groups = defaultdict(list)
    for r in rows:
        groups[(r['deck'], r['scenario'], r['load'])].append(r)
    out = {}
    for key, g in groups.items():
        t = [r['trace'] for r in g if r['trace']]
        raf = [r['raf'] for r in g]
        out[key] = {
            'n': len(g),
            'longestStall_med': med([x['longestStallMs'] for x in t]),
            'longestStall_p90': pct([x['longestStallMs'] for x in t], 0.9),
            'hitch_med': med([x['hitchRatioMsPerS'] for x in t]),
            'dropped_med': med([x['droppedPct'] for x in t]),
            'inputToMoved_med': med([x['inputToFirstMovedMs'] for x in t if x['inputToFirstMovedMs'] is not None]),
            'settleMs_med': med([r['settleMs'] for r in g]),
            'blankFrames_med': med([r['raf']['blankFrames'] for r in g]),
            'reversals_med': med([r['raf']['reversals'] for r in g]),
            'checkerboarded_med': med([x['checkerboardedFrames'] for x in t]),
        }
    return out

def summarize_raf(rows):
    groups = defaultdict(list)
    for r in rows:
        groups[(r['deck'], r['scenario'], r['load'])].append(r)
    out = {}
    for key, g in groups.items():
        out[key] = {
            'n': len(g),
            'settleMs_med': med([r['settleMs'] for r in g]),
            'maxStep_med': med([r['raf']['maxStep'] for r in g]),
            'reversals_med': med([r['raf']['reversals'] for r in g]),
            'blankFrames_med': med([r['raf']['blankFrames'] for r in g]),
            'frames_med': med([r['raf']['frames'] for r in g]),
        }
    return out

if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else 'bench/results'
    chromium = load(f'{base}/chromium.jsonl')
    firefox = load(f'{base}/firefox.jsonl')
    webkit = load(f'{base}/webkit.jsonl')
    cost = load(f'{base}/cost.jsonl')

    print(f'chromium rows: {len(chromium)}')
    print(f'firefox rows: {len(firefox)}')
    print(f'webkit rows: {len(webkit)}')
    print(f'cost rows: {len(cost)}')

    import pickle
    data = {
        'chromium': summarize_chromium(chromium),
        'firefox': summarize_raf(firefox),
        'webkit': summarize_raf(webkit),
        'cost': cost,
    }
    with open(f'{base}/summary.json', 'w') as f:
        json.dump(
            {k: ({f'{a}|{b}|{c}': v for (a, b, c), v in val.items()} if k != 'cost' else val)
             for k, val in data.items()},
            f, indent=1
        )
    print(f'wrote {base}/summary.json')
