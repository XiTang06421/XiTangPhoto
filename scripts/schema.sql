CREATE TABLE IF NOT EXISTS photos (
  id serial PRIMARY KEY,
  hash text NOT NULL UNIQUE,
  phash text,
  kind text NOT NULL DEFAULT 'image',
  original_url text NOT NULL,
  display_url text NOT NULL,
  thumb_url text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  duration real,
  taken_at timestamptz NOT NULL,
  month text NOT NULL,
  note text,
  favorite boolean NOT NULL DEFAULT false,
  favorited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotation smallint NOT NULL DEFAULT 0,
  private boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS photos_month_idx ON photos (month, taken_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS photos_kind_idx ON photos (kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS photos_fav_idx ON photos (favorited_at DESC) WHERE favorite AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS photos_deleted_idx ON photos (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS month_covers (
  kind text NOT NULL,
  month text NOT NULL,
  photo_id integer NOT NULL,
  PRIMARY KEY (kind, month)
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  nickname text,
  is_admin boolean NOT NULL DEFAULT false,
  kind text NOT NULL DEFAULT 'text',
  body text,
  image_url text,
  image_width integer,
  image_height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS tracks (
  id serial PRIMARY KEY,
  title text NOT NULL,
  artist text,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visitors (
  device_id text PRIMARY KEY,
  role text NOT NULL,
  device text,
  user_agent text,
  ip text,
  visits integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
