# スクショとIdeaのカード作業面

Approved in conversation on 2026-11-05. Purpose: revisit screenshots left in Photos and finish acting on them, while rediscovering canonical Ideas.

Two columns: mixed card grid, and collapsible INBOX composer. One image plus editable title/memo per capture. Direct photo selection (multiple creates separate cards), paste and drop. Checkbox means handled/no longer needed; hide by default, retain and restore via handled filter. Idea cards read canonical `my-storage-note/views/ideas.json`; no wiki links or Idea completion mutations. Rank using last 14 JST calendar dates of Daily/INBOX text, mix about 70% relevant and 30% shuffled; refresh only on explicit action, pinned Ideas persist in browser.

Sources: capture metadata and original raster images in private `mynotebook/03_scrap/`, existing configured INBOX for sidebar. Original file is retained; never commit personal data to public cockpid. Screen launched as separate Cards app from HOME, consistent with existing independent app architecture. No automatic Photos integration.

Approaches considered: direct uploads selected over external photo-library import; unified display over source copying. Existing canonical Idea view is read-only. Implementation calls: independent app to preserve quiet HOME, original raster uploads rather than lossy image conversion, lexical Japanese token matching without external AI services, small per-card JSON files and immutable image assets. File size limit 15 MB, PNG/JPEG/WebP/GIF only (HEIC requires export to supported format).
