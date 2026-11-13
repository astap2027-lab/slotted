# Daybook as a claude.ai page

`host.js` connects the app to the page's private database. Rebuild the single-file page with:

```bash
python3 daybook/claude-page/build.py daybook out.html daybook/claude-page/host.js
```

Published at https://claude.ai/artifact/NLpU2TZ9tUXM7sBxTX63fQ (private to the owner).

## Email view (claude.ai page only)

The page declares these capabilities when published:

```json
{"db": {}, "downloads": {}, "user": {},
 "mcp": {"servers": [{"server": "Gmail", "tools": ["search_threads", "get_thread"]}]},
 "sample": {}}
```

Only Gmail's two read tools are allowed, so the page can't send, delete or change email. Pressing **Read my email** searches the inbox (last day, 3 days or week, up to 20 threads), reads each thread as plain text, and asks Claude (`sample`) to sort it into needs a reply, deadlines and events, and safe to ignore, plus suggested tasks. `cleanMailSummary()` in `core.js` checks the answer (known emails only, real days). Email text is kept only while the page is open. Added tasks keep `fromEmail` (the thread id).
