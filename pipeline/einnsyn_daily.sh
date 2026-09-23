#!/bin/bash
# Nightly eInnsyn refresh: journal entries changed since the last run, their published
# files, and searchable text for every new file. One step at a time, each idempotent.
#
#   pipeline/einnsyn_daily.sh            fetch, download, extract, bundle
#   pipeline/einnsyn_daily.sh --push     ... and commit + push the data files when they changed
#
# Installed in crontab at midnight (see README); logs to $LOG, one line per step, and
# keeps a one-line status in $STATUS for a quick look.
set -u
REPO=/home/pc/git/AiMar
ARCHIVE=/media/pc/ext4TB/AiMar
DOCS_DIR=$ARCHIVE/docs/einnsyn
TEXT_DIR=$ARCHIVE/docs/text
LOG=$ARCHIVE/logs/einnsyn_daily.log
STATUS=$ARCHIVE/logs/einnsyn_daily.status
NODE=/usr/bin/node
CONDA=/home/pc/anaconda3/bin/conda
PUSH=0
[[ "${1:-}" == "--push" || "${AIMAR_PUSH:-0}" == "1" ]] && PUSH=1

stamp() { date -u +%FT%TZ; }
log() { echo "$(stamp) $*" >> "$LOG"; }
free_disk() { df -h "$ARCHIVE" | awk 'NR==2 {print $4}'; }

# The archive disk must be there: originals, texts and logs all live on it.
if [[ ! -d "$DOCS_DIR" ]]; then
  echo "$(stamp) archive disk not mounted at $ARCHIVE, nothing done" >&2
  exit 2
fi
mkdir -p "$ARCHIVE/logs"
exec 9>"$ARCHIVE/logs/einnsyn_daily.lock"
if ! flock -n 9; then
  log "another run is still going, skipped"
  exit 0
fi

export DOCS_DIR TEXT_DIR
cd "$REPO/web" || exit 1
log "start (push=$PUSH, $(free_disk) free)"

# 1. Journal entries updated since the last snapshot (the script keeps its own state).
count_entries() { $NODE -e "process.stdout.write(String(require('./public/data/cases.json').entries.length))" 2>/dev/null || echo 0; }
ENTRIES_BEFORE=$(count_entries)
if ! $NODE scripts/fetch-cases.mjs > "$ARCHIVE/logs/fetch-cases.last.log" 2>&1; then
  log "fetch-cases FAILED, see fetch-cases.last.log; stopping"
  echo "$(stamp) FAILED at fetch-cases" > "$STATUS"
  exit 1
fi
CASES=$(grep -oE "^cases.json: [0-9]+ entries in [0-9]+ cases for [0-9]+ localities" "$ARCHIVE/logs/fetch-cases.last.log" | tail -n 1)
ENTRIES_AFTER=$(count_entries)
# An incremental run only adds and updates; fewer entries means the window shrank or the API
# answered short, and the last good snapshot is put back rather than propagated.
if (( ENTRIES_AFTER < ENTRIES_BEFORE )); then
  log "fetch-cases produced $ENTRIES_AFTER entries, fewer than the $ENTRIES_BEFORE before: restoring the last snapshot and stopping"
  (cd "$REPO" && git checkout -- web/public/data/cases.json web/public/data/manifest.json)
  echo "$(stamp) FAILED at fetch-cases (entry count fell)" > "$STATUS"
  exit 1
fi
log "fetch-cases ok: ${CASES:-no summary line}"

# 1b. Fiskeridirektoratet's application list and map service: new applications with their pages.
$NODE scripts/fetch-applications.mjs > "$ARCHIVE/logs/fetch-applications.last.log" 2>&1 || log "fetch-applications exit=$?"
log "applications: $(grep -oE 'application list: .*' "$ARCHIVE/logs/fetch-applications.last.log" | tail -n 1)"
$NODE scripts/fetch-hearings.mjs > "$ARCHIVE/logs/fetch-hearings.last.log" 2>&1 || log "fetch-hearings exit=$?"
log "hearings: $(grep -oE 'hearings.json: .*' "$ARCHIVE/logs/fetch-hearings.last.log" | tail -n 1)"

# 2. Files published for the new entries (permanent 502s stay pending, retried next night).
BEFORE=$(ls "$DOCS_DIR" | wc -l)
$NODE scripts/fetch-docs.mjs > "$ARCHIVE/logs/fetch-docs.last.log" 2>&1
RC=$?
AFTER=$(ls "$DOCS_DIR" | wc -l)
log "fetch-docs exit=$RC, $((AFTER - BEFORE)) new files ($AFTER total, $(free_disk) free)"

# 3. Text for every file without a successful record: PDF text, OCR where needed, pandoc, xlsx.
cd "$REPO" || exit 1
$CONDA run -n aimar-ocr --no-capture-output python pipeline/docs/extract_text.py --workers 4 > "$ARCHIVE/logs/extract-text.last.log" 2>&1
RC=$?
log "extract_text exit=$RC: $(grep -oE '[0-9]+ originals, [0-9]+ indexed, [0-9]+ to extract' "$ARCHIVE/logs/extract-text.last.log" | tail -n 1)"
# 3b. Documents attached to the public-inspection notices, same extractor, same text archive.
DOCS_DIR=$ARCHIVE/docs/lysingsblad/vedlegg $CONDA run -n aimar-ocr --no-capture-output python pipeline/docs/extract_text.py --workers 2 >> "$ARCHIVE/logs/extract-text.last.log" 2>&1 || log "extract_text (lysingsblad) exit=$?"

# 4. Attach the texts to docs.json, bundle them for the app, re-read the current-survey reports.
cd "$REPO/web" || exit 1
$NODE scripts/apply-doc-text.mjs >> "$ARCHIVE/logs/extract-text.last.log" 2>&1 || log "apply-doc-text exit=$?"
$NODE scripts/copy-doc-text.mjs >> "$ARCHIVE/logs/extract-text.last.log" 2>&1 || log "copy-doc-text exit=$?"
$NODE scripts/extract-currents.mjs >> "$ARCHIVE/logs/extract-text.last.log" 2>&1 || log "extract-currents exit=$?"
$NODE scripts/apply-hearing-text.mjs >> "$ARCHIVE/logs/extract-text.last.log" 2>&1 || log "apply-hearing-text exit=$?"
TEXTS=$(ls public/data/text | wc -l)
log "bundled: $TEXTS texts, $(du -sh public/data/text | cut -f1)"

# 5. Optionally publish: only the data files, only when something changed.
if [[ $PUSH == 1 ]]; then
  cd "$REPO" || exit 1
  git add web/public/data web/data-state
  if git diff --cached --quiet; then
    log "push: nothing changed"
  else
    git commit -q -m "Nightly eInnsyn refresh: ${CASES:-cases updated}, $TEXTS texts" && git push -q origin HEAD
    log "push exit=$?"
  fi
fi

SUMMARY="$(stamp) ok: ${CASES:-cases unchanged}; $((AFTER - BEFORE)) new files; $TEXTS texts; $(free_disk) free"
echo "$SUMMARY" > "$STATUS"
log "done"
