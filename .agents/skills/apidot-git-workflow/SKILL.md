---
name: apidot-git-workflow
description: Use when starting, developing, committing, integrating, or releasing changes in the ApiDot repository. Enforces isolated git worktrees from dev, mandatory user Pull Request review before merging to remote, and tag-driven releases from main.
---

# ApiDot Git & Release Workflow

## Overview

This guide establishes the canonical code governance, branching, worktree isolation, and release automation standards for the **ApiDot** project.

**Core Principles:**
- **Zero direct commits or autonomous merges into protected branches (`main` and `dev`).**
- **All development occurs in an isolated git worktree and feature branch branched from `dev`.**
- **Every remote integration requires opening a Pull Request for explicit manual review and approval by Hudson Medeiros on GitHub.**

---

## 1. Branch Architecture

```text
[feat/* or fix/*]  (Isolated worktree)
        │
        ▼ (Push + Open PR)
      PR #X ──────► [Manual Review & Approval by Hudson on GitHub]
        │
        ▼ (Merge on GitHub)
     [ dev ]       ◄── Integration and continuous development centralizer
        │
        ▼ (Release PR: dev -> main)
      PR #Y ──────► [Manual Review & Approval by Hudson on GitHub]
        │
        ▼ (Merge on GitHub)
    [ main ]       ◄── Strict production base (stable releases only)
        │
        ▼
   Tag vX.Y.Z      ──► Automated GitHub Actions workflow (GHCR Containers + Desktop Binaries)
```

| Branch | Role | Strict Rules |
|---|---|---|
| **`main`** | Production | Never commit directly. Receives code exclusively via PR from `dev`. Base from which annotated release tags (`v*`) are created. |
| **`dev`** | Integration | Continuous integration centralizer. Never commit features/fixes directly. Receives code exclusively via approved PRs from feature/fix branches. |
| **`feat/*` or `fix/*`** | Ephemeral Work | Created strictly from `origin/dev` inside an **isolated git worktree**. Short-lived: deleted after PR merge. |

---

## 2. Development Workflow (Features & Fixes)

### Step 1: Update Base & Create Isolated Worktree
Before writing any code, synchronize `dev` and create the isolated worktree:

```bash
git fetch origin dev
git worktree add .worktrees/<task-name> -b feat/<task-name> origin/dev
```

*Note:* Ensure `.worktrees/` is declared in `.gitignore`.

### Step 2: Implement and Test in Worktree
All development (TDD, automated testing, and builds) executes inside `.worktrees/<task-name>`.

Mandatory test validations before submission:
```bash
# Backend .NET
dotnet test backend/ApiDot.sln -v minimal

# Frontend Next.js & Vitest
npm --prefix frontend test -- --run
./frontend/node_modules/.bin/tsc --project frontend/tsconfig.json --noEmit
npm --prefix frontend run build

# Desktop Validators
npm --prefix desktop run test
```

### Step 3: Commit and Push the Working Branch
```bash
git add <changed-files>
git commit -m "feat(scope): concise conventional commit message"
git push -u origin feat/<task-name>
```

### Step 4: Open Pull Request to `dev` (DO NOT MERGE)
Create the Pull Request strictly targeting the **`dev`** branch:

```bash
gh pr create --base dev --head feat/<task-name> \
  --title "feat(scope): title in English" \
  --body "Summary of changes, test evidence, and related references in English."
```

**MANDATORY HARD GATE:**
- **The agent must NEVER merge the PR via CLI (`gh pr merge`) or merge locally to `dev`.**
- The agent outputs the PR link to the user and halts, waiting for Hudson Medeiros to manually review and approve on GitHub.

### Step 5: Post-Approval Cleanup
Only after Hudson approves and merges the PR on GitHub:
```bash
# Return to repository root
cd /path/to/ApiDot

# Remove worktree and synchronize local dev
git worktree remove .worktrees/<task-name>
git checkout dev
git pull origin dev
git branch -d feat/<task-name>
```

---

## 3. Production Release Workflow (`main`)

When features accumulated on `dev` are stabilized and ready for release:

### Step 1: Release Preparation on `dev`
1. Update version in `frontend/package.json` and pertinent manifests (`desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`) following SemVer.
2. Commit the version bump on `dev`:
   ```bash
   git commit -m "chore(release): bump version to vX.Y.Z"
   git push origin dev
   ```

### Step 2: Open Release Pull Request (`dev` → `main`)
Open the Pull Request from `dev` to `main`:
```bash
gh pr create --base main --head dev \
  --title "release: vX.Y.Z — Release Summary" \
  --body "Detailed changelog of integrated changes in English."
```

**MANDATORY HARD GATE:**
- Wait for Hudson to review and approve the Release PR on GitHub.

### Step 3: Production Tag Creation
Strictly **after** the PR is merged into `main`:
```bash
git checkout main
git pull origin main

# Create annotated tag with mandatory 'v' prefix
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

*Rule:* Pushing the annotated tag `vX.Y.Z` triggers the GitHub Actions pipeline to publish production containers to GHCR, build desktop installers, and deploy to the K3s cluster.

---

## 4. Rationalization Table (Forbidden Anti-Patterns)

| Excuse / Rationalization | Operational Reality |
|---|---|
| *"User asked to deliver, so I'll merge directly into dev."* | **FORBIDDEN.** Every integration requires a Pull Request for Hudson's review. |
| *"The change is small (<10 lines), I can commit directly to dev."* | **FORBIDDEN.** All changes, without exception, require an isolated branch/worktree and PR. |
| *"I can use `gh pr merge --auto` to save time."* | **FORBIDDEN.** Merge approval is strictly manual and reserved for the user. |
| *"I'll push the release directly to main."* | **FORBIDDEN.** `main` receives code exclusively via approved PR from `dev`. |
| *"I'll create the tag before the PR is merged into main."* | **FORBIDDEN.** Production tags exist strictly from confirmed commits on `main`. |
