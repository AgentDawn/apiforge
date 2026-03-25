import { EnvironmentManager, FileStorage } from '@apiforge/core';

/**
 * apiforge env <subcommand>
 *   list                  - List all environments
 *   show <name>           - Show environment variables
 *   create <name>         - Create new environment (--set key=value)
 *   set <name> <key> <val> - Set a variable
 *   use <name>            - Set active environment
 *   delete <name>         - Delete environment
 */
export async function envCommand(args, dataDir) {
  const sub = args[0];
  const storage = new FileStorage(`${dataDir}/data`);
  const envManager = new EnvironmentManager(storage);

  switch (sub) {
    case 'list': {
      const envs = await envManager.list();
      const active = await envManager.getActive();
      if (envs.length === 0) {
        console.log('No environments. Create one with: apiforge env create <name>');
        return;
      }
      for (const env of envs) {
        const marker = active?.id === env.id ? ' (active)' : '';
        console.log(`  ${env.name}${marker}`);
      }
      break;
    }

    case 'show': {
      const name = args[1];
      if (!name) { console.error('Usage: apiforge env show <name>'); process.exit(1); }
      const env = await envManager.getByName(name);
      if (!env) { console.error(`Environment not found: ${name}`); process.exit(1); }
      console.log(`Environment: ${env.name}`);
      for (const v of env.variables) {
        const status = v.enabled ? '' : ' (disabled)';
        const secret = v.type === 'secret' ? ' [secret]' : '';
        console.log(`  ${v.key} = ${v.value}${secret}${status}`);
      }
      break;
    }

    case 'create': {
      const name = args[1];
      if (!name) { console.error('Usage: apiforge env create <name> [--set key=value ...]'); process.exit(1); }
      const vars = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--set' && args[i + 1]) {
          const [key, ...rest] = args[i + 1].split('=');
          vars[key] = rest.join('=');
          i++;
        }
      }
      const env = await envManager.create(name, vars);
      console.log(`Created environment: ${env.name} (${env.id})`);
      if (Object.keys(vars).length > 0) {
        for (const [key, value] of Object.entries(vars)) {
          console.log(`  ${key} = ${value}`);
        }
      }
      break;
    }

    case 'set': {
      const name = args[1], key = args[2], value = args[3];
      if (!name || !key || value === undefined) {
        console.error('Usage: apiforge env set <name> <key> <value>');
        process.exit(1);
      }
      const env = await envManager.getByName(name);
      if (!env) { console.error(`Environment not found: ${name}`); process.exit(1); }
      await envManager.setVariable(env.id, key, value);
      console.log(`Set ${key} = ${value} in ${name}`);
      break;
    }

    case 'use': {
      const name = args[1];
      if (!name) { console.error('Usage: apiforge env use <name>'); process.exit(1); }
      const env = await envManager.getByName(name);
      if (!env) { console.error(`Environment not found: ${name}`); process.exit(1); }
      await envManager.setActive(env.id);
      console.log(`Active environment: ${name}`);
      break;
    }

    case 'delete': {
      const name = args[1];
      if (!name) { console.error('Usage: apiforge env delete <name>'); process.exit(1); }
      const env = await envManager.getByName(name);
      if (!env) { console.error(`Environment not found: ${name}`); process.exit(1); }
      await envManager.delete(env.id);
      console.log(`Deleted environment: ${name}`);
      break;
    }

    default:
      console.error('Usage: apiforge env <list|show|create|set|use|delete>');
      process.exit(1);
  }
}
