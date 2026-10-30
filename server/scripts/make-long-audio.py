"""Records long sleep-story narration paragraph by paragraph, with pauses and a deep voice.

Usage: python make-long-audio.py <stories.json> <out_dir>
stories.json: [{"id": "<file name without .mp3>", "text": "...", "language": "en" | "ru", "minutes": optional target}]
Writes <out_dir>/<id>.mp3.

The pause after each paragraph is stretched (3.5 to 9 seconds) so the story lasts about
`minutes` (30 by default). Recorded paragraphs are cached in <out_dir>/.cache, so a rerun
only records what changed (SLEEP_AUDIO_CACHE moves the cache elsewhere).

Why paragraph by paragraph: one long request to edge-tts fails easily, and a pause
between paragraphs makes the narration feel human and slow. After the recording,
ffmpeg lowers the pitch a little (Dmitry refuses edge-tts pitch changes) and warms
the bass. Needs `pip install edge-tts imageio-ffmpeg`.
"""
import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

import edge_tts
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

VOICES = {
    # Most natural deep male voices edge-tts offers for each language.
    "en": [{"voice": "en-US-AndrewMultilingualNeural", "rate": "-20%", "pitch": "-10Hz"}],
    # Andrew reads Russian too: ru-RU-DmitryNeural (native) keeps failing with NoAudioReceived,
    # sometimes in the middle of a story, so the same narrator voices both languages.
    "ru": [{"voice": "en-US-AndrewMultilingualNeural", "rate": "-18%", "pitch": "-10Hz"}],
}
CONCURRENCY = 4
MIN_PAUSE, MAX_PAUSE = 3.5, 9.0  # seconds after every paragraph
BREATH_EXTRA = 5.5  # more after a paragraph that asks to breathe
TARGET_MINUTES = 30
BREATH = re.compile(r"breath|вдох|выдох|дыш", re.IGNORECASE)
# Pitch down about 8% (keeps the duration), then a warmer low end.
DEEPEN = "asetrate=24000*0.92,aresample=24000,atempo=1/0.92,bass=g=5:f=120,loudnorm=I=-18:TP=-2"


async def speak(text, settings, path, attempts=8):
    for attempt in range(attempts):
        try:
            await edge_tts.Communicate(text, settings["voice"], rate=settings["rate"], pitch=settings["pitch"]).save(path)
            if os.path.getsize(path) > 0:
                return
        except Exception as err:  # network hiccups and throttling: retry with a pause
            if attempt == attempts - 1:
                raise RuntimeError(f"could not record: {text[:60]}") from err
        await asyncio.sleep(3 * (attempt + 1))


def run_ffmpeg(args):
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


async def pick_voice(language, sample, tmp):
    options = VOICES[language]
    for settings in options[:-1]:
        try:
            await speak(sample, settings, os.path.join(tmp, "probe.mp3"), attempts=3)
            return settings
        except RuntimeError:
            print(f"  {settings['voice']} unavailable, using {options[-1]['voice']}", flush=True)
    return options[-1]


def wav_seconds(path):
    return (os.path.getsize(path) - 44) / (24000 * 2)


async def record(story, out_dir):
    paragraphs = [p.strip() for p in story["text"].split("\n\n") if p.strip()]
    cache = os.environ.get("SLEEP_AUDIO_CACHE", os.path.join(out_dir, ".cache"))
    os.makedirs(cache, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        settings = await pick_voice(story["language"], paragraphs[0][:200], tmp)
        # A few paragraphs at a time: one by one, a 30-minute story takes ~20 minutes.
        sem = asyncio.Semaphore(CONCURRENCY)

        def cached(paragraph):
            key = hashlib.sha1(f"{settings['voice']}|{settings['rate']}|{settings['pitch']}|{paragraph}".encode()).hexdigest()
            return os.path.join(cache, f"{key}.wav")

        async def one(i, paragraph):
            wav = cached(paragraph)
            if os.path.exists(wav):
                return
            async with sem:
                mp3 = os.path.join(tmp, f"p{i:03d}.mp3")
                await speak(paragraph, settings, mp3)
                run_ffmpeg(["-i", mp3, "-ar", "24000", "-ac", "1", wav + ".part.wav"])
                os.replace(wav + ".part.wav", wav)

        await asyncio.gather(*(one(i, p) for i, p in enumerate(paragraphs)))
        wavs = [cached(p) for p in paragraphs]
        breaths = [bool(BREATH.search(p)) for p in paragraphs]
        speech = sum(wav_seconds(w) for w in wavs)
        target = story.get("minutes", TARGET_MINUTES) * 60
        pause = (target - speech - BREATH_EXTRA * sum(breaths)) / len(paragraphs)
        pause = round(min(MAX_PAUSE, max(MIN_PAUSE, pause)), 1)
        silences = {}
        for seconds in {pause, round(pause + BREATH_EXTRA, 1)}:
            path = os.path.join(tmp, f"silence-{seconds}.wav")
            run_ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(seconds), path])
            silences[seconds] = path
        parts = []
        for wav, breath in zip(wavs, breaths):
            parts.append(wav)
            parts.append(silences[round(pause + BREATH_EXTRA, 1) if breath else pause])
        listing = os.path.join(tmp, "list.txt")
        with open(listing, "w", encoding="utf-8") as f:
            f.writelines(f"file '{p}'\n" for p in parts)
        out = os.path.join(out_dir, f"{story['id']}.mp3")
        run_ffmpeg(["-f", "concat", "-safe", "0", "-i", listing, "-af", DEEPEN, "-ar", "24000", "-ac", "1", "-b:a", "48k", out + ".part.mp3"])
        os.replace(out + ".part.mp3", out)
    probe = subprocess.run([FFMPEG, "-i", out], capture_output=True, text=True).stderr
    duration = re.search(r"Duration: (\d+:\d+:\d+)", probe)
    print(f"ok {story['id']} {duration.group(1) if duration else '?'} ({len(paragraphs)} paragraphs, pause {pause}s, {settings['voice']})", flush=True)


async def main(stories_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    with open(stories_path, encoding="utf-8") as f:
        stories = json.load(f)
    for story in stories:
        await record(story, out_dir)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
