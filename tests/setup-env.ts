// Integration tests always run against the dedicated test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/tradepilot_test";
process.env.AUTH_SECRET ??= "test-secret";
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = ".storage-test";
