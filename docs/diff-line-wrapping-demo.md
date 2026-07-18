<!-- markdownlint-disable MD013 -->

# Diff Line Wrapping Demo

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

| Layout | Content | Navigation | Expected review behavior |
| --- | --- | --- | --- |
| Unified diff | One continuous stream presents additions and deletions together for compact review. | Vertical review with optional horizontal navigation | Changed lines remain readable in source order while long prose follows the selected wrapping preference. |
| Split diff | Previous and current text appear in parallel columns so corresponding revisions can be compared directly. | Synchronized vertical review with shared horizontal navigation | Both panes retain their line-number gutters and change markers while reviewers move across long content. |
| Long content | A deliberately extended sentence exceeds the visible panel width and demonstrates how prose behaves near word boundaries. | Horizontal review when wrapping is disabled, or vertical review when wrapping is enabled | The display preserves complete words when wrapping and exposes the full logical line through horizontal scrolling when wrapping is disabled. |
