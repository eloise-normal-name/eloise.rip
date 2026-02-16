Title: Voice Recorder Page
Date: 2026-02-11
Summary: making a voice recorder app
Category: Self
Tags: Voice
thumbnail: images/voice-recorder-screenshot.avif

I added a voice recorder app [Voice Recorder](../voice-recorder.html)

It's browser-only, nothing gets uploaded anywhere.

## Features

* Ask for mic permission
* Record audio (saves as MP4 audio and video with waveform)
* Live waveform visualization while recording
* Real-time pitch detection overlay (shows your vocal pitch as you record!)
* Play back recordings locally
* Save video or audio files with Web Share API or direct download

## What's Working

The pitch visualizer is fully implemented! It uses autocorrelation to detect your fundamental frequency (80-400 Hz range, tuned for voice) and draws it as a blue trace on top of the waveform. The recording captures both the waveform and pitch visualization in the video.

## Future Ideas

* Adjustable pitch range for different voice types
* Toggle to show/hide pitch trace
* More visualizer styles
* Configuration UI for smoothing and colors

I have other silly app ideas too, feel free to message or dm about them if you want to collab or have suggestions
