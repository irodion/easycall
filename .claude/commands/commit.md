Create a new commit for all of our uncommitted changes
run git status && git diff HEAD && git status --porcelain to see what files are uncommitted
add the untracked and changed files

Add an atomic commit message with an appropriate message

always commit to a separate branch, never commit to main. Prefix the branch according to the
work: "feat/", "fix/", "docs/" etc.

add a tag such as "feat", "fix", "docs", etc. that reflects our work
