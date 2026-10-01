export function postgresRestoreCommandArgs() {
  return [
    'compose', 'exec', '-T', '-e', 'RESTORE_TARGET_URL', 'postgres', 'sh', '-lc',
    'psql "$RESTORE_TARGET_URL" --no-psqlrc --set=ON_ERROR_STOP=1',
  ];
}
