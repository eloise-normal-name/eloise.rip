# Makefile for Media Transcoder

# Variables
CC = gcc
CXX = g++
CFLAGS = -O2
CXXFLAGS = -O2
HEVC_FLAGS = -x265
AVIF_FLAGS = -lavif
M4A_FLAGS = -lamf

# Suffix handling
SUFFIX = _hq

# Max dimensions
MAX_DIM = 1920x1080

# Targets
.PHONY: all clean transcode

all: transcode

transcode: video image audio

video:
	$(CXX) $(CXXFLAGS) $(HEVC_FLAGS) -o video_transcoder video_transcoder.cpp

image:
	$(CXX) $(CXXFLAGS) $(AVIF_FLAGS) -o image_transcoder image_transcoder.cpp

audio:
	$(CXX) $(CXXFLAGS) $(M4A_FLAGS) -o audio_transcoder audio_transcoder.cpp

clean:
	rm -f video_transcoder image_transcoder audio_transcoder

# Parallel build support
.PARALLEL: video image audio
