/**
 * The registries the control plane routes through.
 *
 * These are the seams that turn "bring your own" into an architecture choice: the
 * loop asks the {@link AgentRegistry} for an agent that can serve a phase with a
 * set of capabilities, and asks the {@link ProviderRegistry} for the model a role
 * targets. Both are user-owned at runtime; neither holds a key or an implementation
 * detail of any specific vendor.
 */

import type { AgentAdapter, Capability, LoopPhase } from './agent'
import type { LlmProvider, ModelProfile } from './llm'

export class AgentRegistry {
  private agents = new Map<string, AgentAdapter>()

  register(agent: AgentAdapter): void {
    this.agents.set(agent.manifest.id, agent)
  }

  unregister(id: string): void {
    this.agents.delete(id)
  }

  all(): AgentAdapter[] {
    return [...this.agents.values()]
  }

  /**
   * Every agent that may serve `phase` and advertises all of `needs`. Hermes picks
   * from this set; with an empty registry the caller falls back to the built-in
   * simulated crew.
   */
  resolve(phase: LoopPhase, needs: Capability[] = []): AgentAdapter[] {
    return this.all().filter(
      (a) => a.manifest.phases.includes(phase) && needs.every((c) => a.manifest.capabilities.includes(c)),
    )
  }
}

export class ProviderRegistry {
  private providers = new Map<string, LlmProvider>()
  private profiles = new Map<string, ModelProfile>()

  addProvider(p: LlmProvider): void {
    this.providers.set(p.id, p)
  }

  addProfile(p: ModelProfile): void {
    this.profiles.set(p.id, p)
  }

  profile(id: string): ModelProfile | undefined {
    return this.profiles.get(id)
  }

  /** Resolve a profile id to its provider + profile, ready for `provider.complete`. */
  resolve(profileId: string): { provider: LlmProvider; profile: ModelProfile } | undefined {
    const profile = this.profiles.get(profileId)
    if (!profile) return undefined
    const provider = this.providers.get(profile.provider)
    if (!provider) return undefined
    return { provider, profile }
  }
}
