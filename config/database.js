const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

let supabase = null;

const connectDB = async () => {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }

  supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db:   { schema: 'public' }
  });

  // Quick connectivity check
  const { error } = await supabase.from('users').select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows — that's fine, just means table is empty
    throw new Error(`Supabase connection failed: ${error.message}`);
  }

  logger.info(`✅ Supabase connected: ${url}`);
  return supabase;
};

const getDB = () => {
  if (!supabase) throw new Error('Supabase not initialized. Call connectDB() first.');
  return supabase;
};

module.exports = connectDB;
module.exports.getDB = getDB;

