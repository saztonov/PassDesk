#!/usr/bin/env bash
# PassDesk single-command deploy script.
# Запускать на VPS из корня репозитория: ./scripts/deploy.sh
set -euo pipefail
umask 022

# --- Параметры (overridable через env) ---------------------------------------
: "${DEPLOY_COMPOSE_PROJECT:=passdesk}"
: "${DEPLOY_COMPOSE_FILE:=docker-compose.server.yml}"
: "${DEPLOY_BRANCH:=main}"
: "${DEPLOY_SERVER_TIMEOUT:=180}"
: "${DEPLOY_CLIENT_TIMEOUT:=90}"
: "${DEPLOY_BACKUP_KEEP:=2}"
: "${DEPLOY_COLOR:=auto}"
: "${DEPLOY_SERVER_CONTAINER:=passdesk_server}"
: "${DEPLOY_CLIENT_CONTAINER:=passdesk_client}"
: "${DEPLOY_DB_CONTAINER:=passdesk_postgres}"

# --- Парсинг CLI -------------------------------------------------------------
DO_PULL=1
DO_BUILD=1
DO_BACKUP=1
print_usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [options]

Options:
  --no-pull       Пропустить git fetch + reset --hard (статус SKIPPED).
  --skip-build    Пропустить docker compose build (быстрый recreate).
  --no-backup     Пропустить pg_dump перед миграциями.
  -h, --help      Показать эту справку и выйти.

Env overrides:
  DEPLOY_BRANCH (default main)
  DEPLOY_SERVER_TIMEOUT (default 180s) — ожидание server healthcheck
  DEPLOY_CLIENT_TIMEOUT (default 90s)
  DEPLOY_BACKUP_KEEP (default 2) — сколько последних бэкапов хранить
  DEPLOY_COLOR (auto|always|never)
EOF
}
while (($#)); do
  case "$1" in
    --no-pull)    DO_PULL=0 ;;
    --skip-build) DO_BUILD=0 ;;
    --no-backup)  DO_BACKUP=0 ;;
    -h|--help)    print_usage; exit 0 ;;
    *)            echo "Unknown option: $1" >&2; print_usage >&2; exit 2 ;;
  esac
  shift
done

# --- Переход в корень репо ---------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERROR: not inside a git repository" >&2
  exit 2
fi
cd "$REPO_ROOT"

# --- Логи и каталоги ---------------------------------------------------------
mkdir -p logs backups
TS="$(date +%Y%m%d-%H%M%S)"
LOGFILE="logs/deploy-${TS}.log"
LOCKFILE="logs/.deploy.lock"
: > "$LOGFILE"

# --- Цвета (только если stdout — tty и не отключено) -------------------------
use_color() {
  case "$DEPLOY_COLOR" in
    never)  return 1 ;;
    always) return 0 ;;
    *)      [[ -t 1 ]] ;;
  esac
}
if use_color; then
  C_OK=$'\033[32m'; C_FAIL=$'\033[31m'; C_WARN=$'\033[33m'
  C_DIM=$'\033[2m';  C_RST=$'\033[0m';   C_BOLD=$'\033[1m'
else
  C_OK=""; C_FAIL=""; C_WARN=""; C_DIM=""; C_RST=""; C_BOLD=""
fi

# Strip ANSI для файла логов
strip_ansi() { sed -E 's/\x1B\[[0-9;]*[mK]//g'; }
log()        { printf '%s\n' "$*" | tee >(strip_ansi >> "$LOGFILE"); }
log_dim()    { log "${C_DIM}$*${C_RST}"; }
log_step()   { log "${C_BOLD}▶ $*${C_RST}"; }

die() {
  LAST_ERR="$*"
  log "${C_FAIL}✗ $*${C_RST}"
  exit 1
}

human_dur() {
  local s=$1
  if (( s < 60 )); then printf '%ds' "$s"
  elif (( s < 3600 )); then printf '%dm%02ds' $((s/60)) $((s%60))
  else printf '%dh%02dm' $((s/3600)) $(((s%3600)/60))
  fi
}

# --- Аккумуляторы отчёта -----------------------------------------------------
STEP_NAMES=()
STEP_STATUS=()      # OK | FAIL | SKIPPED
STEP_DURATION=()    # секунды
STEP_INFO=()        # детали
STEP_T0=0
LAST_ERR=""

# Установить info для текущего (последнего стартанувшего) шага
set_step_info() {
  local idx=$(( ${#STEP_NAMES[@]} - 1 ))
  (( idx < 0 )) && return 0
  # дополнить STEP_INFO до длины STEP_NAMES
  while (( ${#STEP_INFO[@]} <= idx )); do STEP_INFO+=(""); done
  STEP_INFO[$idx]="$1"
}

# Запустить шаг как функцию. $1=имя, $2=имя функции
run_step() {
  local name="$1" fn="$2"
  STEP_NAMES+=("$name")
  STEP_T0=$SECONDS
  LAST_ERR=""
  log_step "${name}…"
  if "$fn"; then
    STEP_STATUS+=("OK")
    STEP_DURATION+=("$((SECONDS - STEP_T0))")
    while (( ${#STEP_INFO[@]} < ${#STEP_NAMES[@]} )); do STEP_INFO+=(""); done
  else
    local rc=$?
    STEP_STATUS+=("FAIL")
    STEP_DURATION+=("$((SECONDS - STEP_T0))")
    while (( ${#STEP_INFO[@]} < ${#STEP_NAMES[@]} )); do STEP_INFO+=("${LAST_ERR:-rc=$rc}"); done
    exit "$rc"
  fi
}

# Пометить шаг как SKIPPED (вне run_step)
skip_step() {
  local name="$1" info="${2:-skipped}"
  STEP_NAMES+=("$name")
  STEP_STATUS+=("SKIPPED")
  STEP_DURATION+=(0)
  STEP_INFO+=("$info")
  log_dim "↷ ${name} — ${info}"
}

# --- Хелпер ожидания healthcheck --------------------------------------------
wait_health() {
  local c="$1" tmo="${2:-180}" t0=$SECONDS st running
  while :; do
    if ! docker inspect "$c" >/dev/null 2>&1; then
      die "container $c not found"
    fi
    st="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null || echo unknown)"
    running="$(docker inspect --format='{{.State.Running}}' "$c" 2>/dev/null || echo false)"

    if [[ "$st" == "healthy" ]]; then return 0; fi
    if [[ "$st" == "none" ]]; then die "no healthcheck configured on $c"; fi

    if [[ "$running" != "true" ]]; then
      docker logs --tail 80 "$c" 2>&1 | strip_ansi >> "$LOGFILE" || true
      die "$c is not running while waiting (status=$st) — см. $LOGFILE"
    fi

    if (( SECONDS - t0 > tmo )); then
      docker logs --tail 80 "$c" 2>&1 | strip_ansi >> "$LOGFILE" || true
      die "timeout ${tmo}s waiting for $c (last status=$st) — см. $LOGFILE"
    fi
    sleep 2
  done
}

# --- Шаги --------------------------------------------------------------------
preflight() {
  local info_parts=()

  if ! command -v docker >/dev/null 2>&1; then
    LAST_ERR="docker not found in PATH"; return 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    LAST_ERR="docker compose v2 not available"; return 1
  fi
  if [[ ! -f "$DEPLOY_COMPOSE_FILE" ]]; then
    LAST_ERR="$DEPLOY_COMPOSE_FILE missing"; return 1
  fi
  if [[ ! -f .env ]]; then
    LAST_ERR=".env missing in repo root"; return 1
  fi

  local docker_ver compose_ver
  docker_ver="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"
  compose_ver="$(docker compose version --short 2>/dev/null || echo unknown)"
  info_parts+=("user=$(id -un)")
  info_parts+=("docker=${docker_ver}")
  info_parts+=("compose=${compose_ver}")

  if [[ "$(id -u)" == "0" ]]; then
    log "${C_WARN}⚠ running as root (предпочтительнее запускать под passdesk)${C_RST}"
  fi

  set_step_info "$(IFS=' · '; echo "${info_parts[*]}")"
}

git_step() {
  if (( ! DO_PULL )); then
    return 0
  fi
  local before after n
  before="$(git rev-parse HEAD)"
  log_dim "  git fetch origin ${DEPLOY_BRANCH}…"
  git fetch --quiet origin "$DEPLOY_BRANCH" 2>&1 | strip_ansi >> "$LOGFILE" || true
  log_dim "  git reset --hard origin/${DEPLOY_BRANCH}…"
  git reset --hard "origin/${DEPLOY_BRANCH}" >>"$LOGFILE" 2>&1
  log_dim "  git clean -fd…"
  git clean -fd >>"$LOGFILE" 2>&1
  after="$(git rev-parse HEAD)"
  if [[ "$before" == "$after" ]]; then
    n=0
  else
    n="$(git rev-list --count "${before}..${after}")"
  fi
  set_step_info "${n} commits (${before:0:7}→${after:0:7})"
}

# DB credentials из .env (только эти переменные нужны)
load_db_env() {
  # shellcheck disable=SC1091
  set -a; source ./.env; set +a
  : "${DB_USER:?DB_USER missing in .env}"
  : "${DB_NAME:?DB_NAME missing in .env}"
  : "${DB_PASSWORD:?DB_PASSWORD missing in .env}"
}

backup_step() {
  if (( ! DO_BACKUP )); then
    return 0
  fi
  load_db_env

  if ! docker inspect "$DEPLOY_DB_CONTAINER" >/dev/null 2>&1; then
    LAST_ERR="container $DEPLOY_DB_CONTAINER not running — нечем делать pg_dump"
    return 1
  fi
  if [[ "$(docker inspect --format='{{.State.Running}}' "$DEPLOY_DB_CONTAINER" 2>/dev/null)" != "true" ]]; then
    LAST_ERR="$DEPLOY_DB_CONTAINER is not running"
    return 1
  fi

  local f="backups/predeploy-${TS}.sql.gz"
  log_dim "  pg_dump → ${f}"
  if ! docker exec -e PGPASSWORD="$DB_PASSWORD" "$DEPLOY_DB_CONTAINER" \
      pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
    | gzip -9 > "$f"; then
    LAST_ERR="pg_dump failed"
    rm -f "$f"
    return 1
  fi

  local size
  size="$(du -h "$f" | awk '{print $1}')"
  set_step_info "${f##*/} (${size}); keep=${DEPLOY_BACKUP_KEEP}"

  # Ротация — оставить последние N
  local victims
  victims="$(ls -1t backups/predeploy-*.sql.gz 2>/dev/null | tail -n +"$((DEPLOY_BACKUP_KEEP + 1))" || true)"
  if [[ -n "$victims" ]]; then
    while IFS= read -r v; do
      [[ -n "$v" ]] && rm -f "$v" && log_dim "  removed old backup: ${v##*/}"
    done <<< "$victims"
  fi
}

build_step() {
  if (( ! DO_BUILD )); then
    return 0
  fi
  log_dim "  docker compose build --pull server client"
  if ! docker compose -p "$DEPLOY_COMPOSE_PROJECT" -f "$DEPLOY_COMPOSE_FILE" \
       build --pull server client 2>&1 | strip_ansi | tee -a "$LOGFILE" >/dev/null; then
    LAST_ERR="docker compose build failed — см. $LOGFILE"
    return 1
  fi
  set_step_info "server, client (--pull)"
}

up_step() {
  log_dim "  docker compose up -d --force-recreate --remove-orphans"
  if ! docker compose -p "$DEPLOY_COMPOSE_PROJECT" -f "$DEPLOY_COMPOSE_FILE" \
       up -d --force-recreate --remove-orphans 2>&1 \
       | strip_ansi | tee -a "$LOGFILE" >/dev/null; then
    LAST_ERR="docker compose up failed — см. $LOGFILE"
    return 1
  fi
  # Подсчёт «recreated N/M» — постфактум по ps
  local total
  total="$(docker compose -p "$DEPLOY_COMPOSE_PROJECT" -f "$DEPLOY_COMPOSE_FILE" ps --services 2>/dev/null | wc -l | tr -d ' ')"
  set_step_info "recreated up to ${total} services"
}

# Подсчёт и сверка миграций — заполняет глобальные MIG_*
MIG_NEW=0; MIG_FAILED=0; MIG_DB=0; MIG_TOTAL=0
verify_migrations() {
  local started_raw started
  started_raw="$(docker inspect --format='{{.State.StartedAt}}' "$DEPLOY_SERVER_CONTAINER" 2>/dev/null || true)"
  if [[ -n "$started_raw" ]]; then
    started="$(date -u -d "$started_raw -1 seconds" +%Y-%m-%dT%H:%M:%S 2>/dev/null || echo "")"
  else
    started=""
  fi

  if [[ -n "$started" ]]; then
    MIG_NEW=$(docker logs --since "$started" "$DEPLOY_SERVER_CONTAINER" 2>&1 \
              | grep -c '✅ Applied migration:' || true)
    MIG_FAILED=$(docker logs --since "$started" "$DEPLOY_SERVER_CONTAINER" 2>&1 \
                 | grep -c '❌ Migration failed:' || true)
  else
    MIG_NEW=0
    MIG_FAILED=0
  fi

  load_db_env
  MIG_DB=$(docker exec -e PGPASSWORD="$DB_PASSWORD" "$DEPLOY_DB_CONTAINER" \
           psql -U "$DB_USER" -d "$DB_NAME" -tA \
           -c "SELECT COUNT(*) FROM schema_migrations" 2>/dev/null \
           | tr -d '[:space:]' || echo 0)
  [[ -z "$MIG_DB" ]] && MIG_DB=0

  MIG_TOTAL=$(find server/migrations -maxdepth 1 -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')

  if (( MIG_FAILED > 0 )); then return 1; fi
  if (( MIG_DB != MIG_TOTAL )); then return 2; fi
  return 0
}

wait_server_step() {
  if ! wait_health "$DEPLOY_SERVER_CONTAINER" "$DEPLOY_SERVER_TIMEOUT"; then
    return 1   # die() уже вышел через trap, сюда не дойдём
  fi
  if verify_migrations; then
    set_step_info "${MIG_NEW} new · ${MIG_DB}/${MIG_TOTAL} total · all OK"
  else
    local rc=$?
    set_step_info "${MIG_NEW} new · ${MIG_FAILED} failed · ${MIG_DB}/${MIG_TOTAL} in DB"
    {
      echo "--- migrations log tail ---"
      docker logs --tail 200 "$DEPLOY_SERVER_CONTAINER" 2>&1 \
        | grep -E '(✅ Applied|❌ Migration|Migration runner)' || true
    } | strip_ansi | tee -a "$LOGFILE" >&2
    LAST_ERR="migration verification failed (rc=$rc)"
    return "$rc"
  fi
}

wait_client_step() {
  if ! wait_health "$DEPLOY_CLIENT_CONTAINER" "$DEPLOY_CLIENT_TIMEOUT"; then
    return 1
  fi
  set_step_info "—"
}

# --- Отчёт -------------------------------------------------------------------
# Ширины колонок (фиксированные)
W_NAME=24
W_STAT=8
W_DUR=10
W_INFO=36
hr() {
  local left="$1" mid="$2" right="$3" fill="$4"
  local s=""
  s+="$left"
  s+="$(printf "%*s" "$W_NAME" "" | tr ' ' "$fill")"
  s+="$mid"
  s+="$(printf "%*s" "$W_STAT" "" | tr ' ' "$fill")"
  s+="$mid"
  s+="$(printf "%*s" "$W_DUR" "" | tr ' ' "$fill")"
  s+="$mid"
  s+="$(printf "%*s" "$W_INFO" "" | tr ' ' "$fill")"
  s+="$right"
  printf '%s\n' "$s"
}

# Обрезает строку до N "видимых" символов (UTF-8 aware через wc -m)
trunc() {
  local s="$1" n="$2"
  local len
  len=$(printf '%s' "$s" | wc -m | tr -d ' ')
  if (( len <= n )); then
    printf '%s' "$s"
  else
    # cut по символам, оставить место под …
    printf '%s…' "$(printf '%s' "$s" | cut -c1-$((n-1)))"
  fi
}

# Выводит ячейку с паддингом до ширины, учитывая UTF-8
pad_cell() {
  local s="$1" w="$2"
  local len
  s="$(trunc "$s" "$w")"
  len=$(printf '%s' "$s" | wc -m | tr -d ' ')
  printf '%s%*s' "$s" $((w - len)) ""
}

status_cell() {
  local st="$1"
  case "$st" in
    OK)      printf '%s' "${C_OK}  ✓ OK ${C_RST}" ;;
    FAIL)    printf '%s' "${C_FAIL}✗ FAIL${C_RST}" ;;
    SKIPPED) printf '%s' "${C_DIM} SKIP ${C_RST}" ;;
    *)       printf '%s' "  ?   " ;;
  esac
}

report() {
  local rc="${1:-0}"
  local total_dur=0
  local i

  echo ""
  hr "╔" "╤" "╗" "═" | tee -a >(strip_ansi >> "$LOGFILE")
  printf "║ %s│ %s │ %s │ %s ║\n" \
    "$(pad_cell "Step" $((W_NAME-1)))" \
    "$(pad_cell "Status" $((W_STAT-2)))" \
    "$(pad_cell "Duration" $((W_DUR-2)))" \
    "$(pad_cell "Details" $((W_INFO-1)))" \
    | tee -a >(strip_ansi >> "$LOGFILE")
  hr "╠" "╪" "╣" "═" | tee -a >(strip_ansi >> "$LOGFILE")

  for i in "${!STEP_NAMES[@]}"; do
    local name="${STEP_NAMES[$i]}"
    local st="${STEP_STATUS[$i]:-?}"
    local dur="${STEP_DURATION[$i]:-0}"
    local info="${STEP_INFO[$i]:-}"
    total_dur=$((total_dur + dur))
    printf "║ %s│ %s │ %s │ %s ║\n" \
      "$(pad_cell "$name" $((W_NAME-1)))" \
      "$(status_cell "$st")" \
      "$(pad_cell "$(human_dur "$dur")" $((W_DUR-2)))" \
      "$(pad_cell "$info" $((W_INFO-1)))" \
      | tee -a >(strip_ansi >> "$LOGFILE")
  done

  hr "╠" "╧" "╣" "═" | tee -a >(strip_ansi >> "$LOGFILE")
  local total_w=$((W_NAME + W_STAT + W_DUR + W_INFO + 7))
  local foot_color foot_label
  if (( rc == 0 )); then
    foot_color="$C_OK"; foot_label="SUCCESS"
  else
    foot_color="$C_FAIL"; foot_label="FAILED"
  fi
  local foot1="Total: $(human_dur "$total_dur") · log: ${LOGFILE} · exit ${rc} · ${foot_label}"
  printf "║ %s%s ║\n" "${foot_color}" "$(pad_cell "$foot1" $((total_w - 2)))${C_RST}" \
    | tee -a >(strip_ansi >> "$LOGFILE")

  # Если падение на миграциях — показать команду восстановления
  if (( rc != 0 )) && [[ -n "$LAST_ERR" ]]; then
    local err_line="Last error: $(trunc "$LAST_ERR" $((total_w - 14)))"
    printf "║ %s ║\n" "$(pad_cell "$err_line" $((total_w - 2)))" \
      | tee -a >(strip_ansi >> "$LOGFILE")
    local latest_backup
    latest_backup="$(ls -1t backups/predeploy-*.sql.gz 2>/dev/null | head -1 || true)"
    if [[ -n "$latest_backup" ]]; then
      local r1="Restore: gunzip -c ${latest_backup} \\"
      local r2="         | docker exec -i ${DEPLOY_DB_CONTAINER} psql -U \$DB_USER -d \$DB_NAME"
      printf "║ %s ║\n" "$(pad_cell "$r1" $((total_w - 2)))" \
        | tee -a >(strip_ansi >> "$LOGFILE")
      printf "║ %s ║\n" "$(pad_cell "$r2" $((total_w - 2)))" \
        | tee -a >(strip_ansi >> "$LOGFILE")
    fi
  fi

  hr "╚" "═" "╝" "═" | tee -a >(strip_ansi >> "$LOGFILE")
}

# --- EXIT trap → таблица выводится ВСЕГДА ------------------------------------
on_exit() {
  local rc="${1:-0}"
  # Если последний шаг был запущен, но не закрыт — пометить FAIL
  if (( ${#STEP_NAMES[@]} > ${#STEP_STATUS[@]} )); then
    STEP_STATUS+=("FAIL")
    STEP_DURATION+=("$((SECONDS - STEP_T0))")
    STEP_INFO+=("${LAST_ERR:-aborted}")
  fi
  report "$rc"
}
trap 'rc=$?; on_exit "$rc"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# --- Lock на параллельные запуски --------------------------------------------
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "ERROR: another deploy is already running (lock: $LOCKFILE)" >&2
  exit 2
fi

# --- main --------------------------------------------------------------------
log_dim "PassDesk deploy started at $(date -Iseconds) — log: $LOGFILE"

run_step "Preflight checks" preflight

if (( DO_PULL )); then
  run_step "Git update" git_step
else
  skip_step "Git update" "--no-pull"
fi

if (( DO_BACKUP )); then
  run_step "DB backup" backup_step
else
  skip_step "DB backup" "--no-backup"
fi

if (( DO_BUILD )); then
  run_step "Build images" build_step
else
  skip_step "Build images" "--skip-build"
fi

run_step "Compose up" up_step
run_step "Server healthy" wait_server_step
run_step "Client healthy" wait_client_step

# Успех — EXIT trap всё равно нарисует таблицу.
exit 0
