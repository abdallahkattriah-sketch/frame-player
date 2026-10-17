import { describe, expect, it } from 'vitest'
import { parseMediaName } from '../../../src/main/library/filename-parser'

describe('parseMediaName: movies', () => {
  it.each([
    ['The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv', 'The Matrix', 1999],
    ['Inception (2010) [2160p].mp4', 'Inception', 2010],
    ['2001 A Space Odyssey (1968).mkv', '2001 A Space Odyssey', 1968],
    ['Blade.Runner.2049.2017.UHD.HEVC.mkv', 'Blade Runner 2049', 2017],
    ['1917.2019.720p.mkv', '1917', 2019],
    ['Amélie.2001.mkv', 'Amélie', 2001],
    ['Some Home Video.mp4', 'Some Home Video', null],
    ['الرسالة (1976).mkv', 'الرسالة', 1976],
    ['千と千尋の神隠し.2001.1080p.mkv', '千と千尋の神隠し', 2001],
    ['기생충 Parasite (2019).mkv', '기생충 Parasite', 2019],
  ])('%s', (file, title, year) => {
    const r = parseMediaName(file)
    expect(r.kind).toBe('movie')
    expect(r.title).toBe(title)
    expect(r.year).toBe(year)
    expect(r.season).toBeNull()
    expect(r.episode).toBeNull()
  })

  it('extracts technical hints, edition, and release group', () => {
    const r = parseMediaName("Alien.1979.Director's.Cut.Remastered.1080p.BluRay.x265-RARBG.mkv")
    expect(r).toMatchObject({
      title: 'Alien',
      year: 1979,
      resolution: '1080p',
      videoCodec: 'hevc',
      edition: "Director's Cut",
      releaseGroup: 'RARBG',
    })
  })

  it('does not mistake a hyphenated title for a release group', () => {
    expect(parseMediaName('Spider-Man.mkv').releaseGroup).toBeNull()
    expect(parseMediaName('Spider-Man.mkv').title).toBe('Spider-Man')
  })

  it('ignores implausible future years', () => {
    const r = parseMediaName('Movie.2099.mkv')
    expect(r.year).toBeNull()
  })
})

describe('parseMediaName: TV episodes', () => {
  it.each([
    ['Show.Name.S01E02.mkv', 'Show Name', 1, 2],
    ['Show Name 1x02.mkv', 'Show Name', 1, 2],
    ['Show Name - Season 1 - Episode 2.mkv', 'Show Name', 1, 2],
    ['Show Name Season 1 Episode 2.mkv', 'Show Name', 1, 2],
    ['show.name.s1e2.720p.mkv', 'show name', 1, 2],
    ['The.Office.US.S05E14.Stress.Relief.720p.WEB-DL.mkv', 'The Office US', 5, 14],
    ['Doctor.Who.2005.S00E01.Christmas.Special.mkv', 'Doctor Who', 0, 1],
  ])('%s', (file, title, season, episode) => {
    const r = parseMediaName(file)
    expect(r.kind).toBe('episode')
    expect(r.title).toBe(title)
    expect(r.season).toBe(season)
    expect(r.episode).toBe(episode)
  })

  it('extracts the episode title and the show year', () => {
    const r = parseMediaName('Doctor.Who.2005.S01E01.Rose.1080p.mkv')
    expect(r.year).toBe(2005)
    expect(r.episodeTitle).toBe('Rose')
  })

  it('reads multi-episode files', () => {
    expect(parseMediaName('Show.S02E05E06.mkv')).toMatchObject({ episode: 5, episodeEnd: 6 })
    expect(parseMediaName('Show.S02E05-E06.mkv')).toMatchObject({ episode: 5, episodeEnd: 6 })
    expect(parseMediaName('Show 2x05-06.mkv')).toMatchObject({ episode: 5, episodeEnd: 6 })
  })

  it('keeps anime absolute numbering without inventing a season', () => {
    const r = parseMediaName('[SubsPlease] Frieren - 05 (1080p) [ABCD1234].mkv')
    expect(r).toMatchObject({
      kind: 'episode',
      title: 'Frieren',
      season: null,
      episode: 5,
      releaseGroup: 'SubsPlease',
      resolution: '1080p',
    })
  })

  it('uses season and show folders when the file name lacks them', () => {
    const r = parseMediaName('S02E03.mkv', ['Season 2', 'Breaking Bad (2008)'])
    expect(r).toMatchObject({
      kind: 'episode',
      title: 'Breaking Bad',
      year: 2008,
      season: 2,
      episode: 3,
    })

    const special = parseMediaName('Show - 01.mkv', ['Specials', 'Show'])
    expect(special).toMatchObject({ kind: 'episode', season: 0, episode: 1, title: 'Show' })
  })

  it('handles Arabic and Japanese show names', () => {
    expect(parseMediaName('مسلسل الاختيار S01E05.mkv')).toMatchObject({
      title: 'مسلسل الاختيار',
      season: 1,
      episode: 5,
    })
    expect(parseMediaName('進撃の巨人 - 12 [1080p].mkv')).toMatchObject({
      title: '進撃の巨人',
      episode: 12,
      season: null,
    })
  })
})
