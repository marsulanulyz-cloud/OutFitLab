from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str
    jwt_alg: str = "HS256"
    access_ttl_min: int = 15
    refresh_ttl_days: int = 30

    google_client_id: str
    apple_client_id: str

    gemini_api_key: str
    gemini_model: str = "gemini-2.5-flash"

    upload_dir: str = "./uploads"
    public_base_url: str = "http://localhost:8000"
    cors_origins: list[str] = ["http://localhost:3000"]
    max_upload_mb: int = 10


@lru_cache
def get_settings() -> Settings:
    return Settings()
