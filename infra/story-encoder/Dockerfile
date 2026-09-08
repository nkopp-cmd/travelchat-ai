# Released stable point version: https://www.debian.org/News/2025/20250517
# Test host only. Package updates are not locked; record the image ID in evidence.
# Debian FFmpeg + libx264 includes GPL components. Review distribution obligations
# and H.264 patent licensing before shipping. This is not a production encoder.
FROM debian:12.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /artifacts
USER 65534:65534
