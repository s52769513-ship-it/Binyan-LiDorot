-- מפעיל שידור Realtime (WebSocket) לטבלאות שהאפליקציה מאזינה להן דרך
-- useRealtimeRefresh (lib/useRealtimeRefresh.ts) - כדי שעמוד פתוח יתעדכן
-- מיידית כששינוי (הוספה/מחיקה/עדכון) קורה במקום אחר, בלי לחכות ל-polling
-- הגיבוי (כל 15 שניות) או לרענון ידני.
--
-- ב-Supabase, טבלה לא משדרת שינויים דרך Realtime עד שהיא נוספת במפורש
-- ל-publication בשם supabase_realtime (שקיים כברירת מחדל אך ריק).
-- הפקודה בטוחה להרצה חוזרת - IF NOT EXISTS-style guard באמצעות בדיקה.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions', 'parents', 'planned_payments', 'deleted_records', 'cash_fund_entries']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
