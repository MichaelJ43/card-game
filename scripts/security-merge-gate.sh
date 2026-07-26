#!/usr/bin/env bash
# Auto-merge Dependabot PRs when semver bump is patch or minor and checks are green.
# Agent-opened security-fix PRs are never auto-merged here.
set -euo pipefail

PR_NUMBER="${1:?PR number required}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"

pr_json="$(gh pr view "$PR_NUMBER" --repo "$REPO" --json author,isDraft,reviewDecision,labels,title)"
author="$(echo "$pr_json" | jq -r '.author.login')"
is_draft="$(echo "$pr_json" | jq -r '.isDraft')"
review_decision="$(echo "$pr_json" | jq -r '.reviewDecision // empty')"
title="$(echo "$pr_json" | jq -r '.title')"
has_security_fix="$(echo "$pr_json" | jq -r '[.labels[].name] | index("security-fix") != null')"

if [ "$is_draft" = "true" ]; then
  echo "PR is draft; skip merge."
  exit 0
fi

if [ "$review_decision" = "CHANGES_REQUESTED" ]; then
  echo "PR has changes requested; skip merge."
  exit 0
fi

# gh GraphQL reports app/dependabot; REST / event payloads use dependabot[bot].
if [[ "$author" != "dependabot[bot]" && "$author" != "app/dependabot" ]]; then
  echo "Author is not Dependabot ($author); skip auto-merge (human review for security-fix PRs)."
  exit 0
fi

if [ "$has_security_fix" = "true" ]; then
  echo "security-fix label present; skip auto-merge."
  exit 0
fi

if [[ ! "$title" =~ from\ ([0-9]+)\.([0-9]+)\.([0-9]+)\ to\ ([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
  echo "Could not parse semver range from PR title; skip auto-merge."
  exit 0
fi

old_major="${BASH_REMATCH[1]}"
new_major="${BASH_REMATCH[4]}"

if [ "$new_major" -gt "$old_major" ]; then
  echo "Major version bump detected ($old_major -> $new_major); requires human approval."
  exit 0
fi

echo "Patch/minor Dependabot bump; waiting for checks..."
gh pr checks "$PR_NUMBER" --repo "$REPO" --watch --fail-fast --interval 30

echo "Merging PR #$PR_NUMBER (squash)..."
gh pr merge "$PR_NUMBER" --repo "$REPO" --squash --delete-branch
