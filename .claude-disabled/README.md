# Отключённое (не загружается Claude Code)

17.11.2026 по просьбе владельца отключён навык **impeccable** (проектная установка 3.1.1, коммит e2bccbc) и четыре его агента `impeccable-*`.
Claude Code читает только `.claude/skills` и `.claude/agents`, поэтому всё лежит здесь — файлы сохранены, ничего не удалено.

Вернуть: `git mv .claude-disabled/impeccable .claude/skills/impeccable` и `git mv .claude-disabled/agents/impeccable-*.md .claude/agents/`.
Изменение вступает в силу с новой сессии (в уже открытой список навыков загружен при старте).
