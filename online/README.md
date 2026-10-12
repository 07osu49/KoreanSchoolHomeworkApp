# 콜럼버스 한국학교

Live app: https://work-station.truecoot2.chatgpt.site
Private parent/teacher exchange: https://work-station.truecoot2.chatgpt.site/school

## Parent and teacher connection

1. Teacher opens Parent & teacher exchange, signs in with ChatGPT, selects Teacher, and creates an invitation for a named student.
2. Teacher gives that one-time code privately to the correct parent. Codes expire in 14 days.
3. Parent signs in with their own account and enters the code in Parent view.
4. Parent and that assigned teacher exchange messages, photos, videos, and voice recordings for that student.

No class announcements or parent-to-parent sharing are included. Server authorization checks both participants for every conversation and file. Invitations are stored as hashes. Uploads use private R2 storage; SQLite records use D1. Limits are eight files and 50 MB total per message. Authenticated API responses and downloads are not cached by the app.

## Existing capture tools

The original four student tabs and device-local capture library remain at the home page. Existing files stay on the device and are not automatically uploaded. Select saved captures and use Send to teacher to send them to a student already connected to your parent account. Native Share selected remains available.

## Build and verification

Install locked dependencies, run `npm test`, `npx tsc --noEmit`, and `npm run build`. Schema changes are generated with `npm run db:generate`. Preserve the included Sites build integration and `.openai/hosting.json` DB and BUCKET bindings. Publish with the Sites workflow; do not put credentials in source.

Sign-in is provided by Sites through `/signin-with-chatgpt`; no custom passwords or authentication keys are needed. A normal static GitHub Pages deployment cannot run the online API. Use the live Sites deployment for private exchange.
