# Work Station — Korean School Homework App

Web app for iPhone, Android, and desktop. Record voice memos, capture photos and videos, organize by last saved date, and share multiple selected files through your device's share menu.

Live web version: https://work-station.truecoot2.chatgpt.site

## Run locally

Serve this folder using `python3 -m http.server 8080`, then visit `http://localhost:8080`. Camera and microphone require HTTPS or localhost. For a phone, use the HTTPS live version.

## GitHub Pages

In this repository, open Settings → Pages. Choose Deploy from a branch, then main and / (root). The expected URL after GitHub finishes deploying is https://07osu49.github.io/KoreanSchoolHomeworkApp/.

## Files and privacy

Captures are saved in IndexedDB on the current device and browser. They are not uploaded to GitHub or synced between devices. Download captures to keep your own backup. Native file sharing lists only installed apps that accept the selected file types.

New capture names use the device's local date, for example `2026-10-12 - Eina - photo`. Duplicate attachment names receive numbered suffixes when sharing together.

## App source backups

`backups/` contains every app source version created during this session. These backups contain source code, not phone recordings or photos. See `backups/README.md` for version details.
