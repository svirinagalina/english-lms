"""Records sleep-story narration with a Microsoft neural voice (edge-tts).

Usage: python make-sleep-audio.py <stories.json> <out_dir>
stories.json: [{"id": "<SleepStory id>", "text": "..."}]
Writes <out_dir>/<id>.mp3, which GET /api/sleep-stories/:id/audio serves.
Needs `pip install edge-tts`.
"""
import asyncio
import json
import os
import sys

import edge_tts

VOICE = "en-US-AvaMultilingualNeural"  # calm, unhurried
RATE = "-12%"  # bedtime pace


async def record(story, out_dir):
    path = os.path.join(out_dir, f"{story['id']}.mp3")
    await edge_tts.Communicate(story["text"], VOICE, rate=RATE).save(path + ".part")
    os.replace(path + ".part", path)
    print(f"ok {story['id']} ({os.path.getsize(path) // 1024} KB)")


async def main(stories_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    with open(stories_path, encoding="utf-8") as f:
        stories = json.load(f)
    for story in stories:
        await record(story, out_dir)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
