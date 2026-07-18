/** A tiny, dependency-free flag parser — positional args plus --flag value pairs. */
export interface ParsedArgs {
  positional: string[]
  flags: Record<string, string>
}

export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`Flag --${key} needs a value.`)
      flags[key] = value
      i++
    } else {
      positional.push(arg)
    }
  }

  return { positional, flags }
}
