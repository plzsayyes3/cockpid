# Inbox Manager
Sequential transfer from configured Inbox to Daily and Images destinations (same repository).
Timestamp UID uses seconds, no new marker. Text conflicts retain source Markdown.
Missing Daily is created together with the verified text transfer (no SHA for create); existing files are never overwritten without their SHA. Image-only entries do not create Daily.
Images move independently even if Daily is missing or UID conflicts: verify destination SHA,
archive original, verify archive, delete source with SHA. Same-name different image is held.
Image-only groups never add text; exact existing timestamp and filename links are repaired when possible,
otherwise report link pending. Retained Markdown can recover previously moved referenced images
by comparing archive and destination SHA. Editable companions remain in Inbox.
The UI displays text, image and link results separately; partial success is 要確認.
Do not run from multiple devices at once. Stop after current item.
Top INBOX → DAILY and drawer MERGE TO DAILY open the same manager and auto-Pull; D opens manager.
Test: node --experimental-default-type=module --test workbench/inbox/transfer.test.js
