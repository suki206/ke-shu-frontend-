import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://fkvqlssqzuyvaiqgngml.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_5zARl_EQcfTxlULidN8Bkw_vT_JYal4"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
