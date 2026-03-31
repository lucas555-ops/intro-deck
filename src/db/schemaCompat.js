const schemaCompatCache = new WeakMap();

export async function getSchemaCompat(client) {
  if (schemaCompatCache.has(client)) {
    return schemaCompatCache.get(client);
  }

  const result = await client.query(`
    select
      exists (
        select 1
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'member_profiles'
          and column_name = 'telegram_username_hidden'
      ) as member_profiles_has_hidden_telegram_username,
      exists (
        select 1
        from information_schema.tables
        where table_schema = current_schema()
          and table_name = 'contact_unlock_requests'
      ) as has_contact_unlock_requests_table
  `);

  const compat = {
    memberProfilesHasHiddenTelegramUsername: Boolean(result.rows[0]?.member_profiles_has_hidden_telegram_username),
    hasContactUnlockRequestsTable: Boolean(result.rows[0]?.has_contact_unlock_requests_table)
  };

  schemaCompatCache.set(client, compat);
  return compat;
}

export function selectHiddenTelegramUsername(alias, compat) {
  if (compat?.memberProfilesHasHiddenTelegramUsername) {
    return `${alias}.telegram_username_hidden`;
  }

  return `null::text`;
}
