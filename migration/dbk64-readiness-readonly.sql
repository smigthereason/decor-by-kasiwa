-- DBK-64 READ ONLY. Intended for an isolated Neon test branch after schema creation.
-- Never enables a gate, mutates inventory, or claims live financial readiness.
SELECT
  to_regclass('public.dbk64_online_orders') AS online_orders_table,
  to_regclass('public.dbk55_paid_pos_settlements') AS paid_settlements_table,
  to_regclass('public.dbk62_cutover_config') AS pos_cutover_table;

SELECT 'dbk64_online' AS gate,enabled FROM public.dbk64_online_config
UNION ALL SELECT 'dbk62_pos',enabled FROM public.dbk62_cutover_config
UNION ALL SELECT 'dbk55_settlement',enabled FROM public.dbk55_settlement_config;

-- Run only after the table exists. On test, all counters should normally be zero.
SELECT payment_status,stock_status,count(*) AS order_count,
       coalesce(sum(amount_minor),0) AS gross_amount_minor
FROM public.dbk64_online_orders
GROUP BY payment_status,stock_status ORDER BY payment_status,stock_status;
