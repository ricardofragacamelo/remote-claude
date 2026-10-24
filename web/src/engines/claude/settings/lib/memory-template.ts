/** `CLAUDE.md` at the project's own root — B-32. No frontmatter: this file is plain markdown,
 * read by Claude as its own instructions, never parsed as a slash command or a skill. */
export function memoryTemplate(): string {
  return `# Project notes for Claude

Commands it should know (build, test, lint), conventions this repository follows, and anything a
new session needs that is not obvious from the code itself.
`;
}
