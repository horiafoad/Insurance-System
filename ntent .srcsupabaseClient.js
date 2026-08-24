[1mdiff --git a/src/supabaseClient.js b/src/supabaseClient.js[m
[1mindex 3f14ec6..e1e28f3 100644[m
[1m--- a/src/supabaseClient.js[m
[1m+++ b/src/supabaseClient.js[m
[36m@@ -1,9 +1,9 @@[m
[31m-import { createClient } from "@supabase/supabase-js";[m
[32m+[m[32m﻿import { createClient } from "@supabase/supabase-js";[m
 [m
 const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;[m
[31m-const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;[m
[32m+[m[32mconst supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;[m
 [m
 export const supabase = createClient([m
   supabaseUrl,[m
   supabasePublishableKey[m
[31m-);[m
\ No newline at end of file[m
[32m+[m[32m);[m
