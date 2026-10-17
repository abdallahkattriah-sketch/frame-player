/** Dynamic range normalization from FFmpeg (bundled in mpv): quiet speech up, loud scenes down. */
export const LOUDNESS_FILTER = 'lavfi=[dynaudnorm=f=250:g=31:p=0.9]'
