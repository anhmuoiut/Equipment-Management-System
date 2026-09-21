-- =============================================================================
-- 001_rpc_tests.sql  —  Test case bắt buộc pass (Spec v0.9 mục 47c + 48)
-- Chạy: psql -v ON_ERROR_STOP=1 -d <db> -f 001_rpc_tests.sql
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function test_assert(p_cond boolean, p_name text) returns void
language plpgsql as $$
begin
  if p_cond then
    raise notice 'PASS  %', p_name;
  else
    raise exception 'FAIL  %', p_name;
  end if;
end $$;

create or replace function test_raises(p_sql text, p_expect text, p_name text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'FAIL  % (không raise gì, mong đợi %)', p_name, p_expect;
  exception
    when others then
      if sqlerrm = p_expect then
        raise notice 'PASS  % -> %', p_name, p_expect;
      elsif sqlerrm like 'FAIL%' then
        raise;
      else
        raise exception 'FAIL  % (nhận "%" thay vì "%")', p_name, sqlerrm, p_expect;
      end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- FIXTURE
-- ---------------------------------------------------------------------------
truncate public.audit_log, public.field_permissions cascade;
delete from public.equipment;
delete from public.locations;
delete from public.user_profiles;
delete from auth.users;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local');

insert into public.locations (id, code, name, sort_order) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'B2F1', 'B2F1', 10),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'B3F5', 'B3F5', 20),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'FIXROOM', 'Fixture room', 30);

\set ACTOR '''11111111-1111-1111-1111-111111111111'''
\set L1    '''aaaaaaaa-0000-0000-0000-000000000001'''
\set L2    '''aaaaaaaa-0000-0000-0000-000000000002'''
\set L3    '''aaaaaaaa-0000-0000-0000-000000000003'''

-- Cây:  M1(L1) -> B1 -> F1 -> E1        M2(L2) -> B2
insert into public.equipment (id, serial_number, types, current_location_id, parent_id) values
  ('e0000000-0000-0000-0000-00000000000a', 'M1', 'Machine', :L1, null),
  ('e0000000-0000-0000-0000-00000000000b', 'B1', 'Base',    :L1, 'e0000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-00000000000c', 'F1', 'Fixture', :L1, 'e0000000-0000-0000-0000-00000000000b'),
  ('e0000000-0000-0000-0000-00000000000d', 'E1', 'Equipment',:L1,'e0000000-0000-0000-0000-00000000000c'),
  ('e0000000-0000-0000-0000-00000000000e', 'M2', 'Machine', :L2, null),
  ('e0000000-0000-0000-0000-00000000000f', 'B2', 'Base',    :L2, 'e0000000-0000-0000-0000-00000000000e');

\set M1 '''e0000000-0000-0000-0000-00000000000a'''
\set B1 '''e0000000-0000-0000-0000-00000000000b'''
\set F1 '''e0000000-0000-0000-0000-00000000000c'''
\set E1 '''e0000000-0000-0000-0000-00000000000d'''
\set M2 '''e0000000-0000-0000-0000-00000000000e'''
\set B2 '''e0000000-0000-0000-0000-00000000000f'''

-- ---------------------------------------------------------------------------
\echo '--- T1  Hierarchy helpers'
-- ---------------------------------------------------------------------------
select test_assert(array_length(internal_subtree_ids(:M1),1) = 4, 'T1.1 subtree(M1) = 4 node');
select test_assert(array_length(internal_ancestor_ids(:E1),1) = 3, 'T1.2 ancestors(E1) = 3 node');
select test_assert((select count(*) from get_equipment_descendants(:M1)) = 3, 'T1.3 descendants(M1) = 3');
select test_assert((select count(*) from get_equipment_ancestors(:E1)) = 3, 'T1.4 get_ancestors(E1) = 3');
select test_assert((select depth from get_equipment_ancestors(:E1) where serial_number='M1') = 3,
                   'T1.5 depth(M1 so với E1) = 3');

-- ---------------------------------------------------------------------------
\echo '--- T2  MOVE + cascade location'
-- ---------------------------------------------------------------------------
-- B1 (đang ở L1, có F1, E1) move sang dưới M2 (L2) → cả subtree đổi sang L2
select test_assert(
  (move_equipment(:B1, :M2, 1, :ACTOR, 'req-t2') ->> 'affected_descendants')::int = 2,
  'T2.1 affected_descendants = 2 (F1, E1)');
select test_assert((select current_location_id from equipment where id = :B1) = :L2, 'T2.2 B1 -> L2');
select test_assert((select current_location_id from equipment where id = :E1) = :L2, 'T2.3 E1 cascade -> L2');
select test_assert((select version from equipment where id = :B1) = 2, 'T2.4 B1 version bump = 2');
-- MẤU CHỐT: descendants KHÔNG bump version (mục 23)
select test_assert((select version from equipment where id = :E1) = 1,
                   'T2.5 descendant KHÔNG bump version');
select test_assert((select count(*) from audit_log
                     where action='MOVE_CASCADE' and request_id='req-t2') = 2,
                   'T2.6 ghi 2 MOVE_CASCADE');
select test_assert((select count(*) from audit_log
                     where action='MOVE' and entity_id = :B1) = 1, 'T2.7 ghi 1 MOVE');

-- ---------------------------------------------------------------------------
\echo '--- T3  Cycle prevention'
-- ---------------------------------------------------------------------------
-- cây hiện tại: M2 -> B1 -> F1 -> E1 ; M2 -> B2 ; M1 trơ trọi
select test_raises(format('select move_equipment(%L,%L,3,%L,%L)', :M2, :E1, :ACTOR, 'req-t3'),
                   'PARENT_CYCLE_DETECTED', 'T3.1 move ancestor xuống descendant');
select test_raises(format('select move_equipment(%L,%L,1,%L,%L)', :B2, :B2, :ACTOR, 'req-t3'),
                   'PARENT_CYCLE_DETECTED', 'T3.2 move vào chính nó');

-- ---------------------------------------------------------------------------
\echo '--- T4  Optimistic concurrency'
-- ---------------------------------------------------------------------------
select test_raises(format('select move_equipment(%L,%L,99,%L,%L)', :B2, :M1, :ACTOR, 'req-t4'),
                   'OPTIMISTIC_CONFLICT', 'T4.1 version sai -> OPTIMISTIC_CONFLICT');
select test_raises(format('select update_equipment_with_audit(%L,99,%L,%L,%L)',
                          :B2, '{"remark":"x"}', :ACTOR, 'req-t4'),
                   'OPTIMISTIC_CONFLICT', 'T4.2 PUT version sai');

-- ---------------------------------------------------------------------------
\echo '--- T5  UPDATE whitelist (không cho đổi location/parent qua PUT)'
-- ---------------------------------------------------------------------------
select test_raises(format('select update_equipment_with_audit(%L,1,%L,%L,%L)',
                          :B2, format('{"current_location_id":"%s"}', :L3), :ACTOR, 'req-t5'),
                   'VALIDATION_ERROR', 'T5.1 PUT current_location_id bị chặn');
select test_raises(format('select update_equipment_with_audit(%L,1,%L,%L,%L)',
                          :B2, format('{"parent_id":"%s"}', :M1), :ACTOR, 'req-t5'),
                   'VALIDATION_ERROR', 'T5.2 PUT parent_id bị chặn');
select test_raises(format('select update_equipment_with_audit(%L,1,%L,%L,%L)',
                          :B2, '{"version":5}', :ACTOR, 'req-t5'),
                   'VALIDATION_ERROR', 'T5.3 PUT system field bị chặn');

-- PUT hợp lệ + audit diff
select update_equipment_with_audit(:B2, 1, '{"status":"Active","remark":"ok"}', :ACTOR, 'req-t5b');
select test_assert((select version from equipment where id = :B2) = 2, 'T5.4 PUT bump version');
select test_assert(
  (select changes -> 'status' ->> 'new' from audit_log
    where action='UPDATE' and entity_id = :B2) = 'Active', 'T5.5 audit changes {old,new}');
-- PUT không đổi gì thì không ghi audit UPDATE thừa
select update_equipment_with_audit(:B2, 2, '{"status":"Active"}', :ACTOR, 'req-t5c');
select test_assert((select count(*) from audit_log where request_id='req-t5c') = 0,
                   'T5.6 không đổi giá trị -> không ghi audit');

-- ---------------------------------------------------------------------------
\echo '--- T6  CHANGE LOCATION'
-- ---------------------------------------------------------------------------
-- B1 đang có parent M2 → phải bị chặn
select test_raises(format('select change_location_equipment(%L,%L,2,%L,%L)', :B1, :L3, :ACTOR, 'req-t6'),
                   'LOCATION_INHERITED_READ_ONLY', 'T6.1 child không đổi location trực tiếp');
-- M2 là root → cho phép, cascade xuống B1/F1/E1/B2
select test_assert(
  (change_location_equipment(:M2, :L3, 1, :ACTOR, 'req-t6b') ->> 'affected_descendants')::int = 4,
  'T6.2 cascade 4 descendants');
select test_assert((select count(*) from equipment
                     where current_location_id = :L3 and archived_at is null) = 5,
                   'T6.3 M2 + 4 con đều ở L3');

-- ---------------------------------------------------------------------------
\echo '--- T7  DETACH (giữ location, không cascade)'
-- ---------------------------------------------------------------------------
select detach_equipment(:B1, (select version from equipment where id=:B1), :ACTOR, 'req-t7');
select test_assert((select parent_id from equipment where id = :B1) is null, 'T7.1 parent_id = null');
select test_assert((select current_location_id from equipment where id = :B1) = :L3,
                   'T7.2 giữ location cũ');
select test_assert((select count(*) from audit_log where request_id='req-t7' and action='MOVE_CASCADE') = 0,
                   'T7.3 detach KHÔNG cascade');

-- ---------------------------------------------------------------------------
\echo '--- T8  SWAP'
-- ---------------------------------------------------------------------------
-- dựng lại: M1(L1) -> X ; M2(L3) -> B2 ; B1(L3, root) -> F1 -> E1
select move_equipment(:B1, :M1, (select version from equipment where id=:B1), :ACTOR, 'req-t8a');
select test_assert((select current_location_id from equipment where id = :E1) = :L1,
                   'T8.1 subtree B1 theo M1 về L1');

-- swap ancestor/descendant phải bị chặn
select test_raises(format('select swap_equipment(%L,%L,%s,%s,%L,%L)', :B1, :E1,
                          (select version from equipment where id=:B1),
                          (select version from equipment where id=:E1), :ACTOR, 'req-t8'),
                   'SWAP_INVALID_ANCESTOR_RELATION', 'T8.2 swap ancestor/descendant');
select test_raises(format('select swap_equipment(%L,%L,1,1,%L,%L)', :B2, :B2, :ACTOR, 'req-t8'),
                   'SWAP_INVALID', 'T8.3 swap chính nó');

-- swap hợp lệ: B1 (dưới M1, L1, có F1+E1)  <->  B2 (dưới M2, L3)
select swap_equipment(:B1, :B2,
                      (select version from equipment where id=:B1),
                      (select version from equipment where id=:B2),
                      :ACTOR, 'req-t8c');
select test_assert((select parent_id from equipment where id = :B1) = :M2, 'T8.4 B1 -> M2');
select test_assert((select parent_id from equipment where id = :B2) = :M1, 'T8.5 B2 -> M1');
select test_assert((select current_location_id from equipment where id = :E1) = :L3,
                   'T8.6 subtree của B1 đi cùng sang L3');
select test_assert((select current_location_id from equipment where id = :B2) = :L1,
                   'T8.7 B2 sang L1');
select test_assert((select parent_id from equipment where id = :F1) = :B1,
                   'T8.8 F1 vẫn thuộc B1 (subtree không bị tách)');

-- ---------------------------------------------------------------------------
\echo '--- T9  ARCHIVE / RESTORE'
-- ---------------------------------------------------------------------------
select test_raises(format('select archive_equipment(%L,%s,%L,%L)', :B1,
                          (select version from equipment where id=:B1), :ACTOR, 'req-t9'),
                   'ARCHIVE_BLOCKED_HAS_CHILDREN', 'T9.1 archive parent còn child');

-- thanh lý cả cụm từ dưới lên: E1 -> F1 -> B1
select archive_equipment(:E1, (select version from equipment where id=:E1), :ACTOR, 'req-t9a');
select archive_equipment(:F1, (select version from equipment where id=:F1), :ACTOR, 'req-t9b');
select test_assert(
  (archive_equipment(:B1, (select version from equipment where id=:B1), :ACTOR, 'req-t9c')
   ->> 'archived')::boolean, 'T9.2 archive được khi mọi child đã archive');

select test_raises(format('select archive_equipment(%L,%s,%L,%L)', :B1,
                          (select version from equipment where id=:B1), :ACTOR, 'req-t9'),
                   'EQUIPMENT_ARCHIVED', 'T9.3 archive 2 lần');
select test_raises(format('select restore_equipment(%L,%s,%L,%L)', :F1,
                          (select version from equipment where id=:F1), :ACTOR, 'req-t9'),
                   'MOVE_TARGET_ARCHIVED', 'T9.4 restore khi parent còn archived');

select restore_equipment(:B1, (select version from equipment where id=:B1), :ACTOR, 'req-t9d');
select test_assert((select archived_at from equipment where id = :B1) is null, 'T9.5 restore OK');
select test_raises(format('select restore_equipment(%L,%s,%L,%L)', :B1,
                          (select version from equipment where id=:B1), :ACTOR, 'req-t9'),
                   'EQUIPMENT_NOT_ARCHIVED', 'T9.6 restore cái chưa archive');

-- ---------------------------------------------------------------------------
\echo '--- T10  Archived descendant KHÔNG bị cascade (mục 20)'
-- ---------------------------------------------------------------------------
-- hiện tại: M2 -> B1 -> F1(archived) -> E1(archived).  M2 đang ở L3.
select test_assert((select archived_at from equipment where id = :F1) is not null, 'T10.0 F1 đang archived');
select change_location_equipment(:M2, :L2, (select version from equipment where id=:M2), :ACTOR, 'req-t10');
select test_assert((select current_location_id from equipment where id = :B1) = :L2,
                   'T10.1 B1 (chưa archive) cascade sang L2');
select test_assert((select current_location_id from equipment where id = :F1) = :L3,
                   'T10.2 F1 (đã archive) GIỮ NGUYÊN location cũ');
select test_assert((select current_location_id from equipment where id = :E1) = :L3,
                   'T10.3 E1 (đã archive) GIỮ NGUYÊN location cũ');

-- ---------------------------------------------------------------------------
\echo '--- T11  Move vào parent đã archive'
-- ---------------------------------------------------------------------------
select test_raises(format('select move_equipment(%L,%L,%s,%L,%L)', :B2, :F1,
                          (select version from equipment where id=:B2), :ACTOR, 'req-t11'),
                   'MOVE_TARGET_ARCHIVED', 'T11.1 move vào parent archived');
select test_raises(format('select move_equipment(%L,%L,%s,%L,%L)', :B2,
                          'e0000000-0000-0000-0000-0000000000ff',
                          (select version from equipment where id=:B2), :ACTOR, 'req-t11'),
                   'PARENT_NOT_FOUND', 'T11.2 parent không tồn tại');

-- ---------------------------------------------------------------------------
\echo '--- T12  CREATE'
-- ---------------------------------------------------------------------------
select test_assert(
  (create_equipment_with_audit(
     format('{"serial_number":"NEW1","types":"Fixture","current_location_id":"%s"}', :L1)::jsonb,
     :ACTOR, 'req-t12')  ->> 'serial_number') = 'NEW1', 'T12.1 create root');
select test_assert(
  (create_equipment_with_audit(
     format('{"serial_number":"NEW2","parent_id":"%s"}', :M1)::jsonb,
     :ACTOR, 'req-t12b') ->> 'current_location_id') =
  (select current_location_id::text from equipment where id = :M1),
  'T12.2 create có parent -> location kế thừa');
select test_raises('select create_equipment_with_audit(''{"serial_number":"NEW3"}''::jsonb,'
                   || quote_literal(:ACTOR) || ',''req-t12'')',
                   'LOCATION_REQUIRED', 'T12.3 root thiếu location');
select test_assert((select count(*) from audit_log where action='CREATE' and request_id='req-t12') = 1,
                   'T12.4 ghi audit CREATE');

-- ---------------------------------------------------------------------------
\echo '--- T13  Depth limit (chống cycle dữ liệu / cây quá sâu)'
-- ---------------------------------------------------------------------------
do $$
declare
  v_prev uuid;
  v_id   uuid;
  v_loc  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  v_prev := null;
  for i in 1..55 loop
    insert into public.equipment (serial_number, current_location_id, parent_id)
    values ('DEEP' || i, v_loc, v_prev) returning id into v_id;
    v_prev := v_id;
  end loop;
end $$;

select test_raises('select internal_subtree_ids((select id from equipment where serial_number=''DEEP1''))',
                   'DEPTH_LIMIT_EXCEEDED', 'T13.1 subtree 55 tầng -> DEPTH_LIMIT_EXCEEDED');
select test_raises('select internal_ancestor_ids((select id from equipment where serial_number=''DEEP55''))',
                   'DEPTH_LIMIT_EXCEEDED', 'T13.2 ancestors 55 tầng -> DEPTH_LIMIT_EXCEEDED');
select test_assert((select count(*) from internal_subtree_ids(
                     (select id from equipment where serial_number='DEEP10')) ) >= 0,
                   'T13.3 cây <=45 tầng vẫn chạy bình thường');

-- ---------------------------------------------------------------------------
\echo '--- T14  Natural sort key'
-- ---------------------------------------------------------------------------
-- Sort chuỗi thuần: 'DEEP10' < 'DEEP9'  (sai với kỳ vọng của user)
-- Sort qua serial_sort: DEEP9 < DEEP10  (đúng)
select test_assert(
  (select serial_number from equipment where serial_number='DEEP10') <
  (select serial_number from equipment where serial_number='DEEP9'),
  'T14.0 sort chuỗi thuần đặt DEEP10 trước DEEP9 (đây là lỗi cần tránh)');
select test_assert(
  (select serial_sort from equipment where serial_number='DEEP9') <
  (select serial_sort from equipment where serial_number='DEEP10'),
  'T14.1 serial_sort đặt DEEP9 TRƯỚC DEEP10 (natural sort đúng)');
select test_assert(
  (select string_agg(serial_number, ',' order by serial_sort)
     from equipment where serial_number in ('DEEP1','DEEP2','DEEP10','DEEP11'))
  = 'DEEP1,DEEP2,DEEP10,DEEP11',
  'T14.2 thứ tự đầy đủ: 1,2,10,11');

-- ---------------------------------------------------------------------------
\echo '--- T15  Ràng buộc DB'
-- ---------------------------------------------------------------------------
select test_raises(format('update equipment set parent_id = id where id = %L', :M1),
                   'new row for relation "equipment" violates check constraint "equipment_no_self_parent"',
                   'T15.1 check self-parent ở tầng DB');

\echo ''
\echo '================= TẤT CẢ TEST ĐÃ PASS ================='
