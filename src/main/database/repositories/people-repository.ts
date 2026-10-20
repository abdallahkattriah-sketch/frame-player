import type { FollowedPerson, FollowPersonInput } from '@shared/contracts/people'
import type { Database } from '../connection'

/** Followed people and dismissed recommendations, keyed by TMDB person id. */
export class PeopleRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Followed people, newest first; `search` matches part of the name. */
  list(search = ''): FollowedPerson[] {
    const term = search.trim()
    return this.db
      .prepare(
        `SELECT tmdb_person_id AS personId, name, profile_path AS profilePath, department,
                followed_at AS followedAt
         FROM followed_people
         WHERE ? = '' OR name LIKE '%' || ? || '%' ESCAPE '\\'
         ORDER BY followed_at DESC, tmdb_person_id`,
      )
      .all(term, escapeLike(term)) as unknown as FollowedPerson[]
  }

  followedIds(): Set<number> {
    const rows = this.db.prepare('SELECT tmdb_person_id AS id FROM followed_people').all() as {
      id: number
    }[]
    return new Set(rows.map((r) => r.id))
  }

  isFollowing(personId: number): boolean {
    return !!this.db.prepare('SELECT 1 FROM followed_people WHERE tmdb_person_id = ?').get(personId)
  }

  /**
   * Follows a person, or refreshes the stored name and photo when already followed (the original
   * follow date is kept). Following also clears an earlier "Not interested".
   */
  follow(person: FollowPersonInput): void {
    this.db
      .prepare(
        `INSERT INTO followed_people (tmdb_person_id, name, profile_path, department, followed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (tmdb_person_id) DO UPDATE SET
           name = excluded.name, profile_path = excluded.profile_path,
           department = excluded.department`,
      )
      .run(
        person.personId,
        person.name,
        person.profilePath,
        person.department,
        this.now().toISOString(),
      )
    this.db.prepare('DELETE FROM dismissed_people WHERE tmdb_person_id = ?').run(person.personId)
  }

  unfollow(personId: number): boolean {
    return (
      this.db.prepare('DELETE FROM followed_people WHERE tmdb_person_id = ?').run(personId)
        .changes > 0
    )
  }

  dismiss(personId: number): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO dismissed_people (tmdb_person_id, dismissed_at) VALUES (?, ?)',
      )
      .run(personId, this.now().toISOString())
  }

  dismissedIds(): Set<number> {
    const rows = this.db.prepare('SELECT tmdb_person_id AS id FROM dismissed_people').all() as {
      id: number
    }[]
    return new Set(rows.map((r) => r.id))
  }

  /** Shows every dismissed recommendation again. Returns how many were cleared. */
  clearDismissed(): number {
    return Number(this.db.prepare('DELETE FROM dismissed_people').run().changes)
  }
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}
