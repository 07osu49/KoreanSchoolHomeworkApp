# 콜럼버스 한국학교

Live capture app: https://work-station.truecoot2.chatgpt.site
Private parent/teacher exchange: https://work-station.truecoot2.chatgpt.site/school

The connected application source is in `online/`. It uses the Sites authentication integration, D1 for student connections and conversations, and private R2 storage for uploads. Teachers create one-time invitations for named students; parents accept those invitations using their own signed-in accounts. Each parent exchanges files only with the assigned teacher for that child.

Existing device-local capture files are not automatically uploaded. In the live app, select captures and choose Send to teacher after pairing. The exchange also accepts photos, videos, voice recordings, and private teacher replies. Upload limits are eight files and 50 MB total per message.

## Source and backups

- `online/`: complete connected application, schema migrations, and access-control tests. See `online/README.md` for build and setup instructions.
- Root `index.html`, `app.js`, and supporting files: original four-student device-local capture app, usable with a static server or GitHub Pages. Private exchange requires the live Sites server and is not supported by static GitHub Pages.
- `backups/`: preserved original source archives from the initial five versions. Subsequent source changes are preserved in Git history.

No personal photos, recordings, or account credentials are stored in this repository.
