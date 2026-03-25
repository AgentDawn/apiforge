import { CollectionManager, FileStorage } from '@apiforge/core';

/**
 * apiforge spec <subcommand>
 *   list             - List imported specs/collections
 *   show <name>      - Show endpoints in a collection
 */
export async function specCommand(args, dataDir) {
  const sub = args[0];
  const storage = new FileStorage(`${dataDir}/data`);
  const collectionManager = new CollectionManager(storage);

  switch (sub) {
    case 'list': {
      const collections = await collectionManager.list();
      if (collections.length === 0) {
        console.log('No specs imported. Import one with: apiforge import <file|url>');
        return;
      }
      console.log('Imported specs:');
      for (const col of collections) {
        console.log(`  ${col.name}`);
      }
      break;
    }

    case 'show': {
      const name = args[1];
      if (!name) { console.error('Usage: apiforge spec show <name>'); process.exit(1); }
      const col = await collectionManager.getByName(name);
      if (!col) { console.error(`Not found: ${name}`); process.exit(1); }

      console.log(`${col.name} (v${col.version})`);
      if (col.description) console.log(`  ${col.description}`);
      console.log('');

      for (const item of col.items) {
        if (item.type === 'folder') {
          console.log(`  [${item.name}]`);
          for (const req of item.items || []) {
            if (req.type === 'request' && req.request) {
              const method = req.request.method.padEnd(7);
              console.log(`    ${method} ${req.request.name}`);
            }
          }
        } else if (item.type === 'request' && item.request) {
          const method = item.request.method.padEnd(7);
          console.log(`  ${method} ${item.request.name}`);
        }
      }
      break;
    }

    default:
      console.error('Usage: apiforge spec <list|show>');
      process.exit(1);
  }
}
