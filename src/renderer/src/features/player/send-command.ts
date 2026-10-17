import type { PlayerCommand } from '@shared/contracts/player'

/** Fire-and-forget: the resulting state arrives from mpv through the state subscription. */
export function sendCommand(command: PlayerCommand): void {
  void window.frame.player.command(command).catch(() => undefined)
}
