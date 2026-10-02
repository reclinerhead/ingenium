#!/usr/bin/env bash
# =============================================================================
# ingenium -- deploy/autodeploy.sh
#
# Ingenia's deploy watcher on orchid (issue #4): a long-lived loop that makes
# merging to main the deploy. Every INGENIUM_DEPLOY_INTERVAL_S it fetches
# origin/main, and when main has moved past what is running it:
#
#   1. pulls the checkout (--ff-only), so compose.yaml changes arrive too;
#   2. waits for CI to publish that commit's image, tagged with the first 7
#      characters of its SHA (docker/metadata-action's type=sha,format=short);
#   3. pins the tag in the checkout's .env (gitignored; compose interpolates
#      INGENIUM_TAG into the image line) and runs `docker compose up -d`;
#   4. waits for /api/health to report the full SHA and for Docker's own
#      healthcheck to agree -- and if that never happens, restores the
#      previous pin and brings the old image back.
#
# Orchid never builds; the image is CI's. A commit whose Tests check failed
# never gets an image, so it is never deployed.
#
# The house pattern (project-squirrel's Servers/autodeploy.sh, which runs as
# merle-autodeploy), with two differences: this runs as the checkout owner,
# not root -- docker group membership is all it needs -- and it deploys a
# pre-built image instead of building on the box.
#
# A LOOP SERVICE, not a systemd timer, and quiet when idle: it logs only when
# it acts or something changes state, so `journalctl -u ingenium-autodeploy`
# reads as a deploy history. Every refusal is logged once on entering the
# state and once on leaving it, never once per tick:
#   - the checkout is off the deploy branch (someone pinned it on purpose:
#     the sanctioned way to desk-test a branch is to check it out here)
#   - the checkout has tracked changes (untracked and ignored files, .env
#     included, never count)
#   - the pull is not a fast-forward
#
# Deliberately NOT `set -e`: every step checks and logs its own failure, and
# the next tick retries.
#
# Self-update: this script lives in the checkout it pulls, and bash reads a
# script as it runs. Everything is inside functions and `main` is called on
# the last line, so the whole file is parsed before anything runs; when a
# pull changes this file, the loop exec's the new copy before sleeping.
#
# Settings (environment; all optional):
#   INGENIUM_REPO                  checkout path, default /home/todd/ingenium
#   INGENIUM_DEPLOY_BRANCH         branch to deploy, default main
#   INGENIUM_DEPLOY_INTERVAL_S     poll cadence in seconds, default 60
#   INGENIUM_DEPLOY_IMAGE_WAIT_S   how long to wait for CI's image, default 900
#   INGENIUM_DEPLOY_HEALTH_WAIT_S  how long a new container gets to prove
#                                  itself, default 90
#   INGENIUM_HEALTH_URL            default http://127.0.0.1:3100/api/health
#                                  (must match compose.yaml's published port)
#
# Escape hatches: `sudo systemctl stop ingenium-autodeploy` pauses it, and a
# hand deploy is then `docker compose up -d` with whatever tag .env pins.
# `autodeploy.sh --once` runs a single tick by hand.
# =============================================================================

set -uo pipefail

REPO="${INGENIUM_REPO:-/home/todd/ingenium}"
BRANCH="${INGENIUM_DEPLOY_BRANCH:-main}"
INTERVAL="${INGENIUM_DEPLOY_INTERVAL_S:-60}"
IMAGE_WAIT="${INGENIUM_DEPLOY_IMAGE_WAIT_S:-900}"
HEALTH_WAIT="${INGENIUM_DEPLOY_HEALTH_WAIT_S:-90}"
HEALTH_URL="${INGENIUM_HEALTH_URL:-http://127.0.0.1:3100/api/health}"

# Fixed by compose.yaml and ci.yml; change them there, and here to match.
IMAGE="ghcr.io/reclinerhead/ingenium-web"
CONTAINER="ingenium-web"

SELF="$REPO/deploy/autodeploy.sh"
COMPOSE_FILE="$REPO/compose.yaml"
ENV_FILE="$REPO/.env"

# Transition state: each flag logs one line entering a state, one leaving it.
fetch_down=0
off_branch=0
dirty=0
pull_refused=""   # the origin SHA a non-fast-forward pull was refused at
# A SHA that got no image or failed its health check: not retried until main
# moves. Carried across the self-update exec so a handover doesn't retry it.
given_up="${INGENIUM_GIVEN_UP:-}"
self_changed=0

log() { echo "[autodeploy] $*"; }

repo_git() { git -C "$REPO" "$@"; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# .env is data, never sourced: read the last KEY=value line for a key.
pinned() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -n 1; }

# pin <short> <full> writes the pin; pin "" "" removes it, and compose falls
# back to :latest.
pin() {
    {
        echo "# Written by deploy/autodeploy.sh: the image orchid runs. Pin by hand"
        echo "# only with ingenium-autodeploy stopped (Technical Guide § 6)."
        if [ -n "$1" ]; then
            echo "INGENIUM_TAG=$1"
            echo "INGENIUM_SHA=$2"
        fi
    } > "$ENV_FILE"
}

image_exists() { docker manifest inspect "$IMAGE:$1" >/dev/null 2>&1; }

# wait_for_image <short> <target>: 0 when CI's image is published, 1 when
# IMAGE_WAIT runs out, 2 when origin moved past <target> in the meantime (the
# usual fix-forward after a failed CI run; the next tick takes the new head).
wait_for_image() {
    local short="$1" target="$2" waited=0 since_fetch=0
    until image_exists "$short"; do
        [ "$waited" -ge "$IMAGE_WAIT" ] && return 1
        sleep 15
        waited=$((waited + 15))
        since_fetch=$((since_fetch + 15))
        if [ "$since_fetch" -ge 60 ]; then
            since_fetch=0
            if repo_git fetch --quiet origin "$BRANCH" \
                && [ "$(repo_git rev-parse "origin/$BRANCH")" != "$target" ]; then
                return 2
            fi
        fi
    done
    return 0
}

# Healthy means /api/health names the full SHA AND Docker's healthcheck says
# healthy -- the first proves which build answered, the second that it stays up.
wait_for_health() {
    local sha="$1" waited=0 status
    while [ "$waited" -lt "$HEALTH_WAIT" ]; do
        status=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)
        if [ "$status" = "healthy" ] \
            && curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q "\"version\":\"$sha\""; then
            return 0
        fi
        sleep 5
        waited=$((waited + 5))
    done
    return 1
}

# deploy <full sha>: pin, recreate, verify; restore the previous pin if the
# new container never proves itself. Never leaves the box serving nothing
# while a previous image exists: with no previous pin, the fallback is
# :latest, the image hand deploys ran.
deploy() {
    local sha="$1" short="${1:0:7}" prev_tag prev_sha out
    prev_tag=$(pinned INGENIUM_TAG)
    prev_sha=$(pinned INGENIUM_SHA)

    log "deploying $short (was ${prev_tag:-latest})"
    pin "$short" "$sha"
    if ! out=$(compose up -d 2>&1); then
        log "compose up failed for $short:"
        printf '%s\n' "$out" | tail -n 20
    elif wait_for_health "$sha"; then
        log "deployed $short (healthy)"
        return 0
    fi

    given_up="$sha"
    pin "$prev_tag" "$prev_sha"
    if out=$(compose up -d 2>&1); then
        log "rollback: $short unhealthy; back on ${prev_tag:-latest}"
    else
        log "rollback: $short unhealthy, and bringing ${prev_tag:-latest} back FAILED -- needs a human"
        printf '%s\n' "$out" | tail -n 20
    fi
}

tick() {
    self_changed=0

    # The branch guard (project-squirrel #392): a checkout off the deploy
    # branch is a box someone pinned on purpose. Before the fetch, so a
    # pinned box makes no deploy traffic at all; checking the branch back
    # out resumes deploys by itself.
    local branch
    branch=$(repo_git rev-parse --abbrev-ref HEAD) || return 0
    if [ "$branch" != "$BRANCH" ]; then
        if [ "$off_branch" -eq 0 ]; then
            off_branch=1
            log "checkout is on '$branch', not $BRANCH -- deploys paused until it returns"
        fi
        return 0
    fi
    if [ "$off_branch" -eq 1 ]; then
        off_branch=0
        log "back on $BRANCH -- deploys resume"
    fi

    if ! repo_git fetch --quiet origin "$BRANCH"; then
        if [ "$fetch_down" -eq 0 ]; then
            fetch_down=1
            log "can't fetch origin (network or GitHub down?) -- retrying quietly"
        fi
        return 0
    fi
    if [ "$fetch_down" -eq 1 ]; then
        fetch_down=0
        log "fetch recovered"
    fi

    local target
    target=$(repo_git rev-parse "origin/$BRANCH") || return 0
    [ "$target" = "$(pinned INGENIUM_SHA)" ] && return 0   # the quiet path
    [ "$target" = "$given_up" ] && return 0                 # failed once; wait for main to move

    # Tracked changes only: someone is mid-edit (compose.yaml, say), and
    # neither a pull nor an `up -d` should act on that.
    if [ -n "$(repo_git status --porcelain --untracked-files=no)" ]; then
        if [ "$dirty" -eq 0 ]; then
            dirty=1
            log "checkout is dirty -- origin/$BRANCH is at ${target:0:7}, nothing deploys until it's clean"
        fi
        return 0
    fi
    if [ "$dirty" -eq 1 ]; then
        dirty=0
        log "checkout is clean again"
    fi

    local head changed
    head=$(repo_git rev-parse HEAD) || return 0
    if [ "$head" != "$target" ]; then
        if ! repo_git pull --ff-only --quiet origin "$BRANCH"; then
            if [ "$pull_refused" != "$target" ]; then
                pull_refused="$target"
                log "pull --ff-only refused at ${target:0:7} (diverged history?) -- needs a human"
            fi
            return 0
        fi
        pull_refused=""
        changed=$(repo_git diff --name-only "$head" "$target")
        if grep -qx "deploy/autodeploy.sh" <<<"$changed"; then
            self_changed=1
        fi
        if grep -qx "deploy/ingenium-autodeploy.service" <<<"$changed"; then
            log "deploy/ingenium-autodeploy.service changed -- reinstall the unit by hand (Technical Guide § 6)"
        fi
    fi

    local short="${target:0:7}" result
    wait_for_image "$short" "$target"
    result=$?
    if [ "$result" -eq 1 ]; then
        local waited_for="$((IMAGE_WAIT / 60))m"
        [ "$IMAGE_WAIT" -lt 60 ] && waited_for="${IMAGE_WAIT}s"
        given_up="$target"
        log "no image for $short after $waited_for; staying on $(pinned INGENIUM_TAG | grep . || echo latest)"
        return 0
    fi
    if [ "$result" -eq 2 ]; then
        log "superseded: origin/$BRANCH moved past $short before its image appeared"
        return 0
    fi

    deploy "$target"
}

preflight() {
    local tool
    for tool in git docker curl; do
        if ! command -v "$tool" >/dev/null; then
            log "missing $tool -- can't run"
            return 1
        fi
    done
    if ! docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
        log "can't reach the Docker daemon as $(id -un) -- is it in the docker group?"
        return 1
    fi
    if ! repo_git rev-parse --git-dir >/dev/null 2>&1; then
        log "no git checkout at $REPO"
        return 1
    fi
}

main() {
    preflight || exit 1
    if [ "${1:-}" = "--once" ]; then
        tick   # one hand-run tick: desk testing, no loop, no self-exec
        return
    fi
    log "watching origin/$BRANCH every ${INTERVAL}s -- running $(pinned INGENIUM_TAG | grep . || echo latest)," \
        "checkout $REPO on $(repo_git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
    while true; do
        tick
        if [ "$self_changed" -eq 1 ]; then
            log "autodeploy.sh itself changed -- handing over to the new copy"
            INGENIUM_GIVEN_UP="$given_up" exec bash "$SELF"
        fi
        sleep "$INTERVAL"
    done
}

main "$@"
