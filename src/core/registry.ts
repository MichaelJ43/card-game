import type { GameModule } from './gameModule'

const modules = new Map<string, GameModule>()

export function registerGameModule(m: GameModule): void {
  modules.set(m.moduleId, m)
}

export function getGameModule(id: string): GameModule | undefined {
  return modules.get(id)
}
