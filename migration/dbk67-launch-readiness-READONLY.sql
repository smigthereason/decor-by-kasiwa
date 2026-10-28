-- DBK-67: READ ONLY launch dashboard. Execute against dbk51-test now, production
-- only during a coordinated reviewed pre-cutover. Never modifies application state.
SELECT current_database() AS db, current_user AS db_user,
       (SELECT count(*) FROM public.dbk51_stock_balances) AS stock_balance_rows,
       (SELECT coalesce(sum(on_hand),0) FROM public.dbk51_stock_balances) AS stock_units,
       (SELECT seed_fingerprint FROM public.dbk51_stock_engine_config WHERE singleton) AS stock_seed,
       (SELECT reconciliation_fingerprint FROM public.dbk62_cutover_config WHERE singleton) AS cutover_seed;

SELECT 'stock_engine' AS gate,writes_enabled AS enabled FROM public.dbk51_stock_engine_config WHERE singleton
UNION ALL SELECT 'settlement',enabled FROM public.dbk55_settlement_config WHERE singleton
UNION ALL SELECT 'pos_ledger',enabled FROM public.dbk56_ledger_config WHERE singleton
UNION ALL SELECT 'manual_pos',enabled FROM public.dbk57_manual_sale_config WHERE singleton
UNION ALL SELECT 'real_pos',enabled FROM public.dbk62_cutover_config WHERE singleton
UNION ALL SELECT 'finance',enabled FROM public.dbk63_financial_config WHERE singleton
UNION ALL SELECT 'online_paystack',enabled FROM public.dbk64_online_config WHERE singleton
UNION ALL SELECT 'online_fulfilment',enabled FROM public.dbk65_online_fulfilment_config WHERE singleton;

SELECT payment_status,stock_status,count(*) AS orders,coalesce(sum(amount_minor),0) AS amount_minor
FROM public.dbk64_online_orders GROUP BY payment_status,stock_status ORDER BY payment_status,stock_status;

SELECT count(*) AS paid_needing_stock_review FROM public.dbk64_online_orders
WHERE payment_status='PAID' AND stock_status<>'COMMITTED';

SELECT count(*) AS unpaid_but_fulfilled FROM public.dbk65_online_fulfilment f
JOIN public.dbk64_online_orders o ON o.order_id=f.order_id
WHERE o.payment_status<>'PAID' OR o.stock_status<>'COMMITTED';

SELECT count(*) AS real_pos_order_count FROM public.dbk62_manual_sales;
SELECT count(*) AS receivable_payment_count FROM public.dbk56_pos_payments WHERE payment_purpose='RECEIVABLE';
SELECT count(*) AS refund_count FROM public.dbk63_pos_refunds;
