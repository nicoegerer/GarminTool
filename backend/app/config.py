from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    garmin_token_dir: str = ".garmin_tokens"
    database_url: str = "sqlite:///./garmin.db"
    sync_interval_minutes: int = 120
    tz: str = "Europe/Berlin"


settings = Settings()
