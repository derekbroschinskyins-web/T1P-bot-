// Must be imported FIRST in tests: ESM hoists imports, so env set in a test
// body would land after src/config.js has already read process.env.
process.env.NODE_ENV = 'test';
process.env.VERIFY_TOKEN = 'test-verify-token';
process.env.APP_SECRET = 'test-app-secret';
process.env.WHATSAPP_TOKEN = 'test-token';
process.env.PHONE_NUMBER_ID = '111111';
process.env.SUPABASE_URL = 'http://127.0.0.1:59999';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TIMEZONE = 'America/Denver';
process.env.ADMIN_NUMBERS = '18015550001';
