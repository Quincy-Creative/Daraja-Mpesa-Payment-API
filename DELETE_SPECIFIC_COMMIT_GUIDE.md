# 🗑️ Delete Specific Commit with Leaked .env File

## Method 1: Interactive Rebase (RECOMMENDED for recent commits)

### Step 1: Find your commit
```bash
# View commit history
git log --oneline

# Or if you already have the commit ID
# Example: abc1234
```

### Step 2: Start interactive rebase
```bash
# Replace <commit-id> with the commit BEFORE the one you want to delete
git rebase -i <commit-id>^

# Example: If bad commit is abc1234, use:
git rebase -i abc1234^

# Or go back N commits from HEAD:
git rebase -i HEAD~5  # Goes back 5 commits
```

### Step 3: Delete the commit
An editor will open showing commits like this:
```
pick abc1234 Added .env file (BAD COMMIT)
pick def5678 Fixed payment controller
pick ghi9012 Updated README
```

**Change `pick` to `drop` (or just delete the line) for the bad commit:**
```
drop abc1234 Added .env file (BAD COMMIT)
pick def5678 Fixed payment controller
pick ghi9012 Updated README
```

Save and close the editor.

### Step 4: Force push
```bash
# Force push to update GitHub
git push --force origin main

# Or if working with others (safer):
git push --force-with-lease origin main
```

---

## Method 2: Revert Single Commit (Keeps history, safer for teams)

This doesn't delete the commit, but creates a new commit that undoes it:

```bash
# Creates a new commit that reverses the bad commit
git revert <commit-id>

# Example:
git revert abc1234

# Push normally (no force needed)
git push origin main
```

**Pros:** 
- ✅ Safer for teams
- ✅ Keeps audit trail
- ✅ No force push needed

**Cons:**
- ⚠️ File still visible in history (at the original commit)

---

## Method 3: Filter Files from Entire History (Nuclear option)

If you want to remove `.env` from ALL commits throughout history:

### Using git filter-repo (Modern, fastest)

**Install git-filter-repo first:**
```bash
# Windows (with Python installed)
pip install git-filter-repo

# Or download from: https://github.com/newren/git-filter-repo
```

**Run the filter:**
```bash
# Remove .env from all commits
git filter-repo --path .env --invert-paths
git filter-repo --path .env.example --invert-paths

# Force push
git push --force origin main
```

### Using BFG Repo-Cleaner (User-friendly)

**Download BFG:**
- Windows: https://rclone.org/downloads/
- Or: https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

**Run BFG:**
```bash
# If you downloaded the JAR file:
java -jar bfg.jar --delete-files .env
java -jar bfg.jar --delete-files .env.example

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force origin main
```

---

## Method 4: Remove Files from Specific Commit Only

If you want to remove `.env` from one specific commit without deleting the commit:

```bash
# Create a new branch at the bad commit
git checkout -b temp-fix <commit-id>

# Remove the files
git rm --cached .env .env.example
git commit --amend --no-edit

# Get the new commit hash
NEW_COMMIT=$(git rev-parse HEAD)

# Go back to main
git checkout main

# Rebase onto the fixed commit
git rebase --onto $NEW_COMMIT <commit-id> main

# Force push
git push --force origin main

# Clean up
git branch -D temp-fix
```

---

## 🎯 Quick Decision Guide

**Choose based on your situation:**

| Scenario | Best Method |
|----------|-------------|
| Recent commit (< 10 commits ago) | **Method 1: Interactive Rebase** |
| Need to keep commit history | **Method 2: Revert** |
| .env in multiple commits | **Method 3: Filter History** |
| Specific commit, keep others | **Method 4: Amend Specific** |

---

## ⚠️ IMPORTANT: Before Force Pushing

### 1. Backup your repo
```bash
# Create a backup branch
git branch backup-before-cleanup
```

### 2. Warn your team
If others are working on the repo, they'll need to:
```bash
git fetch origin
git reset --hard origin/main
```

### 3. After cleaning, rotate ALL secrets
- Generate new M-Pesa API keys
- Change database passwords
- Update all credentials that were in the .env file

---

## 🆘 If Something Goes Wrong

### Restore from backup:
```bash
git checkout backup-before-cleanup
git branch -M backup-before-cleanup main
git push --force origin main
```

### Or restore from GitHub:
```bash
# If you have a backup on GitHub, reset to it:
git fetch origin
git reset --hard origin/main
```

---

## ✅ Verification Steps

After cleaning, verify the .env is gone:

```bash
# Search entire history for .env
git log --all --full-history -- .env

# If it returns nothing, you're good!

# Or check specific commit:
git show <commit-id>:.env
# Should return: "fatal: Path '.env' does not exist"
```

---

## 📝 Example: Complete Workflow

Let's say your bad commit is `abc1234`:

```bash
# 1. Create backup
git branch backup-before-cleanup

# 2. Interactive rebase (go back to before bad commit)
git rebase -i abc1234^

# 3. In editor, change 'pick' to 'drop' for abc1234

# 4. Save and close editor

# 5. Force push
git push --force origin main

# 6. Verify it's gone
git log --all --full-history -- .env

# 7. Rotate your API keys immediately!
```

Done! 🎉

