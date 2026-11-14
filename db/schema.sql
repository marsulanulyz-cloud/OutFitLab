-- Stylist AI — PostgreSQL 15+
-- Применение: psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ───────────── Пользователи и сессии ─────────────
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext,                       -- у Apple может быть relay-адрес или NULL
  name           text,
  avatar_url     text,
  auth_provider  text NOT NULL CHECK (auth_provider IN ('google','apple')),
  provider_sub   text NOT NULL,                -- стабильный id пользователя у провайдера
  city           text,
  latitude       double precision CHECK (latitude  BETWEEN -90  AND 90),
  longitude      double precision CHECK (longitude BETWEEN -180 AND 180),
  timezone       text,
  color_type     text,                         -- напр. 'warm_autumn'
  style_prefs    text[] NOT NULL DEFAULT '{}', -- напр. {'minimal','streetwear'}
  theme          text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, provider_sub)
);
CREATE INDEX users_email_idx ON users (email);
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Refresh-токены: храним только sha256-хеш; family_id нужен для детекта повторного использования
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  family_id   uuid NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- ───────────── Справочник категорий ─────────────
-- grp задаёт «слой» в образе: top / bottom / onepiece / outerwear / footwear / accessory
CREATE TABLE categories (
  id       smallint PRIMARY KEY,
  slug     text NOT NULL UNIQUE,
  name_ru  text NOT NULL,
  grp      text NOT NULL CHECK (grp IN ('top','bottom','onepiece','outerwear','footwear','accessory'))
);
INSERT INTO categories (id, slug, name_ru, grp) VALUES
  (1,'tshirt','Футболка','top'),        (2,'shirt','Рубашка','top'),
  (3,'sweater','Свитер','top'),         (4,'hoodie','Худи','top'),
  (5,'jeans','Джинсы','bottom'),        (6,'trousers','Брюки','bottom'),
  (7,'shorts','Шорты','bottom'),        (8,'skirt','Юбка','bottom'),
  (9,'dress','Платье','onepiece'),
  (10,'jacket','Куртка','outerwear'),   (11,'coat','Пальто','outerwear'),
  (12,'sneakers','Кроссовки','footwear'),(13,'boots','Ботинки','footwear'),
  (14,'shoes','Туфли','footwear'),
  (15,'bag','Сумка','accessory'),       (16,'hat','Головной убор','accessory'),
  (17,'scarf','Шарф','accessory'),      (18,'jewelry','Украшения','accessory'),
  (19,'belt','Ремень','accessory');

-- ───────────── Цифровой гардероб ─────────────
CREATE TABLE items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id   smallint NOT NULL REFERENCES categories(id),
  title         text NOT NULL,
  image_url     text NOT NULL,                 -- PNG без фона («вещь на подиуме»)
  original_url  text NOT NULL,                 -- исходное фото
  primary_color text CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  color_name    text,
  material      text,
  seasons       text[] NOT NULL DEFAULT '{}'
                CHECK (seasons <@ ARRAY['winter','spring','summer','autumn']::text[]),
  warmth        smallint CHECK (warmth    BETWEEN 1 AND 5),   -- 1 — очень лёгкая, 5 — зимняя
  formality     smallint CHECK (formality BETWEEN 1 AND 5),   -- 1 — спорт/дом, 5 — строгий
  style_tags    text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'available' CHECK (status IN ('available','laundry')),
  wear_count    integer NOT NULL DEFAULT 0,
  last_worn_at  timestamptz,
  ai_raw        jsonb,                         -- сырой ответ модели (для отладки/переразметки)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_user_status_idx   ON items (user_id, status);
CREATE INDEX items_user_category_idx ON items (user_id, category_id);
CREATE INDEX items_user_lastworn_idx ON items (user_id, last_worn_at);
CREATE TRIGGER items_updated BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ───────────── Образы ─────────────
CREATE TABLE outfits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occasion    text NOT NULL CHECK (occasion IN ('study_office','date','sport','party','walk')),
  vibe        text NOT NULL CHECK (vibe IN ('casual','oversize','formal')),
  weather     jsonb,                           -- снимок погоды на момент генерации
  ai_tip      text,                            -- совет стилиста: «заправь футболку…»
  rationale   text,
  is_saved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outfits_user_created_idx ON outfits (user_id, created_at DESC);

CREATE TABLE outfit_items (
  outfit_id  uuid NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES items(id)   ON DELETE CASCADE,
  role       text NOT NULL,                    -- = categories.grp
  position   smallint NOT NULL DEFAULT 0,      -- порядок в коллаже
  PRIMARY KEY (outfit_id, item_id)
);
CREATE INDEX outfit_items_item_idx ON outfit_items (item_id);

-- Журнал носки: основа «забытых вещей» и статистики
CREATE TABLE wear_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  outfit_id  uuid REFERENCES outfits(id) ON DELETE SET NULL,
  worn_on    date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (item_id, worn_on)                    -- одна отметка в день на вещь (идемпотентность)
);
CREATE INDEX wear_log_user_date_idx ON wear_log (user_id, worn_on DESC);

-- ───────────── Продвинутые фичи ─────────────
CREATE TABLE look_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url     text NOT NULL,
  occasion      text,
  score         smallint NOT NULL CHECK (score BETWEEN 1 AND 10),
  summary       text NOT NULL,
  strengths     text[] NOT NULL DEFAULT '{}',
  improvements  text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX look_ratings_user_idx ON look_ratings (user_id, created_at DESC);

CREATE TABLE purchase_suggestions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            text NOT NULL,
  category_slug    text NOT NULL,
  color_name       text,
  reason           text NOT NULL,
  unlocks_estimate integer,                    -- сколько новых сочетаний даёт вещь (оценка модели)
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_suggestions_user_idx ON purchase_suggestions (user_id, created_at DESC);
