#!/usr/bin/env bash
set -u

ROOT="${1:-.}"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

pass() {
  printf '[PASS] %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  printf '[FAIL] %s\n' "$1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

warn() {
  printf '[WARN] %s\n' "$1"
  WARN_COUNT=$((WARN_COUNT + 1))
}

info() {
  printf '[INFO] %s\n' "$1"
}

find_manifest() {
  find "$ROOT" -type f -name manifest.json \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/build/*' \
    ! -path '*/coverage/*' \
    | head -n 1
}

list_source_files() {
  find "$ROOT" -type f \
    \( -name '*.js' -o -name '*.cjs' -o -name '*.mjs' -o -name '*.ts' -o -name '*.tsx' -o -name '*.jsx' -o -name '*.json' -o -name '*.html' \) \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/build/*' \
    ! -path '*/coverage/*'
}

search_any() {
  local pattern="$1"
  shift
  grep -R -I -E -n "$pattern" "$@" >/dev/null 2>&1
}

search_files_any() {
  local pattern="$1"
  local files="$2"
  if [ -z "$files" ]; then
    return 1
  fi
  printf '%s\n' "$files" | while IFS= read -r file; do
    [ -n "$file" ] || continue
    grep -I -E -n "$pattern" "$file" >/dev/null 2>&1 && exit 0
  done
}

manifest_json_value() {
  local expr="$1"
  if have_cmd jq; then
    jq -r "$expr // empty" "$MANIFEST" 2>/dev/null
    return 0
  fi
  return 1
}

MANIFEST="$(find_manifest)"
if [ -z "$MANIFEST" ]; then
  fail "No manifest.json found under $ROOT"
  info "This verifier expects a Chrome extension repository or a repository containing one."
  printf '\nSummary: %s passed, %s failed, %s warnings\n' "$PASS_COUNT" "$FAIL_COUNT" "$WARN_COUNT"
  exit 1
fi

info "Using manifest: $MANIFEST"

SOURCE_FILES="$(list_source_files)"
if [ -z "$SOURCE_FILES" ]; then
  fail "No relevant source files found under $ROOT"
  printf '\nSummary: %s passed, %s failed, %s warnings\n' "$PASS_COUNT" "$FAIL_COUNT" "$WARN_COUNT"
  exit 1
fi

if have_cmd jq; then
  info "jq detected; using structured manifest checks"
else
  warn "jq not available; falling back to text-based manifest checks"
fi

if have_cmd node; then
  info "node detected; JSON validation is available for export samples if present"
else
  warn "node not available; JSON validation beyond jq will be skipped"
fi

# 1. Manifest / MV3 structure
if have_cmd jq; then
  MV="$(manifest_json_value '.manifest_version')"
  if [ "$MV" = "3" ]; then
    pass "Manifest declares version 3"
  else
    fail "Manifest version is not 3"
  fi

  EXT_NAME="$(manifest_json_value '.name')"
  if printf '%s' "$EXT_NAME" | grep -i 'browser-parrot' >/dev/null 2>&1; then
    pass "Manifest name matches browser-parrot"
  elif search_any 'browser-parrot' "$ROOT"; then
    warn "Manifest name does not clearly match browser-parrot, but repository references browser-parrot"
  else
    fail "Extension identity does not clearly match browser-parrot"
  fi

  if [ -n "$(manifest_json_value '.action.default_popup')" ]; then
    pass "Manifest defines action.default_popup"
  else
    fail "Manifest does not define action.default_popup"
  fi

  if [ -n "$(manifest_json_value '.background.service_worker')" ]; then
    pass "Manifest defines a background service worker"
  else
    fail "Manifest does not define a background service worker"
  fi

  if [ -n "$(manifest_json_value '.devtools_page')" ]; then
    pass "Manifest defines a devtools page"
  else
    fail "Manifest does not define a devtools page"
  fi

  CONTENT_COUNT="$(jq '.content_scripts | length' "$MANIFEST" 2>/dev/null || true)"
  if [ -n "$CONTENT_COUNT" ] && [ "$CONTENT_COUNT" != "0" ]; then
    pass "Manifest defines content scripts"
  elif search_any '(content[_ -]?script|chrome\.scripting|browser\.scripting)' "$ROOT"; then
    warn "Content capture code exists, but manifest content script registration was not found directly"
  else
    fail "No content script registration or equivalent injection logic found"
  fi
else
  if grep -E '"manifest_version"[[:space:]]*:[[:space:]]*3' "$MANIFEST" >/dev/null 2>&1; then
    pass "Manifest declares version 3"
  else
    fail "Manifest version 3 not found"
  fi

  if grep -i 'browser-parrot' "$MANIFEST" >/dev/null 2>&1 || search_any 'browser-parrot' "$ROOT"; then
    pass "browser-parrot identity appears in manifest or repository"
  else
    fail "browser-parrot identity not found"
  fi

  if grep -E '"default_popup"' "$MANIFEST" >/dev/null 2>&1; then
    pass "Manifest defines popup wiring"
  else
    fail "Popup wiring not found in manifest"
  fi

  if grep -E '"service_worker"' "$MANIFEST" >/dev/null 2>&1; then
    pass "Manifest defines a background service worker"
  else
    fail "Background service worker not found in manifest"
  fi

  if grep -E '"devtools_page"' "$MANIFEST" >/dev/null 2>&1; then
    pass "Manifest defines a devtools page"
  else
    fail "Devtools page not found in manifest"
  fi

  if grep -E '"content_scripts"' "$MANIFEST" >/dev/null 2>&1 || search_any '(chrome\.scripting|browser\.scripting)' "$ROOT"; then
    pass "Content script registration or injection logic found"
  else
    fail "Content script registration or injection logic not found"
  fi
fi

# 2. Popup controls
if search_any '(default_popup|popup)' "$ROOT"; then
  pass "Popup implementation appears to exist"
else
  fail "Popup implementation not found"
fi

for control in start stop export clear; do
  if search_any "(\\b$control\\b|>$control<|\"$control\"|'$control')" "$ROOT"; then
    pass "Popup or related UI references '$control'"
  else
    fail "Could not find '$control' control"
  fi
done

if search_any '(redact|redaction|mask sensitive|sensitive.*toggle|toggle.*sensitive)' "$ROOT"; then
  pass "Redaction controls or toggles are referenced"
else
  fail "Redaction controls or toggles not found"
fi

# 3. Content capture
for evt in focus input change click; do
  if search_any "(addEventListener\\(['\"]$evt['\"]|on$evt\\b|type[\"': ]+$evt\\b)" "$ROOT"; then
    pass "Capture logic references '$evt' events"
  else
    fail "No capture logic found for '$evt' events"
  fi
done

if search_any '(selector|querySelector|cssPath|xpath|getSelector)' "$ROOT"; then
  pass "Selector capture logic found"
else
  fail "Selector capture logic not found"
fi

if search_any '(before.*dom|after.*dom|dom.*before|dom.*after|outerHTML|innerHTML|snapshot)' "$ROOT"; then
  pass "DOM before/after context logic found"
else
  fail "DOM before/after context logic not found"
fi

# 4. URL change capture
if search_any '(pushState|replaceState|popstate|hashchange|tabs\.onUpdated|webNavigation|location\.href)' "$ROOT"; then
  pass "URL change capture logic found"
else
  fail "URL change capture logic not found"
fi

# 5. Background session store and network correlation
if search_any '(session store|sessionStore|recording session|timeline|steps|events)' "$ROOT"; then
  pass "Session store or chronological event log is referenced"
else
  fail "Session store or chronological event log not found"
fi

if search_any '(timestamp|timeStamp|Date\.now|createdAt|chronolog)' "$ROOT"; then
  pass "Chronological ordering fields or logic found"
else
  fail "Chronological ordering logic not found"
fi

if search_any '(correlat|correlation window|windowMs|window_ms|network.*step|step.*network)' "$ROOT"; then
  pass "Network correlation logic found"
else
  fail "Network correlation logic not found"
fi

# 6. Devtools panel
if search_any '(devtools|chrome\.devtools|browser\.devtools)' "$ROOT"; then
  pass "Devtools implementation is referenced"
else
  fail "Devtools implementation not found"
fi

if search_any '(timeline|live timeline|activity stream)' "$ROOT"; then
  pass "Timeline UI or timeline logic is referenced"
else
  fail "Timeline UI or logic not found"
fi

if search_any '(network|webRequest|devtools\.network|requestWillBeSent|responseReceived)' "$ROOT"; then
  pass "Network capture or display logic is referenced"
else
  fail "Network capture or display logic not found"
fi

# 7. Export
if search_any '(JSON\.stringify|application/json|export.*json|download.*json)' "$ROOT"; then
  pass "JSON export logic found"
else
  fail "JSON export logic not found"
fi

if search_any '(\bsteps\b|\bevents\b)' "$ROOT"; then
  pass "Step or event payload structure is referenced"
else
  fail "Step or event payload structure not found"
fi

if search_any '(correlated network|network.*correlat|requests|networkEntries|network_entries)' "$ROOT"; then
  pass "Correlated network export structure is referenced"
else
  fail "Correlated network export structure not found"
fi

# 8. Redaction
if search_any '(password.*redact|redact.*password|type=[\"'\'']password[\"'\'']|field.*password)' "$ROOT"; then
  pass "Password redaction-related logic found"
else
  fail "Password redaction-related logic not found"
fi

if search_any '(token.*redact|redact.*token|authorization|bearer|api[-_ ]?key|secret)' "$ROOT"; then
  pass "Sensitive token redaction-related logic found"
else
  fail "Sensitive token redaction-related logic not found"
fi

if search_any '(header.*redact|redact.*header|authorization|cookie|set-cookie|x-api-key)' "$ROOT"; then
  pass "Sensitive header redaction-related logic found"
else
  fail "Sensitive header redaction-related logic not found"
fi

# Optional export sample validation
EXPORT_SAMPLE="$(find "$ROOT" -type f \( -name '*.json' -o -name '*export*' \) \
  ! -path '*/node_modules/*' ! -path '*/dist/*' ! -path '*/build/*' \
  | grep -E '(export|session|record|trace).*\.json$' | head -n 1 || true)"

if [ -n "$EXPORT_SAMPLE" ]; then
  if have_cmd jq; then
    if jq empty "$EXPORT_SAMPLE" >/dev/null 2>&1; then
      pass "Sample export JSON is valid: $EXPORT_SAMPLE"
    else
      fail "Sample export JSON is invalid: $EXPORT_SAMPLE"
    fi
  elif have_cmd node; then
    if node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));' "$EXPORT_SAMPLE" >/dev/null 2>&1; then
      pass "Sample export JSON is valid: $EXPORT_SAMPLE"
    else
      fail "Sample export JSON is invalid: $EXPORT_SAMPLE"
    fi
  else
    warn "Sample export JSON found but could not validate without jq or node: $EXPORT_SAMPLE"
  fi
else
  warn "No sample export JSON file found; export validity remains a manual check"
fi

printf '\nSummary: %s passed, %s failed, %s warnings\n' "$PASS_COUNT" "$FAIL_COUNT" "$WARN_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

exit 0
