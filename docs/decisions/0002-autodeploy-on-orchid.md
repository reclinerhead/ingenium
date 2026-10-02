# 0002. Autodeploy on orchid

- Status: Accepted
- Date: 2026-10-02
- Supersedes: decision 4 of [0001](0001-stack-and-hosting.md) (manual deploys)

## Context

ADR-0001 deferred automatic deploys "until there is something worth deploying automatically". In practice, every merge needed an SSH session to pull and restart, so orchid fell behind main whenever that step was forgotten. The house has seen this failure before: orchid once sat days behind main because no deploy watcher was installed.

The pieces a watcher needs were already in place:

- CI builds and publishes `ghcr.io/reclinerhead/ingenium-web` on every merge to main, tagged with the commit's short SHA.
- `/api/health` reports the SHA a container was built from.
- orchid already runs a pull-based watcher, `merle-autodeploy`, for project-squirrel.

## Decision

A loop service on orchid, `ingenium-autodeploy`, deploys from main. It runs `deploy/autodeploy.sh` as the checkout owner, not root. Each minute it fetches `origin/main`. When main has moved, it pulls the checkout, waits for CI's image for that exact commit, pins that tag in the checkout's gitignored `.env` (which `compose.yaml` interpolates), and runs `docker compose up -d`. It then requires `/api/health` to report the full SHA and Docker's healthcheck to agree. If they don't, it restores the previous pin.

The design rules, all inherited from the house watcher:

- quiet when idle
- every refusal logged once on entering the state and once on leaving it
- no action on a dirty, diverged, or off-branch checkout
- the script re-execs itself when a pull changes it

## Consequences

- Merging to main is the deploy, a few minutes after CI finishes. A commit that failed CI never reaches orchid, and a commit whose container won't come up healthy is rolled back automatically.
- The pin in `.env` makes the running build explicit. The container, `/api/health`, and git always name the same commit.
- Every merge restarts the container for a few seconds, including docs-only merges.
- orchid gains one systemd unit, installed by hand. The watcher updates its own script but never its unit.
- A hand deploy now means stopping the watcher first, or checking out a branch, which pauses it.

## Alternatives considered

- **Watchtower.** It's the standard tool, but the project was archived in December 2025. It also needs the Docker socket mounted into a container, which is root-equivalent on the box that runs the house DNS and Home Assistant. And it deploys "whatever `latest` is now", not "the commit that just merged".
- **GitHub Actions deploying over SSH.** The runner would have to reach orchid, which means a Tailscale auth key stored in GitHub and tailnet ACL changes for an ephemeral cloud node, all to save a 60-second poll.
- **A self-hosted runner on orchid.** For a public repository, that means running workflow code on the house box. Not acceptable.
- **A webhook receiver.** It would need GitHub to reach orchid: a second public door through Funnel, with its own authentication. A pull needs no inbound path at all.
- **Deploying `:latest` instead of the SHA tag.** Simpler, but the running commit would be implicit, and nothing would tie the deploy to the merge that triggered it.
