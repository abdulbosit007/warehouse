CREATE OR REPLACE FUNCTION public.fn_branch_commit_return(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_user uuid := public.fn_auth_uid();
  v_loc  uuid := public.fn_user_location(v_user);
  v_tx   uuid;
  v_sale_tx uuid;  -- NEW: for sale transaction
  v_item jsonb;
  v_prod uuid;
  v_qty  int;
  v_kind text := p->>'return_kind'; -- 'loan_return' | 'sale_return'
  v_parent uuid := nullif(p->>'parent_tx_id','')::uuid;
  v_parent_created timestamptz;
  v_bucket text;
  v_no_stock_return boolean := coalesce((p->>'no_stock_return')::boolean, false);
  v_borrower_name text;  -- NEW: to get borrower info
begin
  if v_loc is null then
    raise exception 'User has no assigned location';
  end if;

  if v_kind not in ('loan_return','sale_return') then
    raise exception 'return_kind must be loan_return or sale_return';
  end if;

  if v_kind='sale_return' and v_parent is not null then
    select created_at into v_parent_created from public.transactions
     where id=v_parent and type='sale';
    if v_parent_created is null then
      raise exception 'parent_tx_id is not a sale or not found';
    end if;
    if v_parent_created < now() - interval '6 months' then
      raise exception 'Sale return window (6 months) exceeded';
    end if;
  end if;

  v_bucket := case when v_kind='loan_return' then 'loaned' else 'sold' end;

  -- Get borrower name for loan sales note
  if v_kind = 'loan_return' and v_no_stock_return and v_parent is not null then
    select borrower_name into v_borrower_name from public.transactions where id = v_parent;
  end if;

  -- NEW: If this is a loan sale (no_stock_return = true), create a sale transaction first
  if v_kind = 'loan_return' and v_no_stock_return then
    insert into public.transactions (type, status, location_id, created_by, note, parent_tx_id)
    values ('sale', 'committed', v_loc, v_user, 
            coalesce('Loan sale from ' || nullif(v_borrower_name, ''), 'Loan sale'), 
            v_parent)
    returning id into v_sale_tx;
    
    -- Insert sale items (without touching stock - stock stays in loaned)
    for v_item in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
      v_prod := (v_item->>'product_id')::uuid;
      v_qty  := (v_item->>'qty')::int;
      if v_prod is null or v_qty <= 0 then
        raise exception 'Invalid item payload';
      end if;
      
      insert into public.transaction_items (tx_id, product_id, qty)
      values (v_sale_tx, v_prod, v_qty);
    end loop;
  end if;

  insert into public.transactions (type, status, location_id, created_by, note, parent_tx_id)
  values (v_kind, 'committed', v_loc, v_user, coalesce(p->>'note',''), v_parent)
  returning id into v_tx;

  for v_item in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
    v_prod := (v_item->>'product_id')::uuid;
    v_qty  := (v_item->>'qty')::int;
    if v_prod is null or v_qty <= 0 then
      raise exception 'Invalid item payload';
    end if;

    -- ONLY increase available stock if no_stock_return is false
    -- When loan is SOLD (money received), we skip this so stock stays with customer
    if not v_no_stock_return then
      -- ensure available row exists
      insert into public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
      values (gen_random_uuid(), v_prod, 0, 'available', v_user, now(), v_loc)
      on conflict (product_id, location_id, status) do nothing;

      -- increase available
      update public.product_list
         set quantity = quantity + v_qty
       where product_id=v_prod and location_id=v_loc and status='available';
    end if;

    -- ensure bucket row exists, then decrease it (never below 0)
    insert into public.product_list (id, product_id, quantity, status, inserted_by, inserted_at, location_id)
    values (gen_random_uuid(), v_prod, 0, v_bucket, v_user, now(), v_loc)
    on conflict (product_id, location_id, status) do nothing;

    update public.product_list
       set quantity = greatest(0, quantity - v_qty)
     where product_id=v_prod and location_id=v_loc and status=v_bucket;

    insert into public.transaction_items (tx_id, product_id, qty)
    values (v_tx, v_prod, v_qty);

    insert into public.stock_ledger (location_id, product_id, delta_qty, reason, tx_id, actor_user_id, note)
    values (v_loc, v_prod, 
            case when v_no_stock_return then 0 else v_qty end,  -- delta is 0 for sales
            case when v_kind='loan_return' then 'loan_return' else 'sale_return' end,
            v_tx, v_user, 
            case when v_no_stock_return then 'Sold (no stock return)' else coalesce(p->>'note','') end);
  end loop;

  return v_tx;
end;
$$;
