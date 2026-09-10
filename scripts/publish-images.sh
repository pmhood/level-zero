#!/usr/bin/env bash
#
# Builds and pushes the three deployable images to GHCR, and optionally rolls
# the cluster onto them.
#
# **This is the release procedure**, not a fallback. GitHub Actions is blocked
# at the account level (see CLAUDE.md), so .github/workflows/publish.yml does
# not run; even once it does, this stays the break-glass path.
#
#   scripts/publish-images.sh                 # build + push all three
#   scripts/publish-images.sh api worker      # only these
#   scripts/publish-images.sh --dry-run       # build locally, push nothing
#   scripts/publish-images.sh --rollout       # push, then release to the cluster
#
# Requires: docker with buildx, and a login that can write GHCR packages —
#   echo "$GITHUB_PAT" | docker login ghcr.io -u pmhood --password-stdin
# with a PAT carrying write:packages. --rollout additionally needs kubectl and,
# when the API is among the images, the argocd CLI.
set -euo pipefail

OWNER="${GHCR_OWNER:-pmhood}"
REGISTRY="ghcr.io/${OWNER}"
NAMESPACE="${LZ_NAMESPACE:-level-zero}"
ARGO_APP="${LZ_ARGO_APP:-level-zero}"

# Baked into the browser bundle at build time, so it is a property of the image
# and not of the Deployment. Override to publish an image for another origin.
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://level-zero.fakerainbow.com}"

# The cluster is x86_64 on both nodes; an arm64 layer would be built and never
# pulled. This also matters on an Apple Silicon laptop, where a native build
# produces an image k3s cannot run — and the symptom is a pod in
# CrashLoopBackOff with `exec format error`, which says nothing about
# architecture.
PLATFORM="${PLATFORM:-linux/amd64}"

cd "$(git rev-parse --show-toplevel)"

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
DRY_RUN=false
ROLLOUT=false
# A plain string rather than an array: `set -u` makes an empty array's expansion
# an error on the bash macOS still ships as /bin/bash, and this list is three
# words long.
SELECTED=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --rollout) ROLLOUT=true ;;
    api | web | worker) SELECTED="${SELECTED} ${arg}" ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed 's/^#\{0,1\} \{0,1\}//;$d'
      exit 0
      ;;
    *)
      echo "usage: $0 [--dry-run] [--rollout] [api] [web] [worker]" >&2
      exit 2
      ;;
  esac
done
if [ -z "${SELECTED// /}" ]; then
  SELECTED="api web worker"
fi
if $DRY_RUN && $ROLLOUT; then
  echo "error: --dry-run pushes nothing, so there is nothing to roll out." >&2
  exit 2
fi

published_component() {
  case " $SELECTED " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------------------
# Preflight — fail here rather than after a five-minute build
# ---------------------------------------------------------------------------
command -v docker >/dev/null || {
  echo "error: docker not found." >&2
  exit 1
}
docker buildx version >/dev/null 2>&1 || {
  echo "error: docker buildx not available; this script cannot cross-build without it." >&2
  exit 1
}
if $ROLLOUT; then
  command -v kubectl >/dev/null || {
    echo "error: --rollout needs kubectl." >&2
    exit 1
  }
  # Only the API image carries migrations, so only it needs an Argo sync.
  if published_component api && ! command -v argocd >/dev/null; then
    echo "error: --rollout of the API needs the argocd CLI to re-run the migration hook." >&2
    echo "       Install it, or sync the app from the Argo CD UI and then rerun with --rollout web worker." >&2
    exit 1
  fi
fi

# Tag by commit as well as :latest so a rollback has something to roll back to,
# and so a digest can be traced to source. -dirty is not a nicety: an image
# built from uncommitted work is not reproducible from git, and the tag should
# say so.
SHA="$(git rev-parse HEAD)"
if ! git diff --quiet HEAD 2>/dev/null; then
  SHA="${SHA}-dirty"
  echo "warning: working tree is dirty; tagging ${SHA}" >&2
fi

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
METADIR="$(mktemp -d)"
trap 'rm -rf "$METADIR"' EXIT

for component in $SELECTED; do
  image="${REGISTRY}/level-zero-${component}"
  echo
  echo "==> ${image}"

  args=(
    buildx build
    --platform "$PLATFORM"
    --file "docker/Dockerfile.${component}"
    --tag "${image}:latest"
    --tag "${image}:${SHA}"
    --metadata-file "${METADIR}/${component}.json"
  )
  if [ "$component" = "web" ]; then
    args+=(--build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}")
  fi

  # buildx keeps a cross-platform build entirely in its cache unless told where
  # to put the result, so --load/--push is what makes the build observable.
  if $DRY_RUN; then
    args+=(--load)
  else
    args+=(--push)
  fi
  args+=(.)

  if ! docker "${args[@]}"; then
    echo >&2
    echo "error: build/push of ${image} failed." >&2
    $DRY_RUN || echo "       If the push was denied, check: docker login ghcr.io -u ${OWNER}" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# What shipped
# ---------------------------------------------------------------------------
echo
if $DRY_RUN; then
  echo "Built locally; nothing pushed."
  exit 0
fi

echo "Pushed :latest and :${SHA}"
for component in $SELECTED; do
  meta="${METADIR}/${component}.json"
  digest=""
  if [ -f "$meta" ]; then
    # Flat JSON, one key — no need to make jq a dependency of a release script.
    digest=$(grep -o '"containerimage.digest":[[:space:]]*"[^"]*"' "$meta" |
      sed 's/.*"\(sha256:[^"]*\)".*/\1/' | head -1)
  fi
  printf '  %-28s %s\n' "level-zero-${component}" "${digest:-(digest unavailable)}"
done

# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------
#
# Two separate things have to happen, and doing only the obvious one is the
# trap that manual publishing sets:
#
#   1. **Migrations.** They run from an Argo *Sync hook*, so they fire on a sync
#      — and a manual publish changes no git, so no sync happens. A plain
#      `rollout restart` therefore starts new code against an old schema.
#      `argocd app sync` re-runs the hook even when nothing has diffed.
#   2. **The image.** Argo sees no manifest change either, so a sync alone
#      leaves the old pods running. The Deployments track :latest with
#      imagePullPolicy: Always, so a restart is what actually pulls.
#
# Hence both, in that order — which is the same order the sync waves impose on
# a normal install.
restart_targets=""
for component in $SELECTED; do
  restart_targets="${restart_targets} deploy/level-zero-${component}"
done

if ! $ROLLOUT; then
  echo
  echo "To release this to the cluster:"
  if published_component api; then
    echo "  argocd app sync ${ARGO_APP}          # re-runs the migration hook"
  fi
  echo "  kubectl rollout restart -n ${NAMESPACE}${restart_targets}"
  echo
  echo "Or rerun with --rollout to do both."
  exit 0
fi

if published_component api; then
  echo
  echo "==> argocd app sync ${ARGO_APP}"
  argocd app sync "$ARGO_APP"
  echo "==> waiting for the migration hook"
  # The hook is recreated per sync, so this waits on the current one. A failure
  # here means new code must NOT be rolled out — it would run against a schema
  # that did not migrate.
  if ! kubectl wait --for=condition=complete --timeout=600s \
    -n "$NAMESPACE" job/level-zero-migrate; then
    echo >&2
    echo "error: the migration job did not complete; not restarting anything." >&2
    echo "       kubectl logs -n ${NAMESPACE} job/level-zero-migrate" >&2
    exit 1
  fi
fi

echo
echo "==> kubectl rollout restart -n ${NAMESPACE}${restart_targets}"
# shellcheck disable=SC2086 # deliberate word splitting: one arg per target
kubectl rollout restart -n "$NAMESPACE" $restart_targets

for component in $SELECTED; do
  kubectl rollout status -n "$NAMESPACE" "deploy/level-zero-${component}" --timeout=300s
done

echo
echo "Released ${SHA}."
