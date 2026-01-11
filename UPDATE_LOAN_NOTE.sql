-- Create RPC function to update loan note
-- This bypasses RLS to allow updating loan notes
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.fn_update_loan_note(p_loan_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_user uuid := public.fn_auth_uid();
  v_loc uuid := public.fn_user_location(v_user);
begin
  if v_loc is null then
    raise exception 'User has no assigned location';
  end if;

  -- Verify the loan belongs to user's location
  if not exists (
    select 1 from public.transactions 
    where id = p_loan_id 
    and type = 'loan' 
    and location_id = v_loc
  ) then
    raise exception 'Loan not found or access denied';
  end if;

  -- Update the note
  update public.transactions 
  set note = p_note
  where id = p_loan_id;
end;
$$;
