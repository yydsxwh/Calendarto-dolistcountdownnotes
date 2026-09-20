/**
 * Ordered, append-only schema migrations.
 *
 * Never edit a released migration: add a new one. `down` exists so a bad
 * release can be rolled back by hand; the runner only applies `up`.
 */

export interface Migration {
  id: number
  name: string
  up: string
  down: string
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'account_center_identity',
    up: `
      -- 日事领域用户。身份主键是账号中心的 OIDC sub，不是 email。
      CREATE TABLE rishi_user (
        id                 TEXT    PRIMARY KEY,
        account_user_id    TEXT    NOT NULL UNIQUE,
        display_name       TEXT,
        email              TEXT,
        avatar_url         TEXT,
        profile_updated_at INTEGER,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL,
        last_login_at      INTEGER
      );

      -- 日事自己的会话。主键是 sha256(token)，明文 token 只存在于 Cookie / Bearer。
      CREATE TABLE rishi_session (
        id                  TEXT    PRIMARY KEY,
        user_id             TEXT    NOT NULL REFERENCES rishi_user(id) ON DELETE CASCADE,
        client_kind         TEXT    NOT NULL DEFAULT 'web',
        created_at          INTEGER NOT NULL,
        last_seen_at        INTEGER NOT NULL,
        idle_expires_at     INTEGER NOT NULL,
        absolute_expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_rishi_session_user ON rishi_session(user_id);
      CREATE INDEX idx_rishi_session_absolute_expires_at ON rishi_session(absolute_expires_at);

      -- 一次性授权事务：state / nonce / PKCE code_verifier 只保存在服务端。
      CREATE TABLE oidc_auth_request (
        state         TEXT    PRIMARY KEY,
        code_verifier TEXT    NOT NULL,
        nonce         TEXT    NOT NULL,
        return_to     TEXT    NOT NULL,
        client_kind   TEXT    NOT NULL DEFAULT 'web',
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL
      );
      CREATE INDEX idx_oidc_auth_request_expires_at ON oidc_auth_request(expires_at);

      -- 账号中心 refresh token（仅在开启 offline_access 时写入），AES-256-GCM 密文。
      CREATE TABLE account_token (
        user_id                  TEXT    PRIMARY KEY REFERENCES rishi_user(id) ON DELETE CASCADE,
        refresh_token_ciphertext TEXT    NOT NULL,
        refresh_token_iv         TEXT    NOT NULL,
        refresh_token_tag        TEXT    NOT NULL,
        scope                    TEXT,
        obtained_at              INTEGER NOT NULL,
        rotated_at               INTEGER NOT NULL
      );

      -- 日事业务数据文档，一个用户一行。写入永远以服务端会话用户为准。
      CREATE TABLE rishi_user_data (
        user_id    TEXT    PRIMARY KEY REFERENCES rishi_user(id) ON DELETE CASCADE,
        payload    TEXT    NOT NULL,
        version    INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      -- 条目 → 归属用户索引，用来区分「不存在」(404) 和「属于别人」(403)。
      CREATE TABLE rishi_data_item (
        collection TEXT NOT NULL,
        item_id    TEXT NOT NULL,
        user_id    TEXT NOT NULL REFERENCES rishi_user(id) ON DELETE CASCADE,
        PRIMARY KEY (collection, item_id)
      );
      CREATE INDEX idx_rishi_data_item_user ON rishi_data_item(user_id);

      -- 原生客户端一次性登录交换码，不携带会话令牌本身。
      CREATE TABLE native_handoff (
        id         TEXT    PRIMARY KEY,
        user_id    TEXT    NOT NULL REFERENCES rishi_user(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_native_handoff_expires_at ON native_handoff(expires_at);
    `,
    down: `
      DROP TABLE IF EXISTS native_handoff;
      DROP TABLE IF EXISTS rishi_data_item;
      DROP TABLE IF EXISTS rishi_user_data;
      DROP TABLE IF EXISTS account_token;
      DROP TABLE IF EXISTS oidc_auth_request;
      DROP TABLE IF EXISTS rishi_session;
      DROP TABLE IF EXISTS rishi_user;
    `,
  },
]
