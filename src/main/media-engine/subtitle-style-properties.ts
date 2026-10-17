import type { SubtitleStyle } from '@shared/settings/subtitle-style'

/** mpv colors are #AARRGGBB, alpha first. */
function mpvColor(hex: string, opacityPercent = 100): string {
  const alpha = Math.round((opacityPercent / 100) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${alpha}${hex.slice(1)}`.toUpperCase()
}

const assOverride: Record<SubtitleStyle['styledSubtitles'], string> = {
  keep: 'no',
  scale: 'scale',
  override: 'force',
}

/**
 * mpv properties that render subtitles in this style. They change how subtitles are drawn
 * only; the subtitle files themselves are never modified.
 */
export function subtitleStyleProperties(
  style: SubtitleStyle,
): [string, string | number | boolean][] {
  const box = style.background === 'box'
  return [
    ['sub-font', style.font],
    ['sub-font-size', style.fontSize],
    ['sub-scale', style.scale],
    ['sub-bold', style.bold],
    ['sub-italic', style.italic],
    ['sub-color', mpvColor(style.textColor)],
    ['sub-outline-color', mpvColor(style.outlineColor)],
    ['sub-outline-size', style.outlineSize],
    ['sub-border-style', box ? 'background-box' : 'outline-and-shadow'],
    // One color serves as the shadow color or, with a box, the box color.
    [
      'sub-back-color',
      box
        ? mpvColor(style.backgroundColor, style.backgroundOpacity)
        : mpvColor(style.shadowColor, style.shadowOpacity),
    ],
    ['sub-shadow-offset', box ? 0 : style.shadowOffset],
    ['sub-pos', style.position],
    ['sub-margin-y', style.marginY],
    ['sub-ass-override', assOverride[style.styledSubtitles]],
  ]
}
