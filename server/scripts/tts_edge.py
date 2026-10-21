"""Voices TOEFL and Listening course lines with Microsoft neural voices (edge-tts).

Usage: python tts_edge.py <lines.json> <out_dir>
lines.json: [{"voice": "en-US-AvaMultilingualNeural", "text": "...", "file": "<hash>.mp3", "rate": "-6%" (optional)}]
Called by generate-toefl-audio.js and generate-listening-audio.js; needs `pip install edge-tts`.
"""
import asyncio
import json
import os
import sys

import edge_tts

VOLUME = "+25%"  # louder than the default, students listen on laptops


async def one(line, out_dir, sem):
    path = os.path.join(out_dir, line["file"])
    async with sem:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(line["text"], line["voice"], rate=line.get("rate", "+0%"), volume=VOLUME).save(path + ".part")
                os.replace(path + ".part", path)
                return True
            except Exception as err:  # network hiccups: retry a few times
                if attempt == 3:
                    print(f"failed: {line['text'][:50]} ({err})", file=sys.stderr)
                await asyncio.sleep(2 * (attempt + 1))
    return False


async def main():
    lines = json.load(open(sys.argv[1]))
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    sem = asyncio.Semaphore(4)
    results = await asyncio.gather(*(one(l, out_dir, sem) for l in lines))
    print(f"voiced {sum(results)}/{len(lines)}")


asyncio.run(main())
