import type { DatabaseContext, SqlExecutor, SqlParam } from '@/repositories/contracts/database';
import type { Clock } from '@/services/clock';
import { ProfileAlreadyExistsError, ProfileNotFoundError } from './errors';
import type {
  CreateProfileInput,
  Profile,
  ProfileRepository,
  ProfileSex,
  UpdateProfilePatch,
} from './ProfileRepository';

const PROFILE_ID = 'local';

interface UserProfileRow {
  id: string;
  nickname: string;
  avatar_file_name: string | null;
  birth_date: string | null;
  sex: ProfileSex | null;
  created_at: number;
  updated_at: number;
}

function mapRow(row: UserProfileRow): Profile {
  return {
    id: 'local',
    nickname: row.nickname,
    avatarFileName: row.avatar_file_name,
    birthDate: row.birth_date,
    sex: row.sex,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `user_profile` (ARCHITECTURE.md section 7.3) does not extend
 * `BaseSqliteRepository`: that base class exists for UUID-keyed,
 * soft-deletable rows (`AuditedRow`'s `id`/`created_at`/`updated_at`/
 * `deleted_at` shape, generated via `IdGenerator`) and `user_profile` is
 * neither - its primary key is the fixed literal `'local'`, never generated,
 * and the table has no `deleted_at` column at all (there is no concept of
 * soft-deleting the local user; the row exists or it doesn't, gated by
 * whether onboarding has run). Forcing it onto `BaseSqliteRepository` would
 * mean faking an id generator call whose result is thrown away and stubbing
 * out a delete lifecycle the schema doesn't have. This is the same reasoned
 * deviation `SqliteSettingsRepository` documents for `app_setting` - a real
 * table shape the shared base wasn't designed for, handled directly against
 * `DatabaseContext` instead of bent to fit.
 */
export class SqliteProfileRepository implements ProfileRepository {
  constructor(
    private readonly db: DatabaseContext,
    private readonly clock: Clock,
  ) {}

  async get(tx?: SqlExecutor): Promise<Profile | null> {
    const executor = tx ?? this.db;
    const row = await executor.selectOne<UserProfileRow>(
      'SELECT * FROM user_profile WHERE id = ?',
      [PROFILE_ID],
    );
    return row ? mapRow(row) : null;
  }

  async create(input: CreateProfileInput, tx?: SqlExecutor): Promise<Profile> {
    const executor = tx ?? this.db;
    const existing = await this.get(executor);
    if (existing) {
      throw new ProfileAlreadyExistsError();
    }

    const now = this.clock.now();
    await executor.run(
      `INSERT INTO user_profile (id, nickname, avatar_file_name, birth_date, sex, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        PROFILE_ID,
        input.nickname,
        input.avatarFileName ?? null,
        input.birthDate ?? null,
        input.sex ?? null,
        now,
        now,
      ],
    );

    const created = await this.get(executor);
    if (!created) {
      throw new Error('unreachable: user_profile row was just inserted');
    }
    return created;
  }

  async update(patch: UpdateProfilePatch, tx?: SqlExecutor): Promise<Profile> {
    const executor = tx ?? this.db;

    const columns: Record<string, SqlParam> = {};
    if (patch.nickname !== undefined) {
      columns.nickname = patch.nickname;
    }
    if (patch.avatarFileName !== undefined) {
      columns.avatar_file_name = patch.avatarFileName;
    }
    if (patch.birthDate !== undefined) {
      columns.birth_date = patch.birthDate;
    }
    if (patch.sex !== undefined) {
      columns.sex = patch.sex;
    }

    if (Object.keys(columns).length === 0) {
      const current = await this.get(executor);
      if (!current) {
        throw new ProfileNotFoundError();
      }
      return current;
    }

    const now = this.clock.now();
    const entries = Object.entries(columns);
    const assignments = entries.map(([name]) => `${name} = ?`).join(', ');
    const params: SqlParam[] = [...entries.map(([, value]) => value), now, PROFILE_ID];

    const result = await executor.run(
      `UPDATE user_profile SET ${assignments}, updated_at = ? WHERE id = ?`,
      params,
    );
    if (result.changes === 0) {
      throw new ProfileNotFoundError();
    }

    const updated = await this.get(executor);
    if (!updated) {
      throw new Error('unreachable: user_profile row was just updated');
    }
    return updated;
  }
}
