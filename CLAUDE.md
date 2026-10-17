# Frame — Project Instructions

## Project
Frame is a local-first Windows video player built with Electron, React, TypeScript, and Vite. It uses mpv for playback and SQLite for local data.

## Core Rules
- Read the existing code before changing it.
- Preserve the current architecture and working features unless a change is necessary.
- Do not rewrite entire files or modules when a focused change is sufficient.
- Do not add dependencies without explaining why they are needed.
- Never invent APIs, package scripts, or project structure. Inspect the repository first.
- Ask before making large architectural changes, deleting data, or performing destructive operations.
- Never expose API keys, tokens, passwords, or other secrets in code, logs, or documentation.
- Keep secrets out of Git. Use environment variables during development and a suitable secure credential store for production.
- Never run dangerous shell commands without explaining their impact and obtaining approval.

## Token and Agent Efficiency
- Use the main agent by default.
- Do not spawn subagents, teams, or parallel research tasks unless I explicitly approve them first.
- Work sequentially, one clearly scoped task at a time.
- Inspect only the files relevant to the current task.
- Avoid repeatedly scanning the entire repository or rereading unchanged files.
- Do not generate long plans or reports for small tasks.
- Ask one concise clarification question when a missing detail blocks progress; otherwise state reasonable assumptions.
- Reuse findings already established in the current session.
- Do not implement unrelated improvements or speculative features.
- Before starting a task, briefly state the intended change and its acceptance criteria.
- If a task is large, split it into small milestones and ask for approval before proceeding.

## Coding Standards
- Use TypeScript types appropriately; avoid `any` unless justified.
- Follow existing naming, formatting, and component conventions.
- Keep UI components focused and separate business logic where appropriate.
- Handle errors explicitly, especially around file access, mpv, SQLite, network requests, and subtitle downloads.
- Validate external data and user input.
- Keep Electron security enabled: use context isolation, avoid enabling Node integration in renderer code, and expose only necessary APIs through a preload bridge.

## Testing
- Inspect available package scripts before choosing commands.
- Run the smallest relevant test or check after each meaningful change.
- Run broader tests at milestone boundaries or when changes affect multiple modules.
- Never claim a test passed unless you actually ran it and verified the result.
- Report blockers and untested areas honestly.

## Workflow
1. Inspect relevant files and current Git changes.
2. Summarize the proposed change briefly.
3. Make the smallest sufficient implementation.
4. Run relevant checks.
5. Review the diff for regressions, secrets, and unrelated edits.
6. Report changed files, tests run, and any remaining issues.

## Communication
- Keep explanations concise and practical.
- Ask for approval before moving beyond the agreed task.
- Do not finish with a long summary when a few bullet points are enough.